"""
Receptivity gate — core types.

Intention     : a pending action the system wants to surface to the member
SensorState   : aggregated reading from all available behavioral sensors
DailyBudget   : remaining voice-word ceiling + interruption count for today
GateDecision  : what to do right now (surface_now, channel, reason)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional


# ── Urgency tiers ───────────────────────────────────────────────────

UrgencyLevel = Literal["low", "normal", "high", "critical"]

URGENCY_WEIGHTS: dict[str, float] = {
    "low": 0.2,
    "normal": 0.5,
    "high": 0.8,
    "critical": 1.0,
}


# ── Intention ───────────────────────────────────────────────────────

@dataclass
class Intention:
    """A pending action the system queued and wants to surface."""

    # Unique identifier for dedup checks
    id: str

    # Human-readable description; used as the basis for the whisper/text reason
    description: str

    # How urgent is this action?  Affects threshold and channel selection.
    urgency: UrgencyLevel = "normal"

    # Caller that originated the intention (e.g. "pact-github-connector")
    source: str = "unknown"

    # Optional extra context the gate may use when composing the reason string
    context: Optional[str] = None

    # Approximate number of voice words required to ask about this intention
    estimated_voice_words: int = 15


# ── Sensor state ────────────────────────────────────────────────────

@dataclass
class SensorState:
    """Snapshot of all available behavioral sensors at decision time.

    Every field is optional — the gate degrades gracefully when sensors
    are unavailable.  A ``confidence`` companion field tracks how many
    signals are actually present so the gate can tighten the threshold
    when flying blind.
    """

    # ── Behavioral tier (always-on, free) ───────────────────────────

    # Seconds since last keyboard/mouse input (from GetLastInputInfo or similar)
    idle_seconds: Optional[float] = None

    # Typing activity in the last 30 s (words-per-minute proxy)
    typing_wpm: Optional[float] = None

    # Active foreground application name
    active_app: Optional[str] = None

    # Is the screen locked?
    screen_locked: Optional[bool] = None

    # Is the member currently in a voice conversation via .HMAN Signal infra?
    signal_active: Optional[bool] = None

    # ── Audio tier (python-bridge AudioSensor) ───────────────────────

    # Room RMS level (0.0–1.0 normalised)
    room_rms: Optional[float] = None

    # Speech-activity detected in the last ~30 s chunk
    speech_active: Optional[bool] = None

    # ── Calendar tier (contextual) ───────────────────────────────────

    # Is the member marked as in-meeting right now?
    in_meeting: Optional[bool] = None

    # ── Derived confidence (0.0–1.0) ─────────────────────────────────

    # Fraction of behavioural signals available (computed by aggregate_signals)
    confidence: float = 0.0


# ── Daily budget ────────────────────────────────────────────────────

@dataclass
class DailyBudget:
    """Voice-word budget for the current calendar day.

    The 40-word/day ceiling is a first-class constraint that keeps .HMAN
    from becoming another notification layer.
    """

    # Hard ceiling (words/day).  Default 40 per the spec.
    daily_word_limit: int = 40

    # Words already spoken aloud today (loaded from persistent store)
    words_used_today: int = 0

    # Number of voice interruptions today (a separate pacing signal)
    interruptions_today: int = 0

    # Maximum number of interruptions per day before voice is silenced
    max_interruptions: int = 5

    @property
    def words_remaining(self) -> int:
        return max(0, self.daily_word_limit - self.words_used_today)

    @property
    def budget_exhausted(self) -> bool:
        return self.words_remaining == 0 or self.interruptions_today >= self.max_interruptions


# ── Gate decision ────────────────────────────────────────────────────

@dataclass
class GateDecision:
    """Decision produced by ``receptivity_gate``.

    surface_now : whether to surface the intention immediately
    channel     : how to deliver it ("voice", "text", "queue")
    reason      : human-readable rationale; suitable for voice whisper when channel=="voice"
    score       : composite receptivity score [0.0, 1.0]
    """

    surface_now: bool
    channel: Literal["voice", "text", "queue"]
    reason: str
    score: float = 0.0
