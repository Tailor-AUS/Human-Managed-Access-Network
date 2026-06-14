"""
Tests for voice-encoder compute-device selection.

The bridge offloads the Resemblyzer voice encoder to the member's local
GPU (e.g. an NVIDIA RTX / DGX Spark). Device selection must:
  - honour an explicit HMAN_ENCODER_DEVICE override (pin a GPU, or force
    CPU when a torch build mismatches the local CUDA runtime),
  - auto-detect CUDA otherwise,
  - never crash on a broken torch/CUDA build — degrade to CPU instead.

These import ``core`` (numpy + cryptography present in CI). The same logic
is mirrored standalone in ``enrollment/enroll_voice.py``.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Make the bridge package importable.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def test_explicit_argument_wins(monkeypatch):
    import core

    monkeypatch.setenv("HMAN_ENCODER_DEVICE", "cpu")
    # An explicit argument beats the env var.
    assert core.resolve_compute_device("cuda:1") == "cuda:1"


def test_env_override_pins_device(monkeypatch):
    import core

    monkeypatch.setenv("HMAN_ENCODER_DEVICE", "cuda:0")
    assert core.resolve_compute_device() == "cuda:0"


def test_env_override_can_force_cpu(monkeypatch):
    import core

    monkeypatch.setenv("HMAN_ENCODER_DEVICE", "cpu")
    assert core.resolve_compute_device() == "cpu"


def test_auto_detects_cuda_when_available(monkeypatch):
    import core

    monkeypatch.delenv("HMAN_ENCODER_DEVICE", raising=False)
    fake_torch = type("T", (), {"cuda": type("C", (), {"is_available": staticmethod(lambda: True)})})
    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    assert core.resolve_compute_device() == "cuda"


def test_auto_falls_back_to_cpu_when_no_cuda(monkeypatch):
    import core

    monkeypatch.delenv("HMAN_ENCODER_DEVICE", raising=False)
    fake_torch = type("T", (), {"cuda": type("C", (), {"is_available": staticmethod(lambda: False)})})
    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    assert core.resolve_compute_device() == "cpu"


def test_broken_torch_build_degrades_to_cpu(monkeypatch):
    import core

    monkeypatch.delenv("HMAN_ENCODER_DEVICE", raising=False)

    class ExplodingCuda:
        @staticmethod
        def is_available():
            raise RuntimeError("CUDA driver / torch ABI mismatch")

    fake_torch = type("T", (), {"cuda": ExplodingCuda})
    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    # Must not raise — a mismatched build degrades to CPU.
    assert core.resolve_compute_device() == "cpu"
