"""Keystroke sensor — polls Win32 GetAsyncKeyState every 150ms.

Writes one row every FLUSH_SECONDS summarising the window: wpm, keys,
typos, dictation-state, and the set of recent words. Never captures
what the member is actually typing — just typing *rhythm* and *lexicon*
(space-separated word tokens, no punctuation, no passwords — we skip
when an input field is detected by the active app, future work).
"""
from __future__ import annotations

import platform
import time
from collections import deque
from typing import Any

from .base import Sensor

_IS_WINDOWS = platform.system() == "Windows"

FLUSH_SECONDS = 30  # how often we write a summary row to the log
POLL_HZ = 6.67       # ~150ms poll interval

VK_BACK = 0x08
VK_RETURN = 0x0D
VK_SPACE = 0x20
VK_LWIN = 0x5B
VK_RWIN = 0x5C
VK_H = 0x48
_LETTER_RANGE = range(0x41, 0x5B)   # A-Z
_DIGIT_RANGE = range(0x30, 0x3A)    # 0-9


class KeystrokesSensor(Sensor):
    name = "keystrokes"

    def __init__(self) -> None:
        super().__init__()
        self.key_times: deque[float] = deque(maxlen=2000)
        self.typo_times: deque[float] = deque(maxlen=500)
        self.recent_words: deque[tuple[float, str]] = deque(maxlen=200)
        self._text_buffer: list[str] = []
        self._prev_states: dict[int, bool] = {}
        self.dictation_active = False
        self._dictation_last_toggled = 0.0

    def available(self) -> bool:
        return _IS_WINDOWS

    def pulse(self) -> float:
        # Called from the API thread; the poll thread mutates key_times
        # concurrently. Snapshot via tuple() before iterating.
        now = time.time()
        recent = sum(1 for t in tuple(self.key_times) if now - t < 0.5)
        # 8 keys in 500ms = peak (fast typing ~ 100+ wpm)
        return min(1.0, recent / 8.0)

    def summary(self) -> dict[str, Any]:
        m = self._metrics(window_sec=10)
        return {
            "wpm": m["wpm"],
            "keys_10s": m["keys_10s"],
            "typing_active": m["typing_active"],
            "dictation_active": m["dictation_active"],
            "last_key_ago_s": m["last_key_ago"],
        }

    def _loop(self) -> None:
        if not _IS_WINDOWS:
            return
        import ctypes
        user32 = ctypes.windll.user32

        monitored = (
            list(_LETTER_RANGE) + list(_DIGIT_RANGE) +
            [VK_BACK, VK_RETURN, VK_SPACE] +
            list(range(0xBA, 0xC1)) +  # ;=,-./`
            list(range(0xDB, 0xE0))    # [\]'
        )

        last_flush = time.time()
        interval = 1.0 / POLL_HZ

        while self.running:
            now = time.time()

            # Detect Win+H toggle for dictation
            win_down = bool(user32.GetAsyncKeyState(VK_LWIN) & 0x8000) or \
                       bool(user32.GetAsyncKeyState(VK_RWIN) & 0x8000)
            h_pressed = bool(user32.GetAsyncKeyState(VK_H) & 0x8000)
            h_was = self._prev_states.get(VK_H, False)
            if win_down and h_pressed and not h_was:
                self.dictation_active = not self.dictation_active
                self._dictation_last_toggled = now
            self._prev_states[VK_H] = h_pressed
            if self.dictation_active and (now - self._dictation_last_toggled) > 120:
                self.dictation_active = False

            for vk in monitored:
                state = user32.GetAsyncKeyState(vk)
                is_pressed = bool(state & 0x8000)
                was_pressed = self._prev_states.get(vk, False)

                if is_pressed and not was_pressed:
                    self.key_times.append(now)
                    if vk == VK_BACK:
                        self.typo_times.append(now)
                        if self._text_buffer:
                            self._text_buffer.pop()
                    elif vk == VK_SPACE or vk == VK_RETURN:
                        word = "".join(self._text_buffer).strip()
                        if len(word) > 1:
                            self.recent_words.append((now, word.lower()))
                        self._text_buffer.clear()
                    elif vk in _LETTER_RANGE:
                        self._text_buffer.append(chr(vk).lower())
                    elif vk in _DIGIT_RANGE:
                        self._text_buffer.append(chr(vk))

                self._prev_states[vk] = is_pressed

            # Flush a summary row periodically (only if activity)
            if now - last_flush >= FLUSH_SECONDS:
                m = self._metrics(window_sec=FLUSH_SECONDS)
                if m["keys"] > 0 or m["dictation_active"]:
                    self._append({
                        "keys": m["keys"],
                        "wpm": m["wpm"],
                        "avg_burst": m["avg_burst"],
                        "pauses": m["pauses"],
                        "rhythm_std": m["rhythm_std"],
                        "typos": m["typos"],
                        "typo_rate": m["typo_rate"],
                        "dictation_active": m["dictation_active"],
                        "window_s": FLUSH_SECONDS,
                        "recent_words": m["recent_words"][:40],
                    })
                last_flush = now

            time.sleep(interval)

    def _metrics(self, window_sec: int = 10) -> dict[str, Any]:
        import statistics
        now = time.time()
        cutoff = now - window_sec
        # _metrics() is reachable from summary(), which is called by
        # the API thread. Snapshot every deque before iteration so the
        # poll thread's concurrent mutations can't raise RuntimeError.
        key_times = tuple(self.key_times)
        typo_times = tuple(self.typo_times)
        recent_words = tuple(self.recent_words)

        recent = [t for t in key_times if t > cutoff]
        keys = len(recent)
        wpm = (keys / 5) * (60 / window_sec) if keys else 0.0

        bursts: list[int] = []
        cur = 0
        for i in range(1, len(recent)):
            if recent[i] - recent[i - 1] < 2.0:
                cur += 1
            else:
                if cur:
                    bursts.append(cur)
                cur = 0
        if cur:
            bursts.append(cur)
        avg_burst = (sum(bursts) / len(bursts)) if bursts else 0.0

        pauses = sum(1 for i in range(1, len(recent)) if recent[i] - recent[i - 1] > 2.0)

        intervals = [recent[i] - recent[i - 1] for i in range(1, len(recent))]
        rhythm = statistics.pstdev(intervals) if len(intervals) > 2 else 0.0

        typos = sum(1 for t in typo_times if t > cutoff)
        typo_rate = (typos / keys) if keys > 5 else 0.0

        words = [w for t, w in recent_words if t > cutoff]
        last_ago = (now - recent[-1]) if recent else 999.0

        return {
            "keys": keys,
            "keys_10s": keys,
            "wpm": round(wpm, 1),
            "avg_burst": round(avg_burst, 1),
            "pauses": pauses,
            "rhythm_std": round(rhythm, 3),
            "typing_active": keys > 3,
            "dictation_active": self.dictation_active,
            "last_key_ago": round(last_ago, 1),
            "typos": typos,
            "typo_rate": round(typo_rate, 3),
            "recent_words": words,
        }
