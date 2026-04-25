"""
Behavioral-tier signal aggregation.

Reads the in-process sensor singletons (keystrokes, screen, audio) and
converts their latest readings into a ``SensorState``.  This is the
only module that touches ``sensors.*`` — the gate logic in ``gate.py``
never imports sensors directly so it can be unit-tested without hardware.

``aggregate_signals()`` is called once per gate evaluation cycle.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from .types import SensorState

if TYPE_CHECKING:
    pass

# Apps that strongly signal focus / deep work.  Interrupting during these
# raises the receptivity threshold.
_FOCUS_APPS = frozenset({
    "code", "cursor", "vim", "nvim", "emacs", "idea", "pycharm",
    "rider", "clion", "goland", "webstorm", "datagrip",
    "word", "excel", "powerpoint", "onenote",
    "terminal", "cmd", "powershell", "wt",        # Windows Terminal
    "zsh", "bash",
})

# Apps that suggest the member is between tasks / relaxed
_RELAXED_APPS = frozenset({
    "spotify", "vlc", "mpv", "netflix", "youtube",
    "slack", "teams", "discord",                  # social
    "explorer", "finder",                          # file browser
})


def aggregate_signals() -> SensorState:
    """Collect the latest sensor readings and return a ``SensorState``.

    Imports sensors lazily so this module can be imported in test
    environments that don't have the full sensor stack available.
    """
    state = SensorState()
    available_fields = 0
    total_fields = 5  # idle, typing, active_app, screen_locked, audio

    # ── Keystroke sensor ────────────────────────────────────────────
    try:
        import sensors as _sensors  # noqa: PLC0415
        ks = _sensors.get("keystrokes")
        if ks is not None and ks.available():
            summary = ks.summary()
            state.typing_wpm = float(summary.get("wpm", 0.0))
            last_ago = float(summary.get("last_key_ago_s", 999.0))
            state.idle_seconds = last_ago
            available_fields += 2
    except Exception:
        pass

    # ── Screen sensor ───────────────────────────────────────────────
    try:
        import sensors as _sensors  # noqa: F811,PLC0415
        sc = _sensors.get("screen")
        if sc is not None and sc.available():
            summary = sc.summary()
            state.active_app = summary.get("active_app", "").lower().strip() or None
            state.screen_locked = bool(summary.get("on_break", False))
            available_fields += 1
    except Exception:
        pass

    # ── Audio sensor ────────────────────────────────────────────────
    try:
        import sensors as _sensors  # noqa: F811,PLC0415
        au = _sensors.get("audio")
        if au is not None and au.available() and au.running:
            summary = au.summary()
            state.room_rms = float(summary.get("current_rms", 0.0))
            # Speech is active when the RMS is above the silence threshold
            state.speech_active = state.room_rms > 0.002
            available_fields += 1
    except Exception:
        pass

    # ── Signal-active flag (placeholder, wired to bridge.ts in future) ──
    # For v0 we leave this as None (unknown); the gate treats None conservatively.
    state.signal_active = None

    state.confidence = available_fields / total_fields
    return state


def score_behavioral(state: SensorState) -> tuple[float, str]:
    """Return a (receptivity_score, reason_fragment) from behavioral signals.

    Score is in [0.0, 1.0] where 1.0 = maximally receptive.

    The score is intentionally conservative: we'd rather defer and re-
    evaluate than interrupt the member at a bad moment.
    """
    score = 0.5  # neutral baseline
    reasons: list[str] = []

    # ── Idle time ───────────────────────────────────────────────────
    if state.idle_seconds is not None:
        idle = state.idle_seconds
        if idle > 120:
            score += 0.25
            reasons.append(f"idle {int(idle)}s")
        elif idle > 30:
            score += 0.10
            reasons.append(f"idle {int(idle)}s")
        elif idle < 5:
            score -= 0.25
            reasons.append("actively typing")

    # ── Typing activity ─────────────────────────────────────────────
    if state.typing_wpm is not None:
        if state.typing_wpm > 40:
            score -= 0.20
            reasons.append(f"typing {state.typing_wpm:.0f} wpm")
        elif state.typing_wpm > 20:
            score -= 0.10

    # ── Active application ──────────────────────────────────────────
    if state.active_app:
        app = state.active_app
        if any(app.startswith(f) for f in _FOCUS_APPS):
            score -= 0.15
            reasons.append(f"in {app}")
        elif any(app.startswith(r) for r in _RELAXED_APPS):
            score += 0.10
            reasons.append(f"in {app}")

    # ── Screen locked → break time, member not at desk ──────────────
    if state.screen_locked:
        score -= 0.30
        reasons.append("screen locked / on break")

    # ── Audio / speech activity ─────────────────────────────────────
    if state.speech_active:
        score -= 0.20
        reasons.append("speech detected")

    # ── In-meeting ───────────────────────────────────────────────────
    if state.in_meeting:
        score -= 0.40
        reasons.append("in meeting")

    score = max(0.0, min(1.0, score))
    reason_str = ", ".join(reasons) if reasons else "no signal"
    return score, reason_str
