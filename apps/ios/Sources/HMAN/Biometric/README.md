# Biometric — on-device voice identity (Gate 5)

Native iOS port of the desktop's Resemblyzer-based voice biometric flow
(`packages/python-bridge/core.py`). Closes Gate 5 on the phone so only
the enrolled member's voice activates HMAN, even when the desktop isn't
running.

## Layout

```
Biometric/
├── VoiceBiometric.swift            facade — enroll / verify, threshold, audit
├── CoreMLVoiceEncoder.swift        production encoder (CoreML, lazy-loaded)
├── EncryptedReferenceStore.swift   Keychain-backed reference persistence
├── EnrollmentFlow.swift            10-prompt UX coordinator (ObservableObject)
├── Resources/
│   └── Resemblyzer.mlmodel.placeholder   replaced by the real .mlmodel manually
└── README.md
```

## Public API

```swift
// Enroll from N (≥3) recorded utterances. Mirrors the desktop's
// mean-then-outlier-filter pipeline.
let reference = try await VoiceBiometric.enrollFromUtterances(
    samples: pcmSamples,        // 16kHz mono Float32 little-endian PCM
    memberId: "knox-hart"
)

// Verify a candidate utterance against a stored reference.
let (sim, accept) = try await VoiceBiometric.verify(
    utterance: pcm,
    reference: reference
)

// Tunable acceptance threshold (default 0.75; tighten with real data).
VoiceBiometric.threshold = 0.78

// Persist with Keychain.
let store = EncryptedReferenceStore()
try store.save(reference)
let loaded = try store.load(memberId: "knox-hart")
```

## Storage shape

Keychain entry, one per member:

| Field         | Value                                    |
| ------------- | ---------------------------------------- |
| Service       | `ai.hman.biometric`                      |
| Account / Key | `member.<memberId>.voiceReference`       |
| Accessibility | `whenUnlockedThisDeviceOnly`             |
| Synchronizable| `false` (per-device — see issue non-goals) |
| Value         | JSON-encoded `EnrolledReference`         |

The reference contains:

```json
{
  "embedding": [/* 256 floats, L2-normalised */],
  "memberId": "knox-hart",
  "createdAt": "2026-04-26T12:34:56+10:00",
  "samplesUsed": 9,
  "model": "resemblyzer"
}
```

Keychain provides AES-256 envelope encryption with optional Secure Enclave
binding. We don't add a passphrase layer on top — the desktop file uses
one because it lives on disk; on iOS, `whenUnlockedThisDeviceOnly` is a
stronger guarantee.

## Threshold

Default `0.75`. The desktop's enrolment-time outlier cutoff is `0.80`
(samples below that vs. the running mean are dropped before the
reference is finalised). Verify-time threshold is intentionally looser
because legit utterances vary across mics, distances, and emotional
state. Tighten to `0.78`–`0.82` once we have per-member real-attempt
data; keeping it tunable per call site.

## Manual model conversion (one-shot, before TestFlight)

The repo currently ships `Resources/Resemblyzer.mlmodel.placeholder`
in lieu of the real model. To produce the real one:

```bash
# 1. Set up a Python env with the converter + Resemblyzer.
python -m venv .convert-env
source .convert-env/bin/activate     # on Windows: .convert-env/Scripts/activate
pip install resemblyzer coremltools torch

# 2. Convert. Resemblyzer's encoder is a 3-layer LSTM with a
#    ReLU + linear head. coremltools handles all of it via the
#    PyTorch front-end.
python -c '
import torch, coremltools as ct
from resemblyzer import VoiceEncoder

enc = VoiceEncoder(device="cpu", verbose=False)
enc.eval()

# Resemblyzer expects mel-frames of shape (frames, n_mels=40).
# 160 frames covers the longest utterance after preprocess_wav (10s @
# 16kHz, hop=160 → 1000 frames; we trace at the typical 160-frame chunk
# the encoder slides over). The traced model is shape-flexible because
# coremltools handles dynamic LSTM input.
example = torch.zeros(1, 160, 40)
traced = torch.jit.trace(enc.lstm, example)

mlmodel = ct.convert(
    traced,
    inputs=[ct.TensorType(name="mel", shape=(1, ct.RangeDim(40, 1600), 40))],
    outputs=[ct.TensorType(name="embedding")],
    convert_to="mlprogram",
    minimum_deployment_target=ct.target.iOS17,
)
mlmodel.short_description = "Resemblyzer speaker encoder (256-dim)"
mlmodel.save("Resemblyzer.mlmodel")
'

# 3. Replace the placeholder.
mv Resemblyzer.mlmodel apps/ios/Sources/HMAN/Biometric/Resources/
rm apps/ios/Sources/HMAN/Biometric/Resources/Resemblyzer.mlmodel.placeholder

# 4. Open Package.swift in Xcode; Xcode compiles the .mlmodel into
#    .mlmodelc at build time. SPM auto-resources picks it up because
#    it lives under Sources/HMAN/Biometric/Resources/.
```

After the model is in place, edit `CoreMLVoiceEncoder.embed(pcm:)` to
swap the `throw .modelMissing` for the real CoreML prediction (the
sketch is in the body of that file as a comment). The mel-spectrogram
front-end is the only piece the encoder depends on that doesn't ride
inside the model — implement it with `vDSP_ctoz` + `vDSP_fft_zrip` over
a 25ms / 10ms-hop window, or vendor `librosa`'s mel filterbank as a
constant `[Float]` table.

## What this module deliberately does NOT do

- **Anti-spoofing / replay detection** — separate issue, important.
- **Continuous re-verification** — at-the-gate verification is enough
  for v0. Re-prompting mid-session would hurt UX without a clear
  threat-model win.
- **Cross-device biometric sync** — `synchronizable(false)` on the
  Keychain item enforces this. Per-device enrolment is the design.
- **Audio capture** — the caller (`OnboardingView` / future
  `RecordPrompt` view) drives `AVAudioRecorder`. Keeping audio I/O
  out of the package leaves it unit-testable with synthetic data.

## Latency target

< 200ms per `verify` on iPhone 15 Pro. Resemblyzer's PyTorch path is
~50ms on an RTX 4090; CoreML on Apple Silicon is in the same ballpark
once the model is loaded warm. Documented here; can't validate from CI
— Knox spot-checks on device before each TestFlight upload.
