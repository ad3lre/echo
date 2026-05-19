# Echo DM end-to-end encryption — threat model (high level)

This document summarizes what Echo’s LibSignal-based DM E2EE and LiveKit voice E2EE are intended to protect against, and what remains out of scope. It is not a substitute for an independent cryptographic audit.

## Goals

- **Confidentiality of message bodies** for enabled 1:1 DM threads: the application server stores ciphertext and associated opaque envelopes; it does not perform decryption.
- **Confidentiality of voice media keys** when using the voice E2EE epoch + envelope flow: the server stores only ciphertext envelopes for key material distribution.
- **Per-device sessions** using the Signal double-ratchet model (via `@privacyresearch/libsignal-protocol-typescript`) with prekey bundles distributed only between users who share a direct DM.

## Non-goals / metadata

The server necessarily learns **channel id**, **message ordering**, **approximate timing**, **message sizes**, **author id**, **device identifiers**, and **who talks to whom**. Echo does not implement sealed-sender–style metadata minimization; threat actors with server or legal access to logs can still infer social graphs and activity patterns.

## Client trust

Clients run in the browser (or embedded WebView). Malware, compromised extensions, or XSS against the Echo web origin can exfiltrate keys or plaintext after decryption. Users should treat device compromise as fatal to confidentiality for that device.

## Identity (TOFU)

Echo uses trust-on-first-use for remote identity keys (see LibSignal store `isTrustedIdentity`). Users can compare a locally derived **fingerprint** of their identity key with a contact out-of-band (see the Encryption devices UI). A silent key change by a MITM who also controls the server’s view of bundles is not fully ruled out without user verification.

## Attachments and rich content

Encrypted DMs currently allow **plain text only** on the wire; images, videos, GIFs, and attachment metadata are rejected when E2EE is enabled so they cannot bypass ciphertext as plaintext side channels.

## Operational dependencies

- **LiveKit E2EE** depends on client runtime support (insertable streams) and compatible LiveKit server versions; see `docs/operations/voice-e2ee-livekit.md`.
- **Database migrations** must include `echo_e2ee_devices.protocol_device_id` and related indexes for multi-device bundles.

## Roadmap notes

Post-quantum extensions (e.g. PQXDH) depend on upstream `libsignal` ecosystem support in the TypeScript port Echo uses; see `docs/security/libsignal-dependency-roadmap.md`.
