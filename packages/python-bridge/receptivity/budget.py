"""
Daily voice-word budget — persisted in ~/.hman/receptivity_budget.json.

The budget resets at midnight (UTC).  A single JSON file holds today's
date and the counters.  All writes are atomic (write-then-rename) so a
crash mid-write never corrupts the file.
"""
from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .types import DailyBudget

_DATA_ENV = os.environ.get("HMAN_DATA_DIR")
_HMAN_DIR = Path(_DATA_ENV).expanduser().resolve() if _DATA_ENV else Path.home() / ".hman"
_BUDGET_FILE = _HMAN_DIR / "receptivity_budget.json"

_DEFAULT_DAILY_LIMIT = 40
_DEFAULT_MAX_INTERRUPTIONS = 5


def _today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def load_budget(
    daily_word_limit: int = _DEFAULT_DAILY_LIMIT,
    max_interruptions: int = _DEFAULT_MAX_INTERRUPTIONS,
) -> DailyBudget:
    """Load the current daily budget from disk, resetting if the date changed."""
    today = _today_str()
    if _BUDGET_FILE.exists():
        try:
            data = json.loads(_BUDGET_FILE.read_text(encoding="utf-8"))
            if data.get("date") == today:
                return DailyBudget(
                    daily_word_limit=data.get("daily_word_limit", daily_word_limit),
                    words_used_today=data.get("words_used_today", 0),
                    interruptions_today=data.get("interruptions_today", 0),
                    max_interruptions=data.get("max_interruptions", max_interruptions),
                )
        except Exception:
            pass

    # New day (or corrupt file) — start fresh
    budget = DailyBudget(
        daily_word_limit=daily_word_limit,
        words_used_today=0,
        interruptions_today=0,
        max_interruptions=max_interruptions,
    )
    _save_budget(budget, today)
    return budget


def record_voice_usage(words: int, budget: Optional[DailyBudget] = None) -> DailyBudget:
    """Record ``words`` spoken aloud and persist.  Returns the updated budget."""
    today = _today_str()
    b = budget or load_budget()
    updated = DailyBudget(
        daily_word_limit=b.daily_word_limit,
        words_used_today=b.words_used_today + max(0, words),
        interruptions_today=b.interruptions_today + 1,
        max_interruptions=b.max_interruptions,
    )
    _save_budget(updated, today)
    return updated


def _save_budget(budget: DailyBudget, date_str: str) -> None:
    """Atomically write budget to disk."""
    _HMAN_DIR.mkdir(parents=True, exist_ok=True)
    data = {
        "date": date_str,
        "daily_word_limit": budget.daily_word_limit,
        "words_used_today": budget.words_used_today,
        "interruptions_today": budget.interruptions_today,
        "max_interruptions": budget.max_interruptions,
    }
    # Write to a temp file in the same directory, then rename (atomic on POSIX)
    fd, tmp_path = tempfile.mkstemp(dir=str(_HMAN_DIR), suffix=".json.tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f)
        os.replace(tmp_path, str(_BUDGET_FILE))
    except Exception:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        raise
