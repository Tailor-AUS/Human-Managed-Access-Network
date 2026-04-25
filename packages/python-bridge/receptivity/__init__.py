"""receptivity — channel-aware consent gate for .HMAN.

Public API::

    from receptivity import receptivity_gate, aggregate_signals, load_budget, record_voice_usage
    from receptivity.types import Intention, SensorState, DailyBudget, GateDecision
"""
from __future__ import annotations

from .gate import receptivity_gate
from .signals import aggregate_signals
from .budget import load_budget, record_voice_usage
from .types import Intention, SensorState, DailyBudget, GateDecision

__all__ = [
    "receptivity_gate",
    "aggregate_signals",
    "load_budget",
    "record_voice_usage",
    "Intention",
    "SensorState",
    "DailyBudget",
    "GateDecision",
]
