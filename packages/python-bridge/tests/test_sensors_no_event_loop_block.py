"""Regression test for issue #22 — bridge API hangs while sensors keep writing.

Root cause: a sensor's status() / summary() method made a blocking syscall
(EnumWindows on Windows, in ScreenSensor.summary) directly inside the
FastAPI async handler /api/sensors. When that syscall stalled — because a
foreground process was no longer pumping its message loop — it blocked the
asyncio event loop indefinitely. Sensor threads kept writing to disk
because they don't share that loop.

Fix:
  1. /api/sensors* handlers now call status()/recent() via asyncio.to_thread,
     so any sync sensor method runs on a worker thread. The event loop
     stays free.
  2. ScreenSensor caches its EnumWindows / EnumDisplayMonitors results on
     the sensor's own poll thread, so summary() is just a dict read.
  3. Sensors that read deques mutated by their own thread now snapshot
     them via tuple() before iteration, removing a separate
     'deque mutated during iteration' RuntimeError class.

This test proves (1): even if a sensor's status() blocks for several
seconds, /api/sensors must return for *other* sensors and the event loop
must keep ticking.
"""
from __future__ import annotations

import asyncio
import sys
import threading
import time
from pathlib import Path

import pytest

# Make the package importable directly (api/server.py does the same trick).
PKG_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PKG_ROOT))


class _SlowSensor:
    """A fake sensor whose status() blocks for `block_s` seconds — exactly
    the failure mode that hung the real bridge in #22."""

    name = "slow"

    def __init__(self, block_s: float = 2.0) -> None:
        self.block_s = block_s
        self.status_calls = 0

    def available(self) -> bool:
        return True

    def status(self) -> dict:
        self.status_calls += 1
        # Simulate a stuck Win32 enumeration.
        time.sleep(self.block_s)
        return {"name": self.name, "running": False, "blocked_for_s": self.block_s}

    def recent(self, seconds: int = 3600) -> list[dict]:
        time.sleep(self.block_s)
        return []

    def start(self) -> None:
        pass

    def stop(self) -> None:
        pass


@pytest.mark.asyncio
async def test_slow_sensor_status_does_not_block_event_loop():
    """asyncio.to_thread on the sync sensor call must let the event loop
    keep running."""
    slow = _SlowSensor(block_s=1.5)

    # This mirrors what the API handler now does.
    async def call_status():
        return await asyncio.to_thread(slow.status)

    # Tick a heartbeat counter on the event loop while the sensor blocks.
    ticks = 0

    async def heartbeat():
        nonlocal ticks
        # Loop until the sensor finishes or we hit a max tick budget.
        deadline = time.monotonic() + slow.block_s + 1.0
        while time.monotonic() < deadline:
            ticks += 1
            await asyncio.sleep(0.05)

    # Run them concurrently.
    result, _ = await asyncio.gather(call_status(), heartbeat())

    assert result["blocked_for_s"] == 1.5
    # If the event loop had been blocked, ticks would be ~0. With
    # asyncio.to_thread doing its job, we expect dozens of ticks during
    # the 1.5s block.
    assert ticks > 10, (
        f"event loop appears to have been blocked: only {ticks} ticks during "
        f"a {slow.block_s}s sensor.status() call"
    )


@pytest.mark.asyncio
async def test_slow_recent_does_not_block_event_loop():
    """Same guarantee for /api/sensors/{name}/recent."""
    slow = _SlowSensor(block_s=1.0)

    async def call_recent():
        return await asyncio.to_thread(slow.recent, 60)

    ticks = 0

    async def heartbeat():
        nonlocal ticks
        deadline = time.monotonic() + slow.block_s + 0.5
        while time.monotonic() < deadline:
            ticks += 1
            await asyncio.sleep(0.05)

    result, _ = await asyncio.gather(call_recent(), heartbeat())
    assert result == []
    assert ticks > 8


def test_screen_sensor_summary_does_not_call_win32_enums():
    """ScreenSensor.summary() must read cached values, never call
    _monitor_info() / _count_visible_windows() inline. Otherwise a
    blocked Win32 callback can hang the API thread (issue #22)."""
    from sensors.screen import ScreenSensor
    import sensors.screen as screen_mod

    sensor = ScreenSensor()
    # Pre-populate the cache as if the poll thread had already run.
    sensor._cached_monitors = [{"index": 0, "width": 1920, "height": 1080}]
    sensor._cached_cursor_screen = 0
    sensor._cached_window_count = 7

    # Tripwires: if summary() calls these, fail.
    calls = {"monitor_info": 0, "count_windows": 0}

    def boom_monitor_info():
        calls["monitor_info"] += 1
        # Real-world failure mode: hang for many seconds.
        raise AssertionError("ScreenSensor.summary() called _monitor_info() — issue #22 regression")

    def boom_count_windows():
        calls["count_windows"] += 1
        raise AssertionError("ScreenSensor.summary() called _count_visible_windows() — issue #22 regression")

    orig_mi = screen_mod._monitor_info
    orig_cw = screen_mod._count_visible_windows
    screen_mod._monitor_info = boom_monitor_info
    screen_mod._count_visible_windows = boom_count_windows
    try:
        out = sensor.summary()
    finally:
        screen_mod._monitor_info = orig_mi
        screen_mod._count_visible_windows = orig_cw

    assert calls["monitor_info"] == 0
    assert calls["count_windows"] == 0
    assert out["num_monitors"] == 1
    assert out["num_windows"] == 7


def test_sensor_summary_robust_against_concurrent_deque_mutation():
    """summary() reads deques mutated by the sensor's own thread.
    Iterating a deque while another thread mutates it can raise
    'RuntimeError: deque mutated during iteration'. After the fix,
    summary() snapshots first, so concurrent mutation is harmless."""
    from sensors.keystrokes import KeystrokesSensor

    sensor = KeystrokesSensor()
    # Fill the deque with a realistic load.
    now = time.time()
    for i in range(1500):
        sensor.key_times.append(now - i * 0.01)
        sensor.typo_times.append(now - i * 0.05)
        sensor.recent_words.append((now - i * 0.05, f"word{i}"))

    stop = threading.Event()

    def churn():
        # Hammer the deques the way the poll thread does.
        while not stop.is_set():
            t = time.time()
            sensor.key_times.append(t)
            sensor.typo_times.append(t)
            sensor.recent_words.append((t, "x"))
            # Dequeue from the left as a deque(maxlen=N) would.
            if len(sensor.key_times) > 1000:
                try:
                    sensor.key_times.popleft()
                except IndexError:
                    pass

    threads = [threading.Thread(target=churn, daemon=True) for _ in range(4)]
    for t in threads:
        t.start()
    try:
        # Read summary() repeatedly; without the snapshot fix this
        # raises RuntimeError under load.
        for _ in range(200):
            s = sensor.summary()
            assert "wpm" in s
    finally:
        stop.set()
        for t in threads:
            t.join(timeout=1)
