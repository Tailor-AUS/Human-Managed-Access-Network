# CMAN — Corporate Managed Access Network

**Corporate structures, company constitutions and consensus governance for autonomous organisations.**

**CMAN** (`@tailor/cman`) is a signer-agnostic, **zero-runtime-dependency** TypeScript library for forming and running organisations that any registered identity — a person, an agent, an [HMAN](https://github.com/Tailor-AUS/Human-Managed-Access-Network), a DID, or another organisation — can join. It implements [PACT](https://github.com/TailorAU/pact) (the protocol for inter-agent consensus and truth) as **corporate governance**: every membership is a signed two-sided *join pact*, every decision is a signed resolution sealed by a tamper-evident consensus record, and the rules of the game live in a versioned, amendable **company constitution**.

CMAN is to organisations what [HMAN](https://github.com/Tailor-AUS/Human-Managed-Access-Network) (Human Managed Access Network) is to individuals. Where an HMAN is a sovereign agent acting for one human, a CMAN is a standing legal person that many members own, govern and act through — **HMANs federate into a CMAN**.

> **Status:** `0.1.0`, MIT-licensed. The type model and crypto envelopes mirror the PACT spec; they will be narrowed as the canonical PACT wire format is pinned.

---

## Why

Real organisations are not flat membership lists. They are **corporate structures**: shares and share classes, directors and officers, a board and a general meeting, ordinary and special resolutions, quorums, and — above all — a **constitution** that says who may do what and how decisions carry. CMAN models these directly so software organisations can be governed the way legal ones are, with cryptographic proof at every step.

## Features

- **Legal forms** — company limited by shares (Pty Ltd / Ltd / Corp), company limited by guarantee, cooperative, incorporated association, partnership, limited partnership, trust, DAO, foundation. Each ships with a ready-made constitution.
- **Company constitutions** — versioned governing documents with numbered clauses, a capital structure, governance organs, and a per-resolution-class rule table (basis · threshold · quorum). Amendable only by a resolution of the class the constitution itself names.
- **Capital structure** — share/unit classes with votes-per-share, dividend rights, preference and authorised caps; share issuance, transfer, and a derived **register of members**.
- **Governance organs** — directors (incl. chair, managing director), named officers (CEO, CFO, secretary, public officer, …), with org-signed appointment records.
- **PACT consensus** — signed proposals resolved by signed votes, **weighted by the constitution**: one-member-one-vote (per capita), share-weighted (per share), or board (one-director-one-vote). Ordinary (50%), special (75%), unanimous, and board classes out of the box.
- **Tamper-evident** — join pacts, share certificates, director appointments and consensus outcomes are all Ed25519-signed and independently verifiable.
- **Signer-agnostic** — the core never imports a crypto library. Plug in an HSM, a KMS, libsodium, or a member's own keystore via three small interfaces. A zero-dependency Ed25519 reference backend (Node built-in crypto) is included.

## Install

```bash
npm install @tailor/cman
```

Requires Node 18+ (uses built-in Ed25519 and `structuredClone`). No runtime dependencies.

## Quickstart — incorporate a Pty Ltd, admit a member, pass a special resolution

```ts
import {
  Collective,
  MemoryCollectiveStorage,
  MemoryKeyStore,
  Ed25519Verifier,
  LegalForm,
  OrgRole,
  ResolutionKind,
} from '@tailor/cman';

// Crypto: a keystore that holds signing keys + a verifier. Swap for your own.
const keys = new MemoryKeyStore();
const collective = new Collective({
  storage: new MemoryCollectiveStorage(),
  signers: keys,
  verifier: new Ed25519Verifier(),
});

// Provision keys for the organisation and the founder.
keys.create('org-key');
const founderKp = keys.create('founder-key');

// 1. Incorporate. The matching constitution is adopted and the founder is
//    admitted as a director/shareholder with a complete join pact.
const { organisation, founderMembership } = await collective.incorporate({
  legal_form: LegalForm.CompanyLimitedByShares,
  legal_name: 'Acme Robotics Pty Ltd',
  jurisdiction: 'AU-VIC',
  org_signing_key_id: 'org-key',
  org_public_key: keys.publicKeyOf('org-key')!,
  founder_member_ref: 'hman:alice',
  founder_signing_key_id: 'founder-key',
  founder_public_key: founderKp.publicKey,
  initial_shares: { class_code: 'ORD', quantity: 90 },
});

// 2. A registered identity joins (invite → accept), then is issued shares.
const bobKp = keys.create('bob-key');
const invited = await collective.inviteMember({
  org_id: organisation.id,
  inviter_membership_id: founderMembership.id,
  member_ref: 'hman:bob',
  signing_key_id: 'bob-key',
  public_key: bobKp.publicKey,
  roles: [OrgRole.Shareholder],
});
const bob = await collective.acceptInvite(invited.id);
await collective.issueShares(organisation.id, bob.id, 'ORD', 10, founderMembership.id);

// 3. Amend the constitution by special resolution (75%, share-weighted).
const res = await collective.openResolution({
  org_id: organisation.id,
  proposed_by: founderMembership.id,
  kind: ResolutionKind.AmendConstitution,
  payload: { clauses: [{ number: '1', heading: 'Name', body: 'Acme Robotics Pty Ltd (amended)' }] },
});
await collective.castVote(res.id, founderMembership.id, 'for');     // 90 votes
await collective.castVote(res.id, bob.id, 'against');               // 10 votes → poll closes

const decided = await collective.getResolution(res.id);
console.log(decided?.status);                          // 'carried' (90/100 ≥ 0.75)
console.log(await collective.verifyConsensus(res.id)); // true — org-sealed result
const v2 = await collective.constitutionInForce(organisation.id);
console.log(v2?.version);                              // 2
```

## The constitution drives the votes

Every legal form ships with a constitution whose `resolution_rules` table the consensus engine reads when tallying:

| Resolution class | Basis (company) | Approval threshold | Quorum |
|---|---|---|---|
| `ordinary`  | per share | 50% | 50% |
| `special`   | per share | 75% | 50% |
| `unanimous` | per share | 100% | 100% |
| `board`     | one director, one vote | 50% | 50% |

A resolution is **carried** when *both* hold:

```
quorum:    cast / eligible                 ≥ rule.quorum
threshold: for / (for + against)           ≥ rule.approval_threshold
```

`abstain` votes count toward quorum (participation) but not toward the approval ratio. Cooperatives, associations and partnerships use a **per-capita** basis (one member, one vote); companies, trusts and DAOs use **per-share** (weighted by voting shares/units/tokens held). Amend any of it with an `amend_constitution` resolution.

### Legal forms

| Form | Voting basis | Capital | Amendment rule |
|---|---|---|---|
| `company_limited_by_shares` | per share | ORD shares | special |
| `company_limited_by_guarantee` | per capita | — | special |
| `cooperative` | per capita | — | special |
| `incorporated_association` | per capita | — | special |
| `partnership` / `limited_partnership` | per capita | — | unanimous |
| `trust` | per unit | UNIT | special |
| `dao` | per token | GOV (66.7% special, 40% quorum) | special |
| `foundation` | per capita | — | special |

## Resolution kinds

`admit_member`, `remove_member`, `change_roles`, `appoint_director`, `remove_director`, `appoint_officer`, `issue_shares`, `transfer_shares`, `amend_constitution`, `declare_dividend`, `dissolve`, `custom`. When a resolution of a governing kind carries, the Collective applies its effect atomically (admits the member and seals their join pact, appoints the director and updates the register, supersedes the constitution with a signed v+1, …).

## Signer-agnostic crypto

The library depends only on three interfaces — bring your own backend:

```ts
interface Signer        { keyId: string; publicKey: string; alg: 'ed25519';
                          sign(message: Uint8Array): Promise<string>; }
interface Verifier      { verify(message, signature, publicKey, alg?): Promise<boolean>; }
interface SignerProvider { getSigner(keyId: string): Promise<Signer | undefined>; }
```

The included `MemoryKeyStore` + `Ed25519Verifier` use Node's built-in Ed25519 (raw base64url public keys, portable to WebCrypto). For production, implement `SignerProvider` over an HSM/KMS — or, in the .HMAN ecosystem, over a member's voice-bound `KeyManager`.

## Relationship to PACT and .HMAN

- **PACT** (`github.com/TailorAU/pact`) is the underlying protocol for inter-agent consensus and truth. This library is *one* implementation of PACT, specialised to corporate governance. The signed envelopes (join pacts, votes, consensus seals) mirror the PACT shapes and will be narrowed to the canonical wire format as it is pinned.
- **HMAN** (`github.com/Tailor-AUS/Human-Managed-Access-Network`) — the Human Managed Access Network — is the sovereign individual-agent platform. A CMAN is the organisation an HMAN joins: each HMAN supplies a `SignerProvider` over its own keys and becomes a member, director or shareholder, voting with its own signature. The `Collective` class is the engine that runs a CMAN.

## API surface

- `Collective` — `incorporate`, `requestToJoin` / `inviteMember` / `acceptInvite` / `admitMember`, `issueShares` / `transferShares` / `shareRegister` / `holdingsOf`, `appointDirector` / `appointOfficer` / `registerOfDirectors`, `openResolution` / `castVote` / `tallyResolution` / `finalizeResolution`, `verifyMembership` / `verifyConsensus` / `verifyConstitution`, and registers.
- `buildConstitution(params)` — the template per legal form.
- `tally`, `isCarried`, `isDecided` — the pure consensus arithmetic.
- Crypto: `MemoryKeyStore`, `Ed25519Signer`, `Ed25519Verifier`, `generateEd25519`, `attest`, `verifyAttestation`, `canonicalBytes`, `sha256Hex`.
- `MemoryCollectiveStorage` + the `CollectiveStorage` port.

## Develop

```bash
npm install
npm run typecheck
npm test
npm run build
```

## License

MIT © Tailor
