# HMAN Technical Roadmap

> Building the AI identity layer for the next generation

---

## Phase 1: Foundation (Current)

### ✅ Completed
- [x] Core SDK with vault management
- [x] MCP server for AI integration
- [x] Signal integration for messaging
- [x] Permission levels (Open, Standard, Gated, Locked)
- [x] Access gate with human approval
- [x] Note to Self profile builder
- [x] HMAN Protocol (Signal-to-LLM bridge)
- [x] HmanService (Signal-based AI broker)
- [x] Vision documentation
- [x] Homepage with 4 pillars

### 🔄 In Progress
- [ ] Signal linked device message sync (critical blocker)
- [ ] Real-time message listener for HmanService
- [ ] Demo script for end-to-end flow

---

## Phase 2: Identity Layer

### Biometric Authentication
- [ ] FaceID/TouchID integration via WebAuthn
- [ ] Biometric verification for sensitive actions
- [ ] "You are the key" - no passwords needed
- [ ] Payment authorization via biometrics

### User Identity
- [ ] HMAN identity creation flow
- [ ] Biometric linking process
- [ ] Recovery mechanisms (backup codes, trusted contacts)
- [ ] Identity verification levels

---

## Phase 3: Protection Layer

### Scam Detection & Blocking
- [ ] AI-powered scam call detection
- [ ] HMAN answers calls on behalf of user
- [ ] Suspicious pattern recognition
- [ ] Block list management
- [ ] Scam caller database integration

### Email Protection
- [ ] Phishing email detection
- [ ] Sender verification
- [ ] Link safety checking
- [ ] Quarantine suspicious messages

### Real-time Alerts
- [ ] Push notifications for threats
- [ ] Threat summary dashboard
- [ ] Block/allow with one tap

---

## Phase 4: Control Layer

### AI Connection Management
- [ ] Connect any AI via MCP
- [ ] Per-AI permission settings
- [ ] Request history per AI
- [ ] Revoke access instantly
- [ ] AI reputation tracking

### Data Sharing Controls
- [ ] Categories (Profile, Payment, Health, Calendar, etc.)
- [ ] Per-category permissions
- [ ] Time-limited sharing
- [ ] One-time access tokens

### Audit & Transparency
- [ ] Full audit log of all access
- [ ] Export audit history
- [ ] Access analytics dashboard
- [ ] Unusual activity detection

---

## Phase 5: Authenticity Layer

### Content Signing
- [ ] Sign any content with biometric verification
- [ ] Generate HMAN VERIFIED badge
- [ ] Unique verification IDs (hman://v/...)
- [ ] Timestamp and identity binding

### Verification API
- [ ] Public verification endpoint
- [ ] Embed verification in content
- [ ] Browser extension for verification
- [ ] QR code verification

### Trust Network
- [ ] Verified creator profiles
- [ ] Cross-verification between users
- [ ] Trust scores
- [ ] Revocation mechanisms

---

## Phase 6: Platform Expansion

### Mobile Apps
- [ ] iOS app with FaceID integration
- [ ] Android app with biometric integration
- [ ] Real-time notifications
- [ ] Offline capabilities

### Integrations
- [ ] PayID/PayTo for Australian payments
- [ ] Calendar integration (Google, Apple, Outlook)
- [ ] Contact sync
- [ ] Browser extension

### Enterprise
- [ ] Team HMAN for organizations
- [ ] Compliance & audit features
- [ ] SSO integration
- [ ] Admin dashboard

---

## Technical Stack

### Current
- **Core**: TypeScript, Node.js
- **Messaging**: Signal via signal-cli
- **AI Protocol**: MCP (Model Context Protocol)
- **Encryption**: AES-256-GCM
- **Frontend**: HTML/CSS/JS (static)

### Planned
- **Mobile**: React Native / Flutter
- **Authentication**: WebAuthn/FIDO2
- **Backend**: Fastify / Hono
- **Database**: SQLite (local) / Turso (cloud)
- **Payments**: PayID API, PayTo

---

## Success Metrics

### Adoption
- Users with active HMAN
- AIs connected per user
- Daily active approval requests

### Protection
- Scam calls blocked
- Phishing attempts detected
- Threats prevented

### Authenticity
- Content signed per day
- Verification requests
- Trust network size

### Control
- Access requests handled
- Denial rate
- Audit log reviews

---

## Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Signal API changes | Build alternative transports (Matrix, XMPP) |
| User friction (too many approvals) | Pre-approve common requests, smart batching |
| AI companies don't integrate | Focus on Claude/MCP first, build wrappers |
| Biometric spoofing | Multi-factor, liveness detection |
| Centralization concerns | Federated architecture, open source |

---

## Immediate Next Steps

1. **Fix Signal linked device sync** - Critical for demo
2. **Build end-to-end demo** - Show complete flow
3. **WebAuthn prototype** - FaceID in browser
4. **Scam detection PoC** - Basic pattern matching
5. **Verification API** - hman://v/ endpoint

---

*Last updated: December 28, 2024*
