# LibSignal / `@privacyresearch/libsignal-protocol-typescript` roadmap

Echo’s DM cryptography is built on `@privacyresearch/libsignal-protocol-typescript` (see `frontend/package.json`). This note captures maintenance expectations relative to “industry standard” Signal-class messengers.

## Current posture

- **X25519 / AES** session setup via prekey bundles and the double ratchet, aligned with classic Signal Protocol semantics.
- **Signed prekey rotation** is enforced client-side on a 14-day cadence (see `ensureEchoSignalBootstrap` in `frontend/src/services/e2ee/e2eeSignalStore.ts`), with hourly throttled re-upload of device material so servers advertise fresh signed keys without spamming `POST /e2ee/devices/register`.
- **Multi-device** uses distinct LibSignal `SignalProtocolAddress` numeric device ids (`protocol_device_id` in Postgres), separate from the UUID `device_id` stored for UX and voice envelope routing.

## Post-quantum (PQ)

Signal has been moving toward **PQXDH** and related hybrid designs in native clients. The TypeScript port Echo depends on may lag native `libsignal`. Before claiming PQ readiness:

1. Track releases of `@privacyresearch/libsignal-protocol-typescript` (or a maintained fork).
2. Re-run interoperability and upgrade tests whenever bumping the major/minor line.
3. Prefer upstream guidance on session versioning when PQ prekeys appear.

## Action items for operators

- Pin and periodically review the libsignal dependency in security-sensitive release branches.
- Schedule periodic **third-party crypto review** when E2EE scope expands (group MLS, attachments-in-ciphertext, etc.).
