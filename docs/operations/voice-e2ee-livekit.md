# Voice end-to-end encryption (LiveKit-native)

Echo can require **LiveKit client-side E2EE** for DM calls (when the DM thread has text E2EE enabled) and for **guild voice channels** flagged with `voiceE2eeEnabled`. Media is encrypted after encode and decrypted before decode; the SFU forwards **ciphertext** only.

## Version floor

- **Web client:** `livekit-client` **^2.18.x** (see `frontend/package.json`). Confirm your **self-hosted LiveKit server** version supports E2EE for the codecs you enable.
- **Desktop:** Uses the same WebView / WebRTC stack; E2EE depends on **insertable streams** and a current runtime. Treat outdated embedded browsers as unsupported for encrypted voice.

## Infrastructure and product constraints

- **Egress, cloud recording, and server-side subscribers** that expect decoded RTP **must not** be relied on for E2EE rooms. Without the epoch key, subscribers see unusable encrypted media (by design).
- **Agents, transcription, and moderation bots** that need cleartext audio require matching key material or must be disabled for those rooms.
- Prefer **disabling** decode-dependent features entirely for rooms where E2EE is on, rather than partial support.

## Observability and runbook

- **Epoch rotation:** Clients receive `voice_e2ee_epoch_superseded` over the workspace socket when the active media epoch is replaced (e.g. guild participant set changes). Clients should disconnect LiveKit and re-run the envelope + join flow.
- **Session minting:** If the API returns **409** or errors about missing epoch/envelopes, treat as a **handshake or ordering** issue: ensure the client completed the LibSignal-backed epoch POST, then retry LiveKit session after hydration.
- **Client traces:** Search logs for `voice.client:` events (e.g. `guild_e2ee_prepare_failed`, `dm_e2ee_prepare_failed`, LiveKit session and connect stages).

## Validation

- Confirm a subscriber **without** the E2EE key (test agent, egress recorder, or second client without `setKey`) **cannot** decode voice/video, consistent with LiveKit E2EE documentation.
