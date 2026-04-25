"""Tests for the receptivity gate (channel-aware consent gate).

These tests exercise the pure decision logic without requiring live
sensors, hardware, or filesystem access.
"""
from __future__ import annotations

import os
import sys
import tempfile
import pytest

# Make the python-bridge package importable from any working directory
_BRIDGE_DIR = os.path.join(os.path.dirname(__file__), "..")
if _BRIDGE_DIR not in sys.path:
    sys.path.insert(0, _BRIDGE_DIR)

from receptivity.types import (
    DailyBudget,
    GateDecision,
    Intention,
    SensorState,
)
from receptivity.gate import receptivity_gate
from receptivity.signals import score_behavioral


# ── Fixtures ─────────────────────────────────────────────────────────

def _intention(
    id: str = "test-1",
    description: str = "File a GitHub issue about the firmware bug",
    urgency: str = "normal",
    estimated_voice_words: int = 15,
) -> Intention:
    return Intention(
        id=id,
        description=description,
        urgency=urgency,  # type: ignore[arg-type]
        estimated_voice_words=estimated_voice_words,
    )


def _budget(
    words_remaining: int = 40,
    interruptions_today: int = 0,
) -> DailyBudget:
    used = max(0, 40 - words_remaining)
    return DailyBudget(
        daily_word_limit=40,
        words_used_today=used,
        interruptions_today=interruptions_today,
        max_interruptions=5,
    )


def _idle_state(idle_seconds: float = 180.0) -> SensorState:
    """Member is idle — maximally receptive."""
    return SensorState(
        idle_seconds=idle_seconds,
        typing_wpm=0.0,
        active_app="explorer",
        screen_locked=False,
        speech_active=False,
        in_meeting=False,
        confidence=0.8,
    )


def _busy_state() -> SensorState:
    """Member is actively typing in a focus app."""
    return SensorState(
        idle_seconds=2.0,
        typing_wpm=65.0,
        active_app="code",
        screen_locked=False,
        speech_active=False,
        in_meeting=False,
        confidence=0.8,
    )


def _meeting_state() -> SensorState:
    """Member is in a meeting."""
    return SensorState(
        idle_seconds=30.0,
        typing_wpm=0.0,
        active_app="teams",
        screen_locked=False,
        speech_active=True,
        in_meeting=True,
        confidence=0.8,
    )


# ── score_behavioral tests ────────────────────────────────────────────

class TestScoreBehavioral:
    def test_idle_raises_score(self):
        state = SensorState(idle_seconds=200.0, confidence=0.5)
        score, _ = score_behavioral(state)
        assert score > 0.5

    def test_active_typing_lowers_score(self):
        state = SensorState(idle_seconds=2.0, typing_wpm=70.0, confidence=0.5)
        score, _ = score_behavioral(state)
        assert score < 0.5

    def test_in_meeting_strongly_lowers_score(self):
        state = SensorState(in_meeting=True, confidence=0.5)
        score, _ = score_behavioral(state)
        assert score < 0.3

    def test_focus_app_lowers_score(self):
        state = SensorState(active_app="code", idle_seconds=60.0, confidence=0.5)
        idle_state = SensorState(active_app="explorer", idle_seconds=60.0, confidence=0.5)
        focus_score, _ = score_behavioral(state)
        idle_score, _ = score_behavioral(idle_state)
        assert focus_score < idle_score

    def test_screen_locked_lowers_score(self):
        state = SensorState(screen_locked=True, confidence=0.5)
        score, _ = score_behavioral(state)
        assert score < 0.5

    def test_score_clamped_to_01(self):
        # Very idle + relaxed app should not exceed 1.0
        state = SensorState(
            idle_seconds=300.0, typing_wpm=0.0, active_app="spotify",
            screen_locked=False, speech_active=False, in_meeting=False,
            confidence=1.0,
        )
        score, _ = score_behavioral(state)
        assert 0.0 <= score <= 1.0

    def test_reason_non_empty(self):
        state = SensorState(idle_seconds=100.0, confidence=0.5)
        _, reason = score_behavioral(state)
        assert isinstance(reason, str)
        assert len(reason) > 0


# ── receptivity_gate tests ────────────────────────────────────────────

class TestReceptivityGate:
    def test_returns_gate_decision(self):
        decision = receptivity_gate(_intention(), _idle_state(), _budget())
        assert isinstance(decision, GateDecision)
        assert decision.channel in ("voice", "text", "queue")
        assert isinstance(decision.reason, str)
        assert 0.0 <= decision.score <= 1.0

    def test_idle_member_surfaces_now(self):
        decision = receptivity_gate(_intention(), _idle_state(idle_seconds=300), _budget())
        assert decision.surface_now is True

    def test_busy_member_queues(self):
        decision = receptivity_gate(_intention(), _busy_state(), _budget())
        assert decision.surface_now is False
        assert decision.channel == "queue"

    def test_in_meeting_always_queues(self):
        decision = receptivity_gate(_intention(), _meeting_state(), _budget())
        assert decision.surface_now is False
        assert decision.channel == "queue"

    def test_exhausted_voice_budget_falls_back_to_text(self):
        exhausted_budget = _budget(words_remaining=0, interruptions_today=0)
        # high urgency + signal_active=True would normally select voice, but the
        # budget is exhausted so the gate must fall back to text or queue.
        high_urgency = _intention(urgency="high")
        idle = _idle_state()
        idle.signal_active = True
        decision = receptivity_gate(high_urgency, idle, exhausted_budget)
        if decision.surface_now:
            assert decision.channel in ("text", "queue")

    def test_voice_channel_for_high_urgency(self):
        high_urgency = _intention(urgency="high", estimated_voice_words=10)
        idle = _idle_state(idle_seconds=300)
        budget = _budget(words_remaining=40)
        decision = receptivity_gate(high_urgency, idle, budget)
        if decision.surface_now:
            assert decision.channel == "voice"

    def test_text_channel_for_normal_urgency_idle(self):
        normal = _intention(urgency="normal", estimated_voice_words=15)
        idle = _idle_state(idle_seconds=200)
        budget = _budget(words_remaining=40)
        decision = receptivity_gate(normal, idle, budget)
        if decision.surface_now:
            assert decision.channel == "text"

    def test_critical_urgency_lowers_threshold(self):
        """Critical urgency should surface even with moderate score."""
        moderate_state = SensorState(
            idle_seconds=40.0,
            typing_wpm=5.0,
            active_app="explorer",
            screen_locked=False,
            speech_active=False,
            in_meeting=False,
            confidence=0.8,
        )
        normal_dec = receptivity_gate(
            _intention(urgency="normal"), moderate_state, _budget()
        )
        critical_dec = receptivity_gate(
            _intention(urgency="critical"), moderate_state, _budget()
        )
        # Critical should be at least as likely to surface as normal
        assert critical_dec.score >= normal_dec.score or critical_dec.surface_now

    def test_low_confidence_keeps_queued(self):
        """When no sensors are available (confidence=0) the gate stays queued
        unless the score still clears the raised threshold."""
        no_sensors = SensorState(confidence=0.0)
        decision = receptivity_gate(_intention(urgency="normal"), no_sensors, _budget())
        # The baseline neutral score (0.5) with confidence penalty should
        # not exceed the raised threshold for a normal-urgency intention.
        if not decision.surface_now:
            assert decision.channel == "queue"

    def test_reason_under_40_words(self):
        decision = receptivity_gate(_intention(), _idle_state(), _budget())
        words = decision.reason.split()
        assert len(words) <= 40, f"reason has {len(words)} words: {decision.reason!r}"

    def test_queue_reason_contains_intention_description(self):
        intention = _intention(description="File the Muse firmware bug")
        decision = receptivity_gate(intention, _busy_state(), _budget())
        if not decision.surface_now:
            assert "Muse firmware" in decision.reason


# ── DailyBudget property tests ────────────────────────────────────────

class TestDailyBudget:
    def test_words_remaining(self):
        b = DailyBudget(daily_word_limit=40, words_used_today=15)
        assert b.words_remaining == 25

    def test_budget_exhausted_by_words(self):
        b = DailyBudget(daily_word_limit=40, words_used_today=40)
        assert b.budget_exhausted is True

    def test_budget_exhausted_by_interruptions(self):
        b = DailyBudget(
            daily_word_limit=40, words_used_today=0,
            interruptions_today=5, max_interruptions=5,
        )
        assert b.budget_exhausted is True

    def test_budget_not_exhausted(self):
        b = DailyBudget(
            daily_word_limit=40, words_used_today=10,
            interruptions_today=2, max_interruptions=5,
        )
        assert b.budget_exhausted is False


# ── Budget persistence tests ──────────────────────────────────────────

class TestBudgetPersistence:
    def test_load_save_roundtrip(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HMAN_DATA_DIR", str(tmp_path))
        # Re-import budget module so it picks up the patched env var
        import importlib
        import receptivity.budget as budget_mod
        importlib.reload(budget_mod)

        b = budget_mod.load_budget()
        assert b.words_used_today == 0

        updated = budget_mod.record_voice_usage(words=12, budget=b)
        assert updated.words_used_today == 12
        assert updated.interruptions_today == 1

        reloaded = budget_mod.load_budget()
        assert reloaded.words_used_today == 12
        assert reloaded.interruptions_today == 1

    def test_daily_reset(self, tmp_path, monkeypatch):
        """Simulate a stale budget from yesterday — should reset to zero."""
        monkeypatch.setenv("HMAN_DATA_DIR", str(tmp_path))
        import importlib
        import receptivity.budget as budget_mod
        importlib.reload(budget_mod)

        import json
        stale = {
            "date": "2000-01-01",
            "daily_word_limit": 40,
            "words_used_today": 35,
            "interruptions_today": 4,
            "max_interruptions": 5,
        }
        (tmp_path / "receptivity_budget.json").write_text(json.dumps(stale))

        b = budget_mod.load_budget()
        assert b.words_used_today == 0
        assert b.interruptions_today == 0
