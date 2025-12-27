# .HMAN Mobile Architecture

> **Your .HMAN in your pocket. Fully local. No cloud required.**

---

## The Vision

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│                    YOUR PHONE                              │
│                                                            │
│   ┌────────────────────────────────────────────────────┐   │
│   │                                                    │   │
│   │                  .HMAN APP                         │   │
│   │                                                    │   │
│   │   ┌──────────────────────────────────────────┐     │   │
│   │   │         LOCAL LLM (3B params)            │     │   │
│   │   │                                          │     │   │
│   │   │   • Llama 3.2 3B (2GB)                   │     │   │
│   │   │   • Phi-3 Mini (2GB)                     │     │   │
│   │   │   • Gemma 2B (1.5GB)                     │     │   │
│   │   │                                          │     │   │
│   │   │   Runs on: Apple Neural Engine           │     │   │
│   │   │            Qualcomm NPU                  │     │   │
│   │   │            GPU (fallback)                │     │   │
│   │   │                                          │     │   │
│   │   └──────────────────────────────────────────┘     │   │
│   │                                                    │   │
│   │   ┌──────────────────────────────────────────┐     │   │
│   │   │         YOUR .HMAN FILE                  │     │   │
│   │   │                                          │     │   │
│   │   │   Encrypted with FaceID/TouchID          │     │   │
│   │   │                                          │     │   │
│   │   │   • Profile                              │     │   │
│   │   │   • Payments (PayID, BPay)               │     │   │
│   │   │   • Calendar                             │     │   │
│   │   │   • Health                               │     │   │
│   │   │   • Contacts                             │     │   │
│   │   │   • Documents                            │     │   │
│   │   │                                          │     │   │
│   │   └──────────────────────────────────────────┘     │   │
│   │                                                    │   │
│   └────────────────────────────────────────────────────┘   │
│                                                            │
│   Biometric: FaceID / TouchID                              │
│   Secure Enclave protected                                 │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Technical Stack

### iOS
```
┌─────────────────────────────────────────────────────────────┐
│ Swift / SwiftUI                                             │
├─────────────────────────────────────────────────────────────┤
│ LLM Runtime:                                                │
│   • MLC LLM (Metal GPU acceleration)                        │
│   • OR llama.cpp (portable, battle-tested)                  │
│   • OR MLX (Apple Silicon optimized)                        │
├─────────────────────────────────────────────────────────────┤
│ Model:                                                      │
│   • Llama 3.2 3B Instruct (Q4_K_M: 2GB)                     │
│   • Runs on Apple Neural Engine                             │
│   • ~15 tokens/sec on iPhone 15                             │
├─────────────────────────────────────────────────────────────┤
│ Security:                                                   │
│   • Keychain for encryption keys                            │
│   • Secure Enclave for biometrics                           │
│   • LocalAuthentication framework (FaceID/TouchID)          │
├─────────────────────────────────────────────────────────────┤
│ Storage:                                                    │
│   • .hman file in app sandbox                               │
│   • Encrypted with AES-256-GCM                              │
│   • Key protected by Secure Enclave                         │
├─────────────────────────────────────────────────────────────┤
│ Communication:                                              │
│   • Signal Protocol (for messaging mode)                    │
│   • Bluetooth/Local (for air-gapped mode)                   │
│   • Push notifications (for requests)                       │
└─────────────────────────────────────────────────────────────┘
```

### Android
```
┌─────────────────────────────────────────────────────────────┐
│ Kotlin / Jetpack Compose                                    │
├─────────────────────────────────────────────────────────────┤
│ LLM Runtime:                                                │
│   • MLC LLM (OpenCL GPU acceleration)                       │
│   • OR llama.cpp (NDK build)                                │
│   • OR MediaPipe LLM (Google's solution)                    │
├─────────────────────────────────────────────────────────────┤
│ Model:                                                      │
│   • Llama 3.2 3B Instruct (Q4_K_M: 2GB)                     │
│   • Runs on Qualcomm NPU (Snapdragon)                       │
│   • ~10-15 tokens/sec on flagship phones                    │
├─────────────────────────────────────────────────────────────┤
│ Security:                                                   │
│   • Android Keystore                                        │
│   • Biometric API (fingerprint, face)                       │
│   • Trusted Execution Environment (TEE)                     │
├─────────────────────────────────────────────────────────────┤
│ Storage:                                                    │
│   • .hman file in app private storage                       │
│   • Encrypted with AES-256-GCM                              │
│   • Key protected by TEE                                    │
├─────────────────────────────────────────────────────────────┤
│ Communication:                                              │
│   • Signal Protocol (for messaging mode)                    │
│   • Bluetooth/Local (for air-gapped mode)                   │
│   • Push notifications (for requests)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Phone Requirements

### Minimum Specs (2GB model)
| Spec | Requirement |
|------|-------------|
| **iOS** | iPhone 12 or newer, iOS 16+ |
| **Android** | 6GB RAM, Snapdragon 8 Gen 1+ or equivalent |
| **Storage** | 4GB free (model + data) |

### Recommended Specs (best experience)
| Spec | Requirement |
|------|-------------|
| **iOS** | iPhone 14 Pro or newer |
| **Android** | 8GB+ RAM, Snapdragon 8 Gen 2+ |
| **Storage** | 8GB free |

---

## How It Works

### 1. Initial Setup

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│   📱 Welcome to .HMAN                                      │
│                                                            │
│   Your personal AI that works for YOU.                     │
│   Runs entirely on this device.                            │
│   Never sends your data to the cloud.                      │
│                                                            │
│   ─────────────────────────────────────────────            │
│                                                            │
│   Step 1: Download AI Model                                │
│                                                            │
│   [Llama 3.2 3B] ← Recommended (2GB)                       │
│   [Phi-3 Mini]     Faster, lighter (1.8GB)                 │
│   [Gemma 2B]       Google's model (1.5GB)                  │
│                                                            │
│   This runs 100% on your phone.                            │
│   One-time download. Works offline.                        │
│                                                            │
│   [Download & Install]                                     │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 2. Create Your .HMAN File

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│   📱 Protect your .hman file                               │
│                                                            │
│   Your data will be encrypted and protected                │
│   by your biometrics.                                      │
│                                                            │
│   ─────────────────────────────────────────────            │
│                                                            │
│   [🔐 Enable FaceID Protection]                            │
│                                                            │
│   Only YOU can unlock your .hman file.                     │
│   Even if someone steals your phone, they                  │
│   can't access your data without your face.                │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 3. Add Your Data

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│   📱 Build your .hman profile                              │
│                                                            │
│   What should I know about you?                            │
│                                                            │
│   ─────────────────────────────────────────────            │
│                                                            │
│   📋 Profile                                               │
│      Name, email, phone...                        [Add]    │
│                                                            │
│   💳 Payments                                              │
│      PayID, BPay, bank accounts...                [Add]    │
│                                                            │
│   📅 Calendar                                              │
│      Connect Apple/Google calendar...             [Sync]   │
│                                                            │
│   🏥 Health                                                │
│      Blood type, allergies, Medicare...           [Add]    │
│                                                            │
│   📇 Contacts                                              │
│      Import from phone...                         [Import] │
│                                                            │
│   Everything stays on THIS device.                         │
│   Encrypted. Protected by FaceID.                          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 4. Receive Requests

```
*Phone buzzes*

┌────────────────────────────────────────────────────────────┐
│                                                            │
│   🔔 .HMAN Request                                         │
│                                                            │
│   ─────────────────────────────────────────────            │
│                                                            │
│   💰 Origin Energy requests payment                        │
│                                                            │
│   Amount: $145.00                                          │
│   For: Electricity (March)                                 │
│                                                            │
│   Tap to respond                                           │
│                                                            │
└────────────────────────────────────────────────────────────┘

*You tap. FaceID unlocks.*

┌────────────────────────────────────────────────────────────┐
│                                                            │
│   📱 YOUR .HMAN                                            │
│                                                            │
│   💰 Payment Request                                       │
│                                                            │
│   Origin Energy wants $145.00                              │
│   Electricity (March 2024)                                 │
│                                                            │
│   ─────────────────────────────────────────────            │
│                                                            │
│   How would you like to handle this?                       │
│                                                            │
│   [A] Release my credit card to them                       │
│                                                            │
│   [B] Pay via BPay (5 working days)                        │
│                                                            │
│   [C] Pay via PayID (instant)                              │
│       └─ They never get your card                          │
│                                                            │
│   [D] Remind me later                                      │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Two Modes

### 1. Connected Mode
- Receives requests via Signal / Push notifications
- Can communicate with other .HMANs over internet
- Can make payments via banking APIs
- Best for: everyday use

### 2. Air-Gapped Mode
- Completely offline
- Requests via Bluetooth / QR codes
- No internet connection ever
- Best for: maximum security, sensitive environments

---

## Cross-Platform (React Native / Flutter)

For faster development, we could use:

```
┌─────────────────────────────────────────────────────────────┐
│                     React Native                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   UI:      React Native + Expo                              │
│   LLM:     react-native-llama (llama.cpp bindings)          │
│   Crypto:  react-native-quick-crypto                        │
│   Bio:     expo-local-authentication                        │
│   Storage: expo-secure-store                                │
│                                                             │
│   One codebase → iOS + Android                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Or:

```
┌─────────────────────────────────────────────────────────────┐
│                        Flutter                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   UI:      Flutter + Material 3                             │
│   LLM:     flutter_llama (ffi bindings to llama.cpp)        │
│   Crypto:  cryptography_flutter                             │
│   Bio:     local_auth                                       │
│   Storage: flutter_secure_storage                           │
│                                                             │
│   One codebase → iOS + Android                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Performance Expectations

| Device | Model | Speed | Battery |
|--------|-------|-------|---------|
| iPhone 15 Pro | Llama 3.2 3B | ~20 tok/s | ~2% per request |
| iPhone 13 | Llama 3.2 3B | ~12 tok/s | ~3% per request |
| Pixel 8 Pro | Llama 3.2 3B | ~15 tok/s | ~3% per request |
| Galaxy S24 | Llama 3.2 3B | ~18 tok/s | ~2% per request |

A typical request (payment approval) takes ~2-3 seconds to process.

---

## Security Model

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    SECURITY LAYERS                          │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  Layer 1: Device Lock (PIN/Pattern/Password)        │   │
│   └─────────────────────────────────────────────────────┘   │
│                         ↓                                   │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  Layer 2: Biometrics (FaceID/TouchID/Fingerprint)   │   │
│   └─────────────────────────────────────────────────────┘   │
│                         ↓                                   │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  Layer 3: Secure Enclave / TEE                      │   │
│   │           (Hardware key storage)                    │   │
│   └─────────────────────────────────────────────────────┘   │
│                         ↓                                   │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  Layer 4: AES-256-GCM Encryption                    │   │
│   │           (Your .hman file)                         │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   Even if someone:                                          │
│   • Steals your phone → Can't unlock without biometrics     │
│   • Jailbreaks it → Can't extract keys from Secure Enclave  │
│   • Gets the file → Can't decrypt without the key           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Existing Libraries We Can Use

| Purpose | iOS | Android |
|---------|-----|---------|
| **LLM Runtime** | MLC LLM, llama.cpp | MLC LLM, llama.cpp |
| **Biometrics** | LocalAuthentication | BiometricPrompt |
| **Encryption** | CryptoKit | Tink |
| **Secure Storage** | Keychain | Keystore |
| **Signal** | libsignal-protocol-swift | libsignal-android |

---

## MVP Scope

### Phase 1: Core App (2-3 months)
- [ ] Basic UI with request/response flow
- [ ] Local LLM integration (llama.cpp)
- [ ] .hman file encryption
- [ ] Biometric protection
- [ ] Profile, Payments, Calendar sections

### Phase 2: Connectivity (1-2 months)
- [ ] Signal integration (optional)
- [ ] Push notifications
- [ ] .HMAN to .HMAN communication

### Phase 3: Polish (1 month)
- [ ] Air-gapped mode
- [ ] Backup/restore
- [ ] Multiple profiles

---

*Your .HMAN. In your pocket. Always local. Always yours.*
