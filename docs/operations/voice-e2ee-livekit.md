# Voice end-to-end encryption (LiveKit-native)

## Status (2026-10) — Element Call–style media keys

Voice media uses **LiveKit client-side frame E2EE** (maintained open-source
path). Key agreement is **Element Call–style per-participant media keys**
wrapped with LibSignal for peer devices — not custom MLS (`ts-mls`).

Private (DM / group-DM) call E2EE remains **off by default** until the new
path is validated in staging. Guild channel E2EE remains opt-in via channel
settings (`voice_e2ee_enabled`).

| Knob                                | Default | Opt-in              |
| ----------------------------------- | ------- | ------------------- |
| Server `ECHO_DM_VOICE_E2EE_ENABLED` | off     | `true` / `1` / `on` |
| Client `VITE_DM_VOICE_E2EE`         | off     | `1` / `true` / `on` |

Both must be enabled together for private-call E2EE.

### Architecture

1. Each joiner generates a random 32-byte **sender media key**.
2. The key is installed on LiveKit `EchoParticipantKeyProvider` (per-sender,
   16-slot keyring) under the participant’s LiveKit identity.
3. The key is LibSignal-wrapped for each peer `(user, device)` and posted to
   `/voice/e2ee/media-keys` (opaque ciphertext only).
4. Peers are notified via socket `voice_media_key`, pull their inbox, decrypt,
   and install sender keys in-band (no reconnect).
5. On remote join/leave, participants **rotate** their sender key and
   re-announce (rotation-based forward secrecy).

Session mint **does not** gate on MLS groups or v1 epochs — it only reports
`voiceE2ee.required`. Key readiness is peer-to-peer after connect.

### Known historical failures (MLS / v1 — fixed by this design)

1. **`VOICE_E2EE_EPOCH_REQUIRED` / prepare races** — mint no longer requires
   a pre-created epoch or MLS group.
2. **Answer toast no-op** — callee can mint and connect; keys arrive via
   announce/inbox without blocking the token.
3. **Asymmetric first-joiner ordering** — no single epoch creator.

**When re-enabling DM E2EE:** run updated voice join e2e scenarios and a
two-device mobile↔desktop answer matrix; confirm no privacy-setup dialog and
that Answer attaches LiveKit media within ~2s.

---

## Version floor

- **Web client:** `livekit-client` **^2.18.x** (see `clients/web/package.json`).
- **Desktop:** Same WebView / WebRTC stack; E2EE needs insertable streams.

## Infrastructure and product constraints

- **Egress, cloud recording, and server-side subscribers** that expect decoded
  RTP must not be relied on for E2EE rooms.
- **Agents / transcription / moderation bots** that need cleartext require key
  material or must be disabled for those rooms.

## Key rotation policy

Membership change (LiveKit ParticipantConnected / Disconnected) triggers a
local sender-key rotate + re-announce. Keyring slots retain prior indices so
in-flight frames still decrypt briefly. When the room empties, the webhook
clears `echo_voice_media_key_envelopes` for the channel.

## Observability

- Client traces: `voice.client:lk_e2ee_*`, `voice.client:media_key_sync_failed`,
  `dm_e2ee_prepare_failed`, `guild_e2ee_prepare_failed`.
- Socket: `voice_media_key` (notify-to-pull).

## Validation

Confirm a subscriber **without** the E2EE key cannot decode media, consistent
with LiveKit E2EE documentation.
