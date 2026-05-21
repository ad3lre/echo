# Voice end-to-end encryption (LiveKit-native)

Echo uses **LiveKit client-side E2EE** for **all DM/group voice calls** and optionally for **guild voice/stage channels** when enabled in channel settings (`voice_e2ee_enabled`; **off by default** for new voice/stage channels). Chat text is not E2EE; only voice media keys use the LibSignal envelope flow. Media is encrypted after encode and decrypted before decode; the SFU forwards **ciphertext** only.

## Version floor

- **Web client:** `livekit-client` **^2.18.x** (see `frontend/package.json`). Confirm your **self-hosted LiveKit server** version supports E2EE for the codecs you enable.
- **Desktop:** Uses the same WebView / WebRTC stack; E2EE depends on **insertable streams** and a current runtime. Treat outdated embedded browsers as unsupported for encrypted voice.

## Infrastructure and product constraints

- **Egress, cloud recording, and server-side subscribers** that expect decoded RTP **must not** be relied on for E2EE rooms. Without the epoch key, subscribers see unusable encrypted media (by design).
- **Agents, transcription, and moderation bots** that need cleartext audio require matching key material or must be disabled for those rooms.
- Prefer **disabling** decode-dependent features entirely for rooms where E2EE is on, rather than partial support.

## Scale limits

- Each voice E2EE epoch accepts at most **512** `(recipient user, device)` envelopes (multi-device distribution).
- Group DM voice is always E2EE; very large groups may exceed one epoch — cap encrypted group calls to what your plan allows, or ensure participants join in smaller waves so a new epoch can be created with a fresh recipient set.

## Epoch rotation policy

- **Guild/stage:** Active epochs are superseded when the **last** participant leaves the channel (LiveKit `participant_left` with an empty `echo_voice_participants` row). Joining does **not** supersede an epoch created during session mint.
- **DM/group DM:** Same “empty room” supersede on leave; keys also clear on `room_finished`.
- **Client rotation:** Only the epoch **creator** (or the first joiner with no active epoch) may POST a new epoch. Other clients must wait for an envelope or refresh — they must not POST a competing epoch (that disconnects everyone).
- Socket event `voice_e2ee_epoch_superseded` is always delivered (not version-gated). Guild clients auto-reconnect transport; DM clients re-run call join.

## Observability and runbook

- **Epoch rotation:** Clients receive `voice_e2ee_epoch_superseded` when someone else replaces the active epoch. Disconnect LiveKit and re-run prepare + session (or use in-app reconnect).
- **Session minting:** **409** `VOICE_E2EE_EPOCH_REQUIRED` / `VOICE_E2EE_ENVELOPE_MISSING` — complete epoch POST (or wait for distributor), pass `e2eeDeviceId` on livekit-session when using multi-device accounts.
- **Client traces:** Search logs for `voice.client:` events (e.g. `guild_e2ee_prepare_failed`, `dm_e2ee_prepare_failed`, LiveKit session and connect stages).

## Validation

- Confirm a subscriber **without** the E2EE key (test agent, egress recorder, or second client without `setKey`) **cannot** decode voice/video, consistent with LiveKit E2EE documentation.
