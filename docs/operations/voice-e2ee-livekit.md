# Voice end-to-end encryption (LiveKit-native)

Echo uses **LiveKit client-side E2EE** for **all DM/group voice calls** (default on; opt out with `ECHO_DM_VOICE_E2EE_ENABLED=false`) and optionally for **guild voice/stage channels** when enabled in channel settings (`voice_e2ee_enabled`; **off by default** for new voice/stage channels). Chat text is not E2EE. Media is encrypted after encode and decrypted before decode; the SFU forwards **ciphertext** only.

## Key agreement protocols

- **MLS (v2, default):** Each call has an MLS group (RFC 9420, `ts-mls`). Members join via external commit, departures are removed by the deterministic committer, and the LiveKit media key is derived from the group's epoch exporter secret — the same architecture as Discord's DAVE protocol. The server (`echo_mls_*` tables) is an untrusted delivery service and never sees key material. Late joiners rekey themselves; no participant has to redistribute anything. Opt out per client build with `VITE_VOICE_E2EE_V2=0`.
- **Legacy envelopes (v1):** A static 32-byte seed wrapped per recipient device with LibSignal. Only the epoch creator can rekey, so late joiners without an envelope are locked out until the call ends. Kept for old clients only; the LiveKit session-mint gate accepts **either** an MLS group or a v1 epoch+envelope.

## Version floor

- **Web client:** `livekit-client` **^2.18.x** (see `frontend/package.json`). Confirm your **self-hosted LiveKit server** version supports E2EE for the codecs you enable.
- **Desktop:** Uses the same WebView / WebRTC stack; E2EE depends on **insertable streams** and a current runtime. Treat outdated embedded browsers as unsupported for encrypted voice.

## Infrastructure and product constraints

- **Egress, cloud recording, and server-side subscribers** that expect decoded RTP **must not** be relied on for E2EE rooms. Without the epoch key, subscribers see unusable encrypted media (by design).
- **Agents, transcription, and moderation bots** that need cleartext audio require matching key material or must be disabled for those rooms.
- Prefer **disabling** decode-dependent features entirely for rooms where E2EE is on, rather than partial support.

## Scale limits

- MLS (v2) has no server-imposed envelope cap; group size is bounded by handshake cost per membership change.
- Legacy v1 epochs accept at most **512** `(recipient user, device)` envelopes (multi-device distribution).

## Key rotation policy

- **MLS (v2):** The group epoch advances on every membership change (external-commit join; committer removal on leave), rotating the media key in-band via the LiveKit key provider's 16-slot keyring — no disconnect required. A client that falls off the epoch (removed, fork, missed history) recovers with a resync external commit. When the room fully empties (`participant_left` with no rows left, or `room_finished`), the server drops the MLS group and handshake log so the next call starts a fresh group at epoch 0.
- **Legacy v1:** Active epochs are superseded when the **last** participant leaves; only the epoch **creator** may POST a new epoch. Socket event `voice_e2ee_epoch_superseded` triggers disconnect + rejoin.

## Observability and runbook

- **Session minting:** **409** `VOICE_E2EE_EPOCH_REQUIRED` / `VOICE_E2EE_ENVELOPE_MISSING` occurs only on the legacy v1 path (no MLS group exists). MLS clients create/join the group during prepare, before the mint.
- **MLS handshake fan-out:** Socket event `voice_mls_message` prompts clients to pull the delivery log (`…/voice/mls/messages`) and apply commits/proposals.
- **Client traces:** Search logs for `voice.client:` events (e.g. `guild_e2ee_prepare_failed`, `dm_e2ee_prepare_failed`, `lk_e2ee_epoch_rotated`, LiveKit session and connect stages).

## Validation

- Confirm a subscriber **without** the E2EE key (test agent, egress recorder, or second client without `setKey`) **cannot** decode voice/video, consistent with LiveKit E2EE documentation.
