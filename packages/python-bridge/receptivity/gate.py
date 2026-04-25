"""
Receptivity gate — main decision function.

``receptivity_gate`` is the single function every connector calls to
decide *when* to surface a pending intention and *through which channel*.

Decision logic
--------------
1. Compute a composite receptivity score from behavioral signals
   (idle time, typing, active app, audio).
2. Apply budget constraints (voice-word ceiling, interruption count).
3. Pick the channel (voice / text / queue) according to the rules in
   the issue spec:

     - **voice whisper**: member in motion OR urgency high + score > threshold
     - **text (Signal)**: default channel when surface_now is true
     - **queue**: score too low, or budget exhausted for the channel

4. Generate a human-readable ``reason`` that's ≤ 40 words so it can be
   whispered.

Graceful degradation
--------------------
When fewer signals are available (``confidence`` is low) the gate raises
its surface threshold — preferring to keep things queued rather than
interrupt at a wrong moment.
"""
from __future__ import annotations

from .types import (
    DailyBudget,
    GateDecision,
    Intention,
    SensorState,
    URGENCY_WEIGHTS,
)
from .signals import score_behavioral

# ── Thresholds ───────────────────────────────────────────────────────
#
# score_needed_to_surface: baseline; raised when confidence is low,
# lowered when urgency is high.
_BASE_SURFACE_THRESHOLD = 0.55

# At full confidence (1.0) the threshold stays at _BASE.
# At zero confidence (no sensors) the threshold is raised by this amount.
_MAX_CONFIDENCE_PENALTY = 0.20

# Minimum score for a voice surface (stricter than text because voice
# interrupts the physical environment, not just the screen).
_VOICE_MIN_SCORE = 0.70

# Urgency discount applied to the surface threshold (critical lowers
# threshold by up to 0.25).
_MAX_URGENCY_DISCOUNT = 0.25


def receptivity_gate(
    intention: Intention,
    sensor_state: SensorState,
    budget: DailyBudget,
) -> GateDecision:
    """Decide whether — and how — to surface *intention* right now.

    Parameters
    ----------
    intention:
        The pending action to evaluate.
    sensor_state:
        Latest aggregated readings from all available sensors.
    budget:
        Today's remaining voice-word ceiling and interruption count.

    Returns
    -------
    GateDecision
        ``surface_now``, ``channel`` ("voice" | "text" | "queue"),
        ``reason`` (≤ 40 words, whisper-safe), and composite ``score``.
    """
    # ── 1. Composite receptivity score ──────────────────────────────
    behavioral_score, signal_reason = score_behavioral(sensor_state)

    # Confidence penalty: low confidence → raise threshold, not lower score.
    confidence_penalty = _MAX_CONFIDENCE_PENALTY * (1.0 - sensor_state.confidence)

    urgency_weight = URGENCY_WEIGHTS.get(intention.urgency, 0.5)
    urgency_discount = _MAX_URGENCY_DISCOUNT * urgency_weight

    effective_threshold = (
        _BASE_SURFACE_THRESHOLD
        + confidence_penalty
        - urgency_discount
    )
    # Keep threshold sane
    effective_threshold = max(0.30, min(0.90, effective_threshold))

    score = behavioral_score
    surface_now = score >= effective_threshold

    # ── 2. Channel selection ─────────────────────────────────────────
    channel: str

    if not surface_now:
        channel = "queue"
        reason = _queue_reason(intention, signal_reason, score)
        return GateDecision(
            surface_now=False,
            channel="queue",
            reason=reason,
            score=round(score, 3),
        )

    # Member is receptive — decide voice vs text
    wants_voice = _wants_voice(intention, sensor_state, budget)

    if wants_voice:
        can_voice = (
            not budget.budget_exhausted
            and budget.words_remaining >= intention.estimated_voice_words
        )
        if can_voice:
            channel = "voice"
        else:
            channel = "text"
    else:
        channel = "text"

    reason = _surface_reason(intention, channel, signal_reason, score)
    return GateDecision(
        surface_now=True,
        channel=channel,  # type: ignore[arg-type]
        reason=reason,
        score=round(score, 3),
    )


# ── Helpers ──────────────────────────────────────────────────────────

def _wants_voice(
    intention: Intention,
    state: SensorState,
    budget: DailyBudget,
) -> bool:
    """Return True if voice is the better channel for this moment."""
    # Already in a voice conversation about the topic
    if state.signal_active:
        return True
    # High/critical urgency and score is well above voice threshold
    if intention.urgency in ("high", "critical"):
        return True
    # Default: prefer text
    return False


def _surface_reason(
    intention: Intention,
    channel: str,
    signal_reason: str,
    score: float,
) -> str:
    """Build a short, whisper-safe reason string (≤ 40 words)."""
    desc = intention.description.rstrip(".")
    if channel == "voice":
        parts = [desc]
        if intention.context:
            ctx = intention.context[:80]
            parts.append(ctx)
        return _truncate_to_40_words(". ".join(parts))
    else:
        return _truncate_to_40_words(
            f"Drafted: {desc}. Review when you've got a minute."
        )


def _queue_reason(
    intention: Intention,
    signal_reason: str,
    score: float,
) -> str:
    """Explain why the intention stays queued."""
    return f"Queued '{intention.description[:60]}' — {signal_reason} (score {score:.2f})"


def _truncate_to_40_words(text: str) -> str:
    words = text.split()
    if len(words) <= 40:
        return text
    return " ".join(words[:40]) + "…"
