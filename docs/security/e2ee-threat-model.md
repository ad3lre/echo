# Echo DM end-to-end encryption — threat model (high level)

This document summarizes what Echo’s LiveKit voice E2EE and LibSignal-backed voice key distribution are intended to protect against, and what remains out of scope. It is not a substitute for an independent cryptographic audit.

## Goals

- **Confidentiality of voice media** in DM/group calls (default on) and guild server/voice/stage channels (per-channel opt-in): LiveKit client-side E2EE; the SFU sees ciphertext only.
- **Group key agreement via MLS (RFC 9420, default protocol):** each call is an MLS group; media keys derive from the epoch exporter secret, giving joining members no access to prior epochs and removed members no access to later ones (the model Discord's DAVE protocol uses). The server is an untrusted delivery service for opaque handshake bytes.
- **Legacy (v1) key wrapping** for old clients uses the Signal double-ratchet model (via `@privacyresearch/libsignal-protocol-typescript`), with prekey bundles distributed only between users who share a DM, group DM, or voice channel; the server stores only ciphertext envelopes.

## Non-goals / metadata

The server necessarily learns **channel id**, **message ordering**, **approximate timing**, **message sizes**, **author id**, **device identifiers**, and **who talks to whom**. Echo does not implement sealed-sender–style metadata minimization; threat actors with server or legal access to logs can still infer social graphs and activity patterns.

## Client trust

Clients run in the browser (or embedded WebView). Malware, compromised extensions, or XSS against the Echo web origin can exfiltrate keys or plaintext after decryption. Users should treat device compromise as fatal to confidentiality for that device.

## Identity (TOFU)

Echo uses trust-on-first-use for remote identity keys (see LibSignal store `isTrustedIdentity`). Users can compare a locally derived **fingerprint** of their identity key with a contact out-of-band (see the Encryption devices UI). A silent key change by a MITM who also controls the server’s view of bundles is not fully ruled out without user verification.

## Chat

**Text chat and group messages are not end-to-end encrypted** in the current product. Legacy encrypted chat payloads may still exist in storage from earlier builds but cannot be sent.

## Operational dependencies

- **LiveKit E2EE** depends on client runtime support (insertable streams) and compatible LiveKit server versions; see `docs/operations/voice-e2ee-livekit.md`.
- **Database migrations** must include `echo_e2ee_devices.protocol_device_id` and related indexes for multi-device bundles.

## Roadmap notes

Post-quantum extensions (e.g. PQXDH) depend on upstream `libsignal` ecosystem support in the TypeScript port Echo uses; see `docs/security/libsignal-dependency-roadmap.md`.
