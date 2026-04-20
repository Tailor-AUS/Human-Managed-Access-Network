"""EEG sensor — Muse S Athena via Bluetooth LE.

Ported from muse-brain/stream_v2.py. Runs an asyncio event loop inside
the sensor's thread, manages the bleak BleakClient lifecycle, and
decodes the 20-byte Muse packets (2-byte header + 12 × 12-bit samples
scaled to microvolts).

MVP: tracks connection state, packet rate, and rolling sample buffer.
Writes a summary row every FLUSH_SECONDS. Band-power FFT to come later.
"""
from __future__ import annotations

import asyncio
import os
import time
from collections import deque
from typing import Any, Optional

from .base import Sensor

# Muse S Gen 2 characteristic UUIDs
CONTROL_UUID = "273e0001-4c4d-454d-96be-f03bac821358"
DATA1_UUID = "273e0013-4c4d-454d-96be-f03bac821358"
DATA3_UUID = "273e0015-4c4d-454d-96be-f03bac821358"

SAMPLE_RATE_HZ = 256
EXPECTED_PKT_RATE = 85.0   # Muse S sends ~85 packets/s across channels when streaming
FLUSH_SECONDS = 10
CONNECT_TIMEOUT_S = 20.0
RETRY_BACKOFF_S = 5.0

# Preset commands — try in order until packets start flowing.
# Knox's muse-brain script found p21 works for Athena; keep fallbacks.
# Preset commands — order matches muse-brain/stream_v2.py's proven sequence.
# p21 worked for Knox's Athena; rest are fallbacks across firmware revisions.
PRESETS = [
    bytearray([0x04, 0x70, 0x32, 0x31, 0x0a]),  # p21
    bytearray([0x04, 0x70, 0x32, 0x30, 0x0a]),  # p20
    bytearray([0x04, 0x70, 0x32, 0x32, 0x0a]),  # p22
    bytearray([0x04, 0x70, 0x32, 0x33, 0x0a]),  # p23
    bytearray([0x02, 0x73, 0x0a]),              # 's' (start)
    bytearray([0x04, 0x70, 0x35, 0x30, 0x0a]),  # p50
    bytearray([0x04, 0x70, 0x35, 0x31, 0x0a]),  # p51
]
VERSION_CMD = bytearray([0x02, 0x76, 0x0a])   # 'v' — wakes device
DEVICE_INFO_CMD = bytearray([0x02, 0x64, 0x0a])  # 'd'
HALT_CMD = bytearray([0x02, 0x68, 0x0a])      # 'h'


def _decode_muse_packet(data: bytes) -> tuple[Optional[int], list[float]]:
    """20-byte packet → (packet_index, 12 samples in microvolts)."""
    if len(data) < 20:
        return None, []
    pkt_idx = (data[0] << 8) | data[1]
    samples: list[float] = []
    for i in range(12):
        start_bit = i * 12
        start_byte = 2 + start_bit // 8
        bit_offset = start_bit % 8
        if start_byte + 1 >= len(data):
            continue
        if bit_offset <= 4:
            val = ((data[start_byte] << 8) | data[start_byte + 1]) >> (4 - bit_offset)
            val &= 0xFFF
        else:
            if start_byte + 2 >= len(data):
                continue
            val = (data[start_byte] << 16) | (data[start_byte + 1] << 8) | data[start_byte + 2]
            val = (val >> (12 - bit_offset)) & 0xFFF
        if val >= 2048:
            val -= 4096
        samples.append(val * 0.48828125)
    return pkt_idx, samples


class EEGSensor(Sensor):
    name = "eeg"

    def __init__(self, address: Optional[str] = None) -> None:
        super().__init__()
        # Per-member config: address can be overridden by env
        self.address = address or os.environ.get(
            "HMAN_MUSE_ADDRESS", "00:55:DA:BB:CC:84",
        )
        self.connected = False
        self.packet_count = 0
        self._last_packet_ts = 0.0
        self._recent_pkts: deque[float] = deque(maxlen=256)
        self._sample_buffer: deque[float] = deque(maxlen=SAMPLE_RATE_HZ * 10)
        self._loop_task: Optional[asyncio.Task] = None
        self._control_log: list[str] = []

    def available(self) -> bool:
        try:
            import bleak  # noqa: F401
            return True
        except Exception:
            return False

    def pulse(self) -> float:
        # Packet rate in the last second, normalised to the expected rate.
        now = time.time()
        if now - self._last_packet_ts > 2.0:
            return 0.0
        cutoff = now - 1.0
        recent = sum(1 for t in self._recent_pkts if t > cutoff)
        return min(1.0, recent / EXPECTED_PKT_RATE)

    def summary(self) -> dict[str, Any]:
        now = time.time()
        last_age = round(now - self._last_packet_ts, 2) if self._last_packet_ts else None
        cutoff = now - 1.0
        pkt_rate = sum(1 for t in self._recent_pkts if t > cutoff)
        # Rough signal amplitude from the last second
        recent_samples = list(self._sample_buffer)[-SAMPLE_RATE_HZ:]
        amp = 0.0
        if recent_samples:
            amp = max(abs(s) for s in recent_samples)
        return {
            "address": self.address,
            "connected": self.connected,
            "packets": self.packet_count,
            "packet_rate_hz": pkt_rate,
            "last_packet_age_s": last_age,
            "signal_amp_uv": round(amp, 1),
            "control_log": self._control_log[-5:],
        }

    # ── start/stop override: spin up our own asyncio loop in the thread ──

    def _loop(self) -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self._reconnect_loop())
        finally:
            try:
                pending = asyncio.all_tasks(loop)
                for t in pending:
                    t.cancel()
            except Exception:
                pass
            loop.close()

    async def _reconnect_loop(self) -> None:
        while self.running:
            try:
                await self._connect_and_stream()
            except asyncio.CancelledError:
                return
            except Exception as e:
                self.last_error = f"{type(e).__name__}: {e}"
                self.connected = False
            # Back off before retry unless we're stopping
            for _ in range(int(RETRY_BACKOFF_S * 2)):
                if not self.running:
                    return
                await asyncio.sleep(0.5)

    async def _connect_and_stream(self) -> None:
        from bleak import BleakClient

        async with BleakClient(self.address, timeout=CONNECT_TIMEOUT_S) as client:
            self.connected = True
            self.last_error = None

            # Enumerate services so we can see which UUIDs the firmware
            # actually exposes. Muse firmware revisions vary widely.
            try:
                services = client.services
                discovered: list[str] = []
                for service in services:
                    for ch in service.characteristics:
                        props = ",".join(ch.properties)
                        discovered.append(f"{ch.uuid} [{props}]")
                if discovered:
                    print(f"[eeg enumerate] {len(discovered)} chars: " + "; ".join(discovered[:10]))
                    # Stash top few in control log for dashboard visibility
                    for line in discovered[:10]:
                        self._control_log.append(f"char: {line}")
            except Exception as e:
                print(f"[eeg enumerate] failed: {e}")

            # Reading the device name first seems to "wake" the Muse before
            # notifications can flow — mirrors muse-brain/stream_v2.py.
            try:
                await client.read_gatt_char("00002a00-0000-1000-8000-00805f9b34fb")
            except Exception:
                pass

            def on_data(sender, data):  # bleak callback, sync
                self.packet_count += 1
                now = time.time()
                self._last_packet_ts = now
                self._recent_pkts.append(now)
                _, samples = _decode_muse_packet(bytes(data))
                if samples:
                    self._sample_buffer.extend(samples)

            # Log control responses so we can see what the device says when we
            # send handshake commands or presets. Rolls into self.last_error
            # for visibility in the dashboard.
            self._control_log: list[str] = []

            def on_control(_sender, data):  # noqa: ANN001
                try:
                    raw = bytes(data)
                    # Muse control replies are length-prefixed ASCII JSON or
                    # plain text. Try to decode as utf-8.
                    txt = raw.decode("utf-8", errors="replace").strip()
                    if txt:
                        self._control_log.append(txt[:200])
                        if len(self._control_log) > 20:
                            self._control_log.pop(0)
                        print(f"[eeg control] {txt[:200]}")
                except Exception:
                    pass

            await client.start_notify(CONTROL_UUID, on_control)
            await client.start_notify(DATA1_UUID, on_data)
            await client.start_notify(DATA3_UUID, on_data)

            # Wake sequence
            try:
                await client.write_gatt_char(CONTROL_UUID, VERSION_CMD)
                await asyncio.sleep(0.5)
                await client.write_gatt_char(CONTROL_UUID, DEVICE_INFO_CMD)
                await asyncio.sleep(0.5)
            except Exception as e:
                self.last_error = f"wake failed: {e}"

            # Try presets. Each gets 2s to start streaming — short presets
            # sometimes take a moment before data arrives.
            pre_count = self.packet_count
            for preset in PRESETS:
                if not self.running:
                    break
                try:
                    await client.write_gatt_char(CONTROL_UUID, preset)
                except Exception as e:
                    self.last_error = f"preset write failed: {e}"
                    continue
                # Poll for packets every 250ms up to 2s
                for _ in range(8):
                    await asyncio.sleep(0.25)
                    if self.packet_count > pre_count:
                        break
                if self.packet_count > pre_count:
                    self.last_error = None
                    break
            if self.packet_count == pre_count:
                self.last_error = (
                    "handshake complete but no data packets — "
                    "Muse may be paired to another app (Muse app, Mind Monitor). "
                    "Close other clients and Start again."
                )

            # Stream loop: periodically flush a summary row, watch for stop
            last_flush = time.time()
            while self.running:
                await asyncio.sleep(0.5)
                now = time.time()
                # If packets stopped flowing for a while, break to reconnect
                if self._last_packet_ts and now - self._last_packet_ts > 15.0:
                    self.last_error = "no packets for 15s — reconnecting"
                    break
                if now - last_flush >= FLUSH_SECONDS:
                    s = self.summary()
                    self._append({
                        "packets": s["packets"],
                        "packet_rate_hz": s["packet_rate_hz"],
                        "signal_amp_uv": s["signal_amp_uv"],
                        "connected": True,
                    })
                    last_flush = now

            # Shutdown
            try:
                await client.write_gatt_char(CONTROL_UUID, HALT_CMD)
            except Exception:
                pass
            for uuid in (CONTROL_UUID, DATA1_UUID, DATA3_UUID):
                try:
                    await client.stop_notify(uuid)
                except Exception:
                    pass

        self.connected = False
