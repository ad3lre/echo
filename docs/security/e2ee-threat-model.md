# Echo DM end-to-end encryption — threat model (high level)

This document summarizes what Echo’s LiveKit voice E2EE and LibSignal-backed
media-key distribution are intended to protect against, and what remains out of
scope. It is not a substitute for an independent cryptographic audit.

## Goals

- **Confidentiality of voice media** in DM/group calls (when enabled) and guild
  server/voice/stage channels (per-channel opt-in): LiveKit client-side frame
  E2EE; the SFU sees ciphertext only.
- **Per-participant media keys (Element Call–style):** each participant
  generates a random sender key, wraps it for peer devices with LibSignal, and
  announces opaque envelopes via Echo’s delivery API. The server never sees
  plaintext keys. On join/leave, senders rotate keys (rotation-based forward
  secrecy — not MLS epoch exporters).
- **Legacy (v1) epoch envelopes and MLS (`ts-mls`) paths** are removed from the
  product join path; tables may remain until a later cleanup migration.

## Non-goals / metadata

The server necessarily learns **channel id**, **message ordering**, **approximate
timing**, **message sizes**, **author id**, **device identifiers**, and **who
talks to whom**. Echo does not implement sealed-sender–style metadata
minimization; threat actors with server or legal access to logs can still infer
social graphs and activity patterns.

## Client trust

Clients run in the browser (or embedded WebView). Malware, compromised
extensions, or XSS against the Echo web origin can exfiltrate keys or plaintext
after decryption. Users should treat device compromise as fatal to
confidentiality for that device.

## Identity (TOFU)

Echo uses trust-on-first-use for remote identity keys (see LibSignal store
`isTrustedIdentity`). Users can compare a locally derived **fingerprint** of
their identity key with a contact out-of-band (see the Encryption devices UI).
A silent key change by a MITM who also controls the server’s view of bundles is
not fully ruled out without user verification.

## Chat

**Text chat and group messages are not end-to-end encrypted** in the current
product. Legacy encrypted chat payloads may still exist in storage from earlier
builds but cannot be sent.

## Operational dependencies

- **LiveKit E2EE** depends on client runtime support (insertable streams) and
  compatible LiveKit server versions; see
  `docs/operations/voice-e2ee-livekit.md`.
- **Database migrations** must include `echo_e2ee_devices` and
  `echo_voice_media_key_envelopes` for media-key delivery.

## Roadmap notes

Post-quantum extensions (e.g. PQXDH) depend on upstream `libsignal` ecosystem
support in the TypeScript port Echo uses (local roadmap notes may live under
`docs-dev/security/` when present).
