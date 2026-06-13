import { ConnectionState, type Room as LKRoom } from 'livekit-client';
import {
  decodeEchoCodenamesActivity,
  decodeEchoCodenamesClueIntent,
  decodeEchoCodenamesDealIntent,
  decodeEchoCodenamesEndTurnIntent,
  decodeEchoCodenamesKeyToOrchestrator,
  decodeEchoCodenamesNewGameIntent,
  decodeEchoCodenamesRevealIntent,
  decodeEchoCodenamesSetupIntent,
  decodeEchoCodenamesSpymasterKey,
  decodeEchoHangmanActivity,
  decodeEchoHangmanGuessIntent,
  decodeEchoHangmanNextRound,
  decodeEchoHangmanRoundSecret,
  decodeEchoSkrigglesActivity,
  decodeEchoSkrigglesCanvasCmd,
  decodeEchoSkrigglesCanvasSnapshot,
  decodeEchoSkrigglesGuessIntent,
  decodeEchoSkrigglesNextRoundIntent,
  decodeEchoSkrigglesRoundSecret,
  decodeEchoSkrigglesSettingsIntent,
  decodeEchoSkrigglesStartIntent,
  decodeEchoSkrigglesStrokeBatch,
  decodeEchoSkrigglesWordChoiceIntent,
  decodeEchoVcActivityPresence,
  decodeEchoYoutubeActivity,
  decodeEchoWatchTogetherActivity,
  encodeEchoCodenamesActivity,
  encodeEchoCodenamesClueIntent,
  encodeEchoCodenamesDealIntent,
  encodeEchoCodenamesEndTurnIntent,
  encodeEchoCodenamesKeyToOrchestrator,
  encodeEchoCodenamesNewGameIntent,
  encodeEchoCodenamesRevealIntent,
  encodeEchoCodenamesSetupIntent,
  encodeEchoCodenamesSpymasterKey,
  encodeEchoHangmanActivity,
  encodeEchoHangmanGuessIntent,
  encodeEchoHangmanNextRound,
  encodeEchoHangmanRoundSecret,
  encodeEchoSkrigglesActivity,
  encodeEchoSkrigglesCanvasCmd,
  encodeEchoSkrigglesCanvasSnapshot,
  encodeEchoSkrigglesGuessIntent,
  encodeEchoSkrigglesNextRoundIntent,
  encodeEchoSkrigglesRoundSecret,
  encodeEchoSkrigglesSettingsIntent,
  encodeEchoSkrigglesStartIntent,
  encodeEchoSkrigglesStrokeBatch,
  encodeEchoSkrigglesWordChoiceIntent,
  encodeEchoVcActivityPresence,
  encodeEchoYoutubeActivity,
  encodeEchoWatchTogetherActivity,
  type EchoCodenamesActivityV1,
  type EchoCodenamesClueIntentV1,
  type EchoCodenamesDealIntentV1,
  type EchoCodenamesEndTurnIntentV1,
  type EchoCodenamesKeyToOrchestratorV1,
  type EchoCodenamesNewGameIntentV1,
  type EchoCodenamesRevealIntentV1,
  type EchoCodenamesSetupIntentV1,
  type EchoCodenamesSpymasterKeyV1,
  type EchoHangmanActivityV1,
  type EchoHangmanGuessIntentV1,
  type EchoHangmanNextRoundV1,
  type EchoHangmanRoundSecretV1,
  type EchoSkrigglesActivityV1,
  type EchoSkrigglesCanvasCmdV1,
  type EchoSkrigglesCanvasSnapshotV1,
  type EchoSkrigglesGuessIntentV1,
  type EchoSkrigglesNextRoundIntentV1,
  type EchoSkrigglesRoundSecretV1,
  type EchoSkrigglesSettingsIntentV1,
  type EchoSkrigglesStartIntentV1,
  type EchoSkrigglesStrokeBatchV1,
  type EchoSkrigglesWordChoiceIntentV1,
  type EchoVcActivityPresenceV1,
  type EchoWatchTogetherActivityV1,
  type EchoYoutubeActivityV1,
} from '@/audio/voiceEchoLiveKitData';
import type { UseLiveKitVoiceRoomOptions } from '@/composables/livekitVoiceRoom.types';

export type VoiceDataReceiveHandlers = {
  onYoutubeActivity?: (
    msg: EchoYoutubeActivityV1,
    senderIdentity: string,
  ) => void;
  onWatchTogetherActivity?: (
    msg: EchoWatchTogetherActivityV1,
    senderIdentity: string,
  ) => void;
  onHangmanActivity?: (
    msg: EchoHangmanActivityV1,
    fromIdentity: string,
  ) => void;
  onHangmanGuessIntent?: (
    msg: EchoHangmanGuessIntentV1,
    fromIdentity: string,
  ) => void;
  onHangmanNextRound?: (
    msg: EchoHangmanNextRoundV1,
    fromIdentity: string,
  ) => void;
  onHangmanRoundSecret?: (
    msg: EchoHangmanRoundSecretV1,
    fromIdentity: string,
  ) => void;
  onCodenamesActivity?: (
    msg: EchoCodenamesActivityV1,
    fromIdentity: string,
  ) => void;
  onCodenamesSpymasterKey?: (
    msg: EchoCodenamesSpymasterKeyV1,
    fromIdentity: string,
  ) => void;
  onCodenamesKeyToOrchestrator?: (
    msg: EchoCodenamesKeyToOrchestratorV1,
    fromIdentity: string,
  ) => void;
  onCodenamesClueIntent?: (
    msg: EchoCodenamesClueIntentV1,
    fromIdentity: string,
  ) => void;
  onCodenamesRevealIntent?: (
    msg: EchoCodenamesRevealIntentV1,
    fromIdentity: string,
  ) => void;
  onCodenamesEndTurnIntent?: (
    msg: EchoCodenamesEndTurnIntentV1,
    fromIdentity: string,
  ) => void;
  onCodenamesSetupIntent?: (
    msg: EchoCodenamesSetupIntentV1,
    fromIdentity: string,
  ) => void;
  onCodenamesDealIntent?: (
    msg: EchoCodenamesDealIntentV1,
    fromIdentity: string,
  ) => void;
  onCodenamesNewGameIntent?: (
    msg: EchoCodenamesNewGameIntentV1,
    fromIdentity: string,
  ) => void;
  onSkrigglesActivity?: (
    msg: EchoSkrigglesActivityV1,
    fromIdentity: string,
  ) => void;
  onSkrigglesGuessIntent?: (
    msg: EchoSkrigglesGuessIntentV1,
    fromIdentity: string,
  ) => void;
  onSkrigglesWordChoiceIntent?: (
    msg: EchoSkrigglesWordChoiceIntentV1,
    fromIdentity: string,
  ) => void;
  onSkrigglesSettingsIntent?: (
    msg: EchoSkrigglesSettingsIntentV1,
    fromIdentity: string,
  ) => void;
  onSkrigglesStartIntent?: (
    msg: EchoSkrigglesStartIntentV1,
    fromIdentity: string,
  ) => void;
  onSkrigglesNextRoundIntent?: (
    msg: EchoSkrigglesNextRoundIntentV1,
    fromIdentity: string,
  ) => void;
  onSkrigglesRoundSecret?: (
    msg: EchoSkrigglesRoundSecretV1,
    fromIdentity: string,
  ) => void;
  onSkrigglesStrokeBatch?: (
    msg: EchoSkrigglesStrokeBatchV1,
    fromIdentity: string,
  ) => void;
  onSkrigglesCanvasCmd?: (
    msg: EchoSkrigglesCanvasCmdV1,
    fromIdentity: string,
  ) => void;
  onSkrigglesCanvasSnapshot?: (
    msg: EchoSkrigglesCanvasSnapshotV1,
    fromIdentity: string,
  ) => void;
  onVcActivityPresence?: (
    msg: EchoVcActivityPresenceV1,
    fromIdentity: string,
  ) => void;
};

/** Activity receive callbacks from {@link UseLiveKitVoiceRoomOptions}. */
export function voiceDataHandlersFromOpts(
  opts: UseLiveKitVoiceRoomOptions,
): VoiceDataReceiveHandlers {
  return {
    onYoutubeActivity: opts.onYoutubeActivity,
    onWatchTogetherActivity: opts.onWatchTogetherActivity,
    onHangmanActivity: opts.onHangmanActivity,
    onHangmanGuessIntent: opts.onHangmanGuessIntent,
    onHangmanNextRound: opts.onHangmanNextRound,
    onHangmanRoundSecret: opts.onHangmanRoundSecret,
    onCodenamesActivity: opts.onCodenamesActivity,
    onCodenamesSpymasterKey: opts.onCodenamesSpymasterKey,
    onCodenamesKeyToOrchestrator: opts.onCodenamesKeyToOrchestrator,
    onCodenamesClueIntent: opts.onCodenamesClueIntent,
    onCodenamesRevealIntent: opts.onCodenamesRevealIntent,
    onCodenamesEndTurnIntent: opts.onCodenamesEndTurnIntent,
    onCodenamesSetupIntent: opts.onCodenamesSetupIntent,
    onCodenamesDealIntent: opts.onCodenamesDealIntent,
    onCodenamesNewGameIntent: opts.onCodenamesNewGameIntent,
    onSkrigglesActivity: opts.onSkrigglesActivity,
    onSkrigglesGuessIntent: opts.onSkrigglesGuessIntent,
    onSkrigglesWordChoiceIntent: opts.onSkrigglesWordChoiceIntent,
    onSkrigglesSettingsIntent: opts.onSkrigglesSettingsIntent,
    onSkrigglesStartIntent: opts.onSkrigglesStartIntent,
    onSkrigglesNextRoundIntent: opts.onSkrigglesNextRoundIntent,
    onSkrigglesRoundSecret: opts.onSkrigglesRoundSecret,
    onSkrigglesStrokeBatch: opts.onSkrigglesStrokeBatch,
    onSkrigglesCanvasCmd: opts.onSkrigglesCanvasCmd,
    onSkrigglesCanvasSnapshot: opts.onSkrigglesCanvasSnapshot,
    onVcActivityPresence: opts.onVcActivityPresence,
  };
}

type PublishOpts = {
  destinationIdentities?: string[];
  reliable?: boolean;
};

export function publishVoiceData<T>(
  room: LKRoom | null,
  encode: (payload: T) => Uint8Array,
  payload: T,
  opts?: PublishOpts,
): void {
  if (!room || room.state !== ConnectionState.Connected) return;
  if (opts?.destinationIdentities) {
    const dest = opts.destinationIdentities
      .map((x) => x.trim())
      .filter(Boolean);
    if (!dest.length) return;
    void room.localParticipant.publishData(encode(payload), {
      reliable: opts.reliable ?? true,
      destinationIdentities: dest,
    });
    return;
  }
  void room.localParticipant.publishData(encode(payload), {
    reliable: opts?.reliable ?? true,
  });
}

export function toVoiceDataUint8Array(
  payload: Uint8Array | ArrayBufferLike,
): Uint8Array {
  return payload instanceof Uint8Array ? payload : new Uint8Array(payload);
}

/** Ordered decode chain for guild VC activity payloads (excludes VC public media toasts). */
export function routeVoiceDataReceived(
  payloadRaw: Uint8Array | ArrayBufferLike,
  senderIdentity: string,
  handlers: VoiceDataReceiveHandlers,
): boolean {
  const payload = toVoiceDataUint8Array(payloadRaw);

  const yt = decodeEchoYoutubeActivity(payload);
  if (yt) {
    handlers.onYoutubeActivity?.(yt, senderIdentity);
    return true;
  }

  const wt = decodeEchoWatchTogetherActivity(payload);
  if (wt) {
    handlers.onWatchTogetherActivity?.(wt, senderIdentity);
    return true;
  }

  const hmSecret = decodeEchoHangmanRoundSecret(payload);
  if (hmSecret) {
    handlers.onHangmanRoundSecret?.(hmSecret, senderIdentity);
    return true;
  }

  const hm = decodeEchoHangmanActivity(payload);
  if (hm) {
    handlers.onHangmanActivity?.(hm, senderIdentity);
    return true;
  }

  const hGuess = decodeEchoHangmanGuessIntent(payload);
  if (hGuess) {
    handlers.onHangmanGuessIntent?.(hGuess, senderIdentity);
    return true;
  }

  const hNext = decodeEchoHangmanNextRound(payload);
  if (hNext) {
    handlers.onHangmanNextRound?.(hNext, senderIdentity);
    return true;
  }

  const cn = decodeEchoCodenamesActivity(payload);
  if (cn) {
    handlers.onCodenamesActivity?.(cn, senderIdentity);
    return true;
  }

  const cnKey = decodeEchoCodenamesSpymasterKey(payload);
  if (cnKey) {
    handlers.onCodenamesSpymasterKey?.(cnKey, senderIdentity);
    return true;
  }

  const cnOrchKey = decodeEchoCodenamesKeyToOrchestrator(payload);
  if (cnOrchKey) {
    handlers.onCodenamesKeyToOrchestrator?.(cnOrchKey, senderIdentity);
    return true;
  }

  const cnClue = decodeEchoCodenamesClueIntent(payload);
  if (cnClue) {
    handlers.onCodenamesClueIntent?.(cnClue, senderIdentity);
    return true;
  }

  const cnRev = decodeEchoCodenamesRevealIntent(payload);
  if (cnRev) {
    handlers.onCodenamesRevealIntent?.(cnRev, senderIdentity);
    return true;
  }

  const cnEnd = decodeEchoCodenamesEndTurnIntent(payload);
  if (cnEnd) {
    handlers.onCodenamesEndTurnIntent?.(cnEnd, senderIdentity);
    return true;
  }

  const cnSetup = decodeEchoCodenamesSetupIntent(payload);
  if (cnSetup) {
    handlers.onCodenamesSetupIntent?.(cnSetup, senderIdentity);
    return true;
  }

  const cnDeal = decodeEchoCodenamesDealIntent(payload);
  if (cnDeal) {
    handlers.onCodenamesDealIntent?.(cnDeal, senderIdentity);
    return true;
  }

  const cnNg = decodeEchoCodenamesNewGameIntent(payload);
  if (cnNg) {
    handlers.onCodenamesNewGameIntent?.(cnNg, senderIdentity);
    return true;
  }

  const skSecret = decodeEchoSkrigglesRoundSecret(payload);
  if (skSecret) {
    handlers.onSkrigglesRoundSecret?.(skSecret, senderIdentity);
    return true;
  }

  const sk = decodeEchoSkrigglesActivity(payload);
  if (sk) {
    handlers.onSkrigglesActivity?.(sk, senderIdentity);
    return true;
  }

  const skGuess = decodeEchoSkrigglesGuessIntent(payload);
  if (skGuess) {
    handlers.onSkrigglesGuessIntent?.(skGuess, senderIdentity);
    return true;
  }

  const skWord = decodeEchoSkrigglesWordChoiceIntent(payload);
  if (skWord) {
    handlers.onSkrigglesWordChoiceIntent?.(skWord, senderIdentity);
    return true;
  }

  const skSettings = decodeEchoSkrigglesSettingsIntent(payload);
  if (skSettings) {
    handlers.onSkrigglesSettingsIntent?.(skSettings, senderIdentity);
    return true;
  }

  const skStart = decodeEchoSkrigglesStartIntent(payload);
  if (skStart) {
    handlers.onSkrigglesStartIntent?.(skStart, senderIdentity);
    return true;
  }

  const skNext = decodeEchoSkrigglesNextRoundIntent(payload);
  if (skNext) {
    handlers.onSkrigglesNextRoundIntent?.(skNext, senderIdentity);
    return true;
  }

  const skStroke = decodeEchoSkrigglesStrokeBatch(payload);
  if (skStroke) {
    handlers.onSkrigglesStrokeBatch?.(skStroke, senderIdentity);
    return true;
  }

  const skCmd = decodeEchoSkrigglesCanvasCmd(payload);
  if (skCmd) {
    handlers.onSkrigglesCanvasCmd?.(skCmd, senderIdentity);
    return true;
  }

  const skSnap = decodeEchoSkrigglesCanvasSnapshot(payload);
  if (skSnap) {
    handlers.onSkrigglesCanvasSnapshot?.(skSnap, senderIdentity);
    return true;
  }

  const pres = decodeEchoVcActivityPresence(payload);
  if (pres) {
    handlers.onVcActivityPresence?.(pres, senderIdentity);
    return true;
  }

  return false;
}

export type VoiceDataPublishers = {
  publishYoutubeActivity: (payload: EchoYoutubeActivityV1) => void;
  publishWatchTogetherActivity: (payload: EchoWatchTogetherActivityV1) => void;
  publishVcActivityPresence: (payload: EchoVcActivityPresenceV1) => void;
  publishHangmanActivity: (payload: EchoHangmanActivityV1) => void;
  publishHangmanGuessIntent: (payload: EchoHangmanGuessIntentV1) => void;
  publishHangmanNextRound: (payload: EchoHangmanNextRoundV1) => void;
  publishHangmanRoundSecret: (
    payload: EchoHangmanRoundSecretV1,
    destinationIdentities: string[],
  ) => void;
  publishCodenamesActivity: (payload: EchoCodenamesActivityV1) => void;
  publishCodenamesSpymasterKey: (
    payload: EchoCodenamesSpymasterKeyV1,
    destinationIdentities: string[],
  ) => void;
  publishCodenamesKeyToOrchestrator: (
    payload: EchoCodenamesKeyToOrchestratorV1,
    destinationIdentities: string[],
  ) => void;
  publishCodenamesClueIntent: (payload: EchoCodenamesClueIntentV1) => void;
  publishCodenamesRevealIntent: (payload: EchoCodenamesRevealIntentV1) => void;
  publishCodenamesEndTurnIntent: (
    payload: EchoCodenamesEndTurnIntentV1,
  ) => void;
  publishCodenamesSetupIntent: (payload: EchoCodenamesSetupIntentV1) => void;
  publishCodenamesDealIntent: (payload: EchoCodenamesDealIntentV1) => void;
  publishCodenamesNewGameIntent: (
    payload: EchoCodenamesNewGameIntentV1,
  ) => void;
  publishSkrigglesActivity: (payload: EchoSkrigglesActivityV1) => void;
  publishSkrigglesGuessIntent: (payload: EchoSkrigglesGuessIntentV1) => void;
  publishSkrigglesWordChoiceIntent: (
    payload: EchoSkrigglesWordChoiceIntentV1,
  ) => void;
  publishSkrigglesSettingsIntent: (
    payload: EchoSkrigglesSettingsIntentV1,
  ) => void;
  publishSkrigglesStartIntent: (payload: EchoSkrigglesStartIntentV1) => void;
  publishSkrigglesNextRoundIntent: (
    payload: EchoSkrigglesNextRoundIntentV1,
  ) => void;
  publishSkrigglesRoundSecret: (
    payload: EchoSkrigglesRoundSecretV1,
    destinationIdentities: string[],
  ) => void;
  publishSkrigglesStrokeBatch: (payload: EchoSkrigglesStrokeBatchV1) => void;
  publishSkrigglesCanvasCmd: (payload: EchoSkrigglesCanvasCmdV1) => void;
  publishSkrigglesCanvasSnapshot: (
    payload: EchoSkrigglesCanvasSnapshotV1,
  ) => void;
};

export function createVoiceDataPublishers(
  getRoom: () => LKRoom | null,
): VoiceDataPublishers {
  const pub = <T>(
    encode: (payload: T) => Uint8Array,
    payload: T,
    opts?: PublishOpts,
  ) => publishVoiceData(getRoom(), encode, payload, opts);

  return {
    publishYoutubeActivity: (payload) =>
      pub(encodeEchoYoutubeActivity, payload),
    publishWatchTogetherActivity: (payload) =>
      pub(encodeEchoWatchTogetherActivity, payload),
    publishVcActivityPresence: (payload) =>
      pub(encodeEchoVcActivityPresence, payload),
    publishHangmanActivity: (payload) =>
      pub(encodeEchoHangmanActivity, payload),
    publishHangmanGuessIntent: (payload) =>
      pub(encodeEchoHangmanGuessIntent, payload),
    publishHangmanNextRound: (payload) =>
      pub(encodeEchoHangmanNextRound, payload),
    publishHangmanRoundSecret: (payload, destinationIdentities) =>
      pub(encodeEchoHangmanRoundSecret, payload, { destinationIdentities }),
    publishCodenamesActivity: (payload) =>
      pub(encodeEchoCodenamesActivity, payload),
    publishCodenamesSpymasterKey: (payload, destinationIdentities) =>
      pub(encodeEchoCodenamesSpymasterKey, payload, { destinationIdentities }),
    publishCodenamesKeyToOrchestrator: (payload, destinationIdentities) =>
      pub(encodeEchoCodenamesKeyToOrchestrator, payload, {
        destinationIdentities,
      }),
    publishCodenamesClueIntent: (payload) =>
      pub(encodeEchoCodenamesClueIntent, payload),
    publishCodenamesRevealIntent: (payload) =>
      pub(encodeEchoCodenamesRevealIntent, payload),
    publishCodenamesEndTurnIntent: (payload) =>
      pub(encodeEchoCodenamesEndTurnIntent, payload),
    publishCodenamesSetupIntent: (payload) =>
      pub(encodeEchoCodenamesSetupIntent, payload),
    publishCodenamesDealIntent: (payload) =>
      pub(encodeEchoCodenamesDealIntent, payload),
    publishCodenamesNewGameIntent: (payload) =>
      pub(encodeEchoCodenamesNewGameIntent, payload),
    publishSkrigglesActivity: (payload) =>
      pub(encodeEchoSkrigglesActivity, payload),
    publishSkrigglesGuessIntent: (payload) =>
      pub(encodeEchoSkrigglesGuessIntent, payload),
    publishSkrigglesWordChoiceIntent: (payload) =>
      pub(encodeEchoSkrigglesWordChoiceIntent, payload),
    publishSkrigglesSettingsIntent: (payload) =>
      pub(encodeEchoSkrigglesSettingsIntent, payload),
    publishSkrigglesStartIntent: (payload) =>
      pub(encodeEchoSkrigglesStartIntent, payload),
    publishSkrigglesNextRoundIntent: (payload) =>
      pub(encodeEchoSkrigglesNextRoundIntent, payload),
    publishSkrigglesRoundSecret: (payload, destinationIdentities) =>
      pub(encodeEchoSkrigglesRoundSecret, payload, { destinationIdentities }),
    publishSkrigglesStrokeBatch: (payload) =>
      pub(encodeEchoSkrigglesStrokeBatch, payload, { reliable: false }),
    publishSkrigglesCanvasCmd: (payload) =>
      pub(encodeEchoSkrigglesCanvasCmd, payload),
    publishSkrigglesCanvasSnapshot: (payload) =>
      pub(encodeEchoSkrigglesCanvasSnapshot, payload),
  };
}
