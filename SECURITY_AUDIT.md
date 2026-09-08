# 🛡️ AegisCall Security Audit & Threat Model (STRIDE)

> **Auditor**: Application Security Engineering Standard (`agency-application-security-engineer`)  
> **Status**: APPROVED / VERIFIED  
> **Date**: September 2026  
> **Scope**: Cryptographic Primitives, Signaling Gateway, WebRTC Encoded Transform, and DataChannel Transport

---

## 1. System Overview & Data Classification

- **System**: AegisCall 1-to-1 End-to-End Encrypted Calling System
- **Data Classification**:
  - **Audio/Video Media Frames**: `RESTRICTED` (End-to-end encrypted; opaque to signaling server & TURN relays)
  - **Private Keys**: `RESTRICTED` (Ephemeral in-memory only; non-exportable; never transmitted)
  - **Signaling Messages (SDP / ICE)**: `CONFIDENTIAL` (In-memory ephemeral WebSocket routing)
  - **Safety Numbers (SAS)**: `PUBLIC / VERIFIABLE` (Derived from public keys + shared entropy)

---

## 2. Trust Boundaries & Data Flow

```text
[Browser Main Thread] ──(Structured Clone)──► [Dedicated Worker: AES-256-GCM]
         │                                                    │
         ▼                                                    ▼
[Untrusted Network / WebSocket]                   [WebRTC Encoded Transform]
         │                                                    │
         ▼                                                    ▼
[Signaling Server (Zero-Trust Node)]              [Untrusted P2P Relay / TURN]
```

### Trust Boundary Definitions:
1. **TB-1: Client Web Worker ↔ External Network**: All media departing the client must be ciphertext.
2. **TB-2: Client ↔ Signaling Server**: The signaling server is treated as semi-trusted (or untrusted). It facilitates handshake matching, but must never have access to plaintext media or session keys.
3. **TB-3: Peer A ↔ Peer B**: Direct P2P WebRTC data channels and media streams authenticated via out-of-band Safety Numbers (SAS).

---

## 3. STRIDE Threat Analysis & Mitigations

| Category | Threat Description | Inherent Risk | Implemented Mitigation | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **S**poofing | Attacker impersonates Peer B during key exchange (MitM) | **CRITICAL** | Ephemeral **X25519** ECDH combined with **Short Authentication String (SAS)** Safety Numbers (4-emoji hash + 60-digit numerical fingerprint) compared verbally or via QR code. | **VERIFIED** |
| **T**ampering | Intermediary modifies encrypted video or audio frames in transit | **HIGH** | **AES-256-GCM** with 128-bit authentication tag over frame payload and header (AAD). Tampered frames fail authentication and are dropped without processing. | **VERIFIED** |
| **T**ampering | Attacker replays previously recorded valid frames | **HIGH** | Monotonically increasing 32-bit big-endian frame counter bound to unique 96-bit IV. Counters outside the expected sequence window are discarded. | **VERIFIED** |
| **R**epudiation | Peer denies sending a specific encrypted message | **MEDIUM** | Messages sent over DataChannel include sender cryptographic fingerprint and timestamp signed by session data key. | **VERIFIED** |
| **I**nformation Disclosure | Compromise of signaling server or TURN relay exposes call content | **CRITICAL** | **Insertable Streams payload encryption**. Media payloads are encrypted *before* reaching the WebRTC transport layer. Turn relays see only AES-256-GCM ciphertext chunks. | **VERIFIED** |
| **I**nformation Disclosure | Past sessions compromised if an ephemeral key is leaked later | **HIGH** | **Perfect Forward Secrecy (PFS)**: Fresh ephemeral X25519 keypairs are generated per session and purged on call teardown. | **VERIFIED** |
| **D**enial of Service | Malicious client floods signaling server with oversized payloads | **MEDIUM** | Fastify WebSocket `maxPayload: 1048576` (1MB limit) and strict JSON schema parsing; invalid messages immediately terminate connection. | **VERIFIED** |
| **E**levation of Privilege | Third party joins an ongoing private 1-to-1 room | **HIGH** | Strict room capacity enforcement (`room.size >= 2 -> ROOM_FULL`) in `RoomManager`. Unauthorized peers are rejected. | **VERIFIED** |

---

## 4. Cryptographic Validation Checks

- **Key Agreement**: X25519 elliptic curve implementation verified constant-time via `@noble/curves`.
- **Key Expansion**: HKDF-SHA256 adheres to RFC 5869, generating separate 256-bit symmetric keys for audio, video, and data channels.
- **Payload Encryption**: Native `SubtleCrypto.encrypt()` utilizing hardware-accelerated AES-NI with zero hand-rolled crypto algorithms.
- **Audit Rule Adherence**: Zero secrets stored in source code, `.env` files, or persistent storage.
