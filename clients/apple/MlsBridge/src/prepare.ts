/**
 * Host-facing Apple voice E2EE prepare entry (Element Call–style media keys).
 * Bundled for WKWebView; network and KV storage are injected by Swift via
 * `globalThis.__echoMlsHost`.
 *
 * Globals keep the historical `__echoMlsPrepareDm` callback shape that
 * `EchoMlsJsRuntime` evaluates.
 */
import { bytesToBase64 } from '../shims/e2eeBase64.ts';
import {
  decryptVoiceMediaKeyInbox,
  fetchVoiceMediaKeyInbox,
  prepareVoiceMediaKeys,
} from '@/services/voice/e2ee/voiceMediaKeyPrepare';
import type { VoiceMediaKeyScope } from '@/services/voice/e2ee/voiceMediaKeySession';

export type AppleMlsPrepareInput = {
  channelId: string;
  token: string;
  viewerUserId: string;
  /** Stable device id from Swift Keychain when available. */
  deviceId?: string;
  authorizedUserIds: string[];
  /** When set, prepare guild (server) voice instead of a DM. */
  serverId?: string;
};

export type AppleMlsPrepareOutput = {
  keyIndex: number;
  epoch: string;
  deviceId: string;
  channelKey: string;
  /** LiveKit participant identity → base64 media key. */
  senderKeys: Record<string, string>;
};

type ActiveSession = {
  channelKey: string;
  scope: VoiceMediaKeyScope;
  viewerUserId: string;
  token: string;
  deviceId: string;
  mediaKey: ArrayBuffer;
  keyIndex: number;
};

let active: ActiveSession | null = null;

function encodeSenderKeys(
  senderKeys: ReadonlyMap<string, ArrayBuffer> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!senderKeys) return out;
  for (const [identity, raw] of senderKeys) {
    out[identity] = bytesToBase64(new Uint8Array(raw));
  }
  return out;
}

function localOnlyOutput(session: ActiveSession): AppleMlsPrepareOutput {
  const senderKeys = new Map<string, ArrayBuffer>();
  senderKeys.set(session.viewerUserId, session.mediaKey);
  return {
    keyIndex: session.keyIndex,
    epoch: String(session.keyIndex),
    deviceId: session.deviceId,
    channelKey: session.channelKey,
    senderKeys: encodeSenderKeys(senderKeys),
  };
}

async function prepareDmVoiceMedia(
  input: AppleMlsPrepareInput,
): Promise<AppleMlsPrepareOutput> {
  const serverId = input.serverId?.trim() ?? '';
  const scope: VoiceMediaKeyScope = serverId
    ? { kind: 'guild', serverId, channelId: input.channelId }
    : { kind: 'dm', channelId: input.channelId };
  const result = await prepareVoiceMediaKeys({
    scope,
    token: input.token,
    viewerUserId: input.viewerUserId,
    memberUserIds: input.authorizedUserIds,
    // Only prefer Keychain id when it matches the registered LibSignal device;
    // a stale MLS-era UUID must not override announce/mint device identity.
    preferredDeviceId: input.deviceId,
  });
  // Server has voice E2EE off — success with no LiveKit key material.
  // Returning JSON null used to surface as "Invalid MLS prepare result" on iOS.
  if (!result.mediaKey || !result.channelKey) {
    return {
      keyIndex: 0,
      epoch: '0',
      deviceId: result.senderDeviceId || input.deviceId || '',
      channelKey: '',
      senderKeys: {},
    };
  }
  active = {
    channelKey: result.channelKey,
    scope,
    viewerUserId: input.viewerUserId.trim(),
    token: input.token,
    deviceId: result.senderDeviceId,
    mediaKey: result.mediaKey,
    keyIndex: result.keyIndex ?? 0,
  };
  return {
    keyIndex: result.keyIndex ?? 0,
    epoch: String(result.keyIndex ?? 0),
    deviceId: result.senderDeviceId,
    channelKey: result.channelKey,
    senderKeys: encodeSenderKeys(result.senderKeys),
  };
}

async function syncActiveVoiceMedia(): Promise<AppleMlsPrepareOutput | null> {
  if (!active) return null;
  const inbox = await fetchVoiceMediaKeyInbox({
    scope: active.scope,
    token: active.token,
  });
  if (inbox === 'disabled' || inbox.length === 0) {
    return localOnlyOutput(active);
  }
  const decrypted = await decryptVoiceMediaKeyInbox({
    envelopes: inbox,
    viewerUserId: active.viewerUserId,
  });
  const senderKeys = new Map<string, ArrayBuffer>();
  senderKeys.set(active.viewerUserId, active.mediaKey);
  let maxIndex = active.keyIndex;
  for (const [identity, k] of decrypted) {
    senderKeys.set(identity, k.raw);
    if (k.keyIndex > maxIndex) maxIndex = k.keyIndex;
  }
  active.keyIndex = maxIndex;
  return {
    keyIndex: maxIndex,
    epoch: String(maxIndex),
    deviceId: active.deviceId,
    channelKey: active.channelKey,
    senderKeys: encodeSenderKeys(senderKeys),
  };
}

async function stopActiveVoiceMedia(): Promise<{ stopped: true }> {
  active = null;
  return { stopped: true };
}

declare global {
  // eslint-disable-next-line no-var
  var __echoMlsPrepareDm: (
    inputJson: string,
    callback: (error: string | null, resultJson: string | null) => void,
  ) => void;
  // eslint-disable-next-line no-var
  var __echoMlsSync: (
    callback: (error: string | null, resultJson: string | null) => void,
  ) => void;
  // eslint-disable-next-line no-var
  var __echoMlsReconcile: (
    callback: (error: string | null, resultJson: string | null) => void,
  ) => void;
  // eslint-disable-next-line no-var
  var __echoMlsStop: (
    callback: (error: string | null, resultJson: string | null) => void,
  ) => void;
  // eslint-disable-next-line no-var
  var __echoMlsSetAuthorized: (idsJson: string) => void;
}

function report(
  callback: (error: string | null, resultJson: string | null) => void,
  run: () => Promise<unknown>,
): void {
  void (async () => {
    try {
      const result = await run();
      callback(null, JSON.stringify(result ?? null));
    } catch (e) {
      let message = 'Voice E2EE prepare failed';
      if (e instanceof Error) {
        message = e.message || message;
        if (e.stack) message = `${message}\n${e.stack}`;
      } else if (typeof e === 'string') {
        message = e;
      } else {
        try {
          message = `Voice E2EE prepare failed: ${JSON.stringify(e)}`;
        } catch {
          message = `Voice E2EE prepare failed: ${String(e)}`;
        }
      }
      callback(message, null);
    }
  })();
}

globalThis.__echoMlsPrepareDm = (inputJson, callback) => {
  report(callback, async () => {
    const input = JSON.parse(inputJson) as AppleMlsPrepareInput;
    return prepareDmVoiceMedia(input);
  });
};

globalThis.__echoMlsSync = (callback) => {
  report(callback, () => syncActiveVoiceMedia());
};

globalThis.__echoMlsReconcile = (callback) => {
  report(callback, () => syncActiveVoiceMedia());
};

globalThis.__echoMlsStop = (callback) => {
  report(callback, () => stopActiveVoiceMedia());
};

globalThis.__echoMlsSetAuthorized = (_idsJson) => {
  /* Element Call–style keys do not keep an MLS authorized roster. */
};
