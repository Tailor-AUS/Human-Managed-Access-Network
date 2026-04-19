"""Screen / activity sensor — active window + app + mouse activity.

Polls foreground window at 2Hz. Writes a row to the daily log every
time the active app *changes*, plus a heartbeat row every 60s with
aggregate mouse activity. This keeps the log informative without
spamming it with identical rows.
"""
from __future__ import annotations

import platform
import time
from collections import deque
from typing import Any

from .base import Sensor

_IS_WINDOWS = platform.system() == "Windows"

POLL_INTERVAL_S = 0.1  # 10Hz — fast enough for mouse-velocity pulse to be responsive
HEARTBEAT_S = 60
BREAK_INACTIVITY_S = 60

VK_LBUTTON = 0x01
VK_RETURN = 0x0D


class ScreenSensor(Sensor):
    name = "screen"

    def __init__(self) -> None:
        super().__init__()
        self.active_app = ""
        self.active_window = ""
        self.mouse_positions: deque[tuple[float, int, int]] = deque(maxlen=200)
        self.mouse_clicks: deque[float] = deque(maxlen=400)
        self.last_activity_time = 0.0
        self.on_break = False
        self.break_start = 0.0
        self.breaks_taken = 0

    def available(self) -> bool:
        return _IS_WINDOWS

    def pulse(self) -> float:
        # Mouse velocity in pixels over the last 500ms, clamped.
        now = time.time()
        recent = [p for p in self.mouse_positions if now - p[0] < 0.5]
        if len(recent) < 2:
            return 0.0
        dist = 0.0
        for i in range(1, len(recent)):
            dx = recent[i][1] - recent[i - 1][1]
            dy = recent[i][2] - recent[i - 1][2]
            dist += (dx * dx + dy * dy) ** 0.5
        # 1500px in 500ms = fast flick = 1.0
        return min(1.0, dist / 1500.0)

    def summary(self) -> dict[str, Any]:
        now = time.time()
        cutoff = now - 10
        recent_pos = [p for p in self.mouse_positions if p[0] > cutoff]
        dist = 0.0
        for i in range(1, len(recent_pos)):
            dx = recent_pos[i][1] - recent_pos[i - 1][1]
            dy = recent_pos[i][2] - recent_pos[i - 1][2]
            dist += (dx * dx + dy * dy) ** 0.5
        clicks = sum(1 for t in self.mouse_clicks if t > cutoff)
        monitors, cursor_screen = _monitor_info()
        return {
            "active_app": self.active_app,
            "active_window": self.active_window[:80],
            "mouse_distance_10s": round(dist),
            "mouse_clicks_10s": clicks,
            "on_break": self.on_break,
            "breaks_taken": self.breaks_taken,
            "monitors": monitors,
            "num_monitors": len(monitors),
            "cursor_monitor": cursor_screen,
            "num_windows": _count_visible_windows(),
        }

    def _loop(self) -> None:
        if not _IS_WINDOWS:
            return
        import ctypes
        import ctypes.wintypes
        user32 = ctypes.windll.user32

        self.last_activity_time = time.time()
        last_heartbeat = 0.0
        prev_lbutton = False

        while self.running:
            now = time.time()
            try:
                title, app = _get_active_window(user32)
                mx, my = _get_mouse_pos(user32)

                app_changed = (app != self.active_app) or (title != self.active_window)
                if app_changed:
                    self.active_app = app
                    self.active_window = title
                    self._append({
                        "event": "app_changed",
                        "active_app": app,
                        "active_window": title[:200],
                    })

                # Mouse distance
                dist = 0.0
                if self.mouse_positions:
                    _, px, py = self.mouse_positions[-1]
                    dx, dy = mx - px, my - py
                    dist = (dx * dx + dy * dy) ** 0.5
                self.mouse_positions.append((now, mx, my))

                # Click detection
                lbutton = bool(user32.GetAsyncKeyState(VK_LBUTTON) & 0x8000)
                if lbutton and not prev_lbutton:
                    self.mouse_clicks.append(now)
                prev_lbutton = lbutton

                # Break detection
                any_kb = any(
                    user32.GetAsyncKeyState(k) & 0x8000 for k in (0x41, 0x42, 0x43, 0x44, VK_RETURN)
                )
                if dist > 5 or any_kb:
                    if self.on_break:
                        self.breaks_taken += 1
                        self.on_break = False
                    self.last_activity_time = now
                elif now - self.last_activity_time > BREAK_INACTIVITY_S and not self.on_break:
                    self.on_break = True
                    self.break_start = now
                    self._append({
                        "event": "break_start",
                        "idle_since_s": round(now - self.last_activity_time, 1),
                    })

                # Heartbeat row every HEARTBEAT_S
                if now - last_heartbeat > HEARTBEAT_S:
                    s = self.summary()
                    self._append({
                        "event": "heartbeat",
                        **s,
                    })
                    last_heartbeat = now

            except Exception as e:
                self.last_error = f"{type(e).__name__}: {e}"

            time.sleep(POLL_INTERVAL_S)


def _get_active_window(user32) -> tuple[str, str]:
    import ctypes
    import ctypes.wintypes
    try:
        hwnd = user32.GetForegroundWindow()
        length = user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        title = buf.value or ""
        pid = ctypes.wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        try:
            import psutil
            app = psutil.Process(pid.value).name().replace(".exe", "")
        except Exception:
            app = (title.split(" - ")[-1].strip() if title else "unknown") or "unknown"
        return title, app
    except Exception:
        return "", "unknown"


def _get_mouse_pos(user32) -> tuple[int, int]:
    import ctypes
    import ctypes.wintypes
    try:
        point = ctypes.wintypes.POINT()
        user32.GetCursorPos(ctypes.byref(point))
        return point.x, point.y
    except Exception:
        return 0, 0


# ── Multi-monitor + window-count helpers ───────────────────────────

def _monitor_info():
    """Returns (list of {index, width, height, primary, bounds}, cursor_monitor_index).

    Uses EnumDisplayMonitors; cursor_monitor_index is which one the mouse is on.
    """
    if not _IS_WINDOWS:
        return [], 0
    import ctypes
    import ctypes.wintypes
    try:
        user32 = ctypes.windll.user32
        MONITORENUMPROC = ctypes.WINFUNCTYPE(
            ctypes.c_int,
            ctypes.wintypes.HMONITOR,
            ctypes.wintypes.HDC,
            ctypes.POINTER(ctypes.wintypes.RECT),
            ctypes.wintypes.LPARAM,
        )

        monitors = []

        def callback(hmon, hdc, lprect, lparam):
            r = lprect.contents
            monitors.append({
                "index": len(monitors),
                "left": r.left, "top": r.top,
                "right": r.right, "bottom": r.bottom,
                "width": r.right - r.left,
                "height": r.bottom - r.top,
            })
            return 1

        user32.EnumDisplayMonitors(None, None, MONITORENUMPROC(callback), 0)

        # Which monitor is the cursor on?
        point = ctypes.wintypes.POINT()
        user32.GetCursorPos(ctypes.byref(point))
        cx, cy = point.x, point.y
        cursor_idx = 0
        for m in monitors:
            if m["left"] <= cx < m["right"] and m["top"] <= cy < m["bottom"]:
                cursor_idx = m["index"]
                break
        return monitors, cursor_idx
    except Exception:
        return [], 0


def _count_visible_windows() -> int:
    """Count top-level visible windows with a non-empty title."""
    if not _IS_WINDOWS:
        return 0
    import ctypes
    import ctypes.wintypes
    try:
        user32 = ctypes.windll.user32
        EnumWindowsProc = ctypes.WINFUNCTYPE(
            ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM
        )
        count = [0]

        def cb(hwnd, lparam):
            if not user32.IsWindowVisible(hwnd):
                return True
            length = user32.GetWindowTextLengthW(hwnd)
            if length <= 0:
                return True
            count[0] += 1
            return True

        user32.EnumWindows(EnumWindowsProc(cb), 0)
        return count[0]
    except Exception:
        return 0
