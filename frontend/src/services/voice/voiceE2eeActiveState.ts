import { ref } from 'vue';

/**
 * Channel key (`dm:<channelId>` or `<serverId>:<channelId>`) of the voice call
 * currently protected by E2EE media-frame encryption, else null.
 *
 * Lives in its own tiny module (not `voiceMlsSession`) so UI badges can read
 * it reactively without pulling the ts-mls / libsignal crypto stack into the
 * first-paint chunk. Written by the MLS session manager on start/stop.
 */
export const activeVoiceE2eeChannelKey = ref<string | null>(null);
