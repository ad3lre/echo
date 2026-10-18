/**
 * Host-facing Apple voice E2EE prepare entry (Element Call–style media keys).
 * Bundled for WKWebView; network and KV storage are injected by Swift via
 * `globalThis.__echoMlsHost`.
 *
 * Globals keep the historical `__echoMlsPrepareDm` callback shape that
 * `EchoMlsJsRuntime` evaluates.
 */
import { bytesToBase64 } from '../shims/e2eeBase64.ts';
import { prepareVoiceMediaKeys } from '@/services/voice/e2ee/voiceMediaKeyPrepare';

export type AppleMlsPrepareInput = {
  channelId: string;
  token: string;
  viewerUserId: string;
  /** Stable device id from Swift Keychain when available. */
  deviceId?: string;
  authorizedUserIds: string[];
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

async function prepareDmVoiceMedia(
  input: AppleMlsPrepareInput,
): Promise<AppleMlsPrepareOutput | null> {
  const result = await prepareVoiceMediaKeys({
    scope: { kind: 'dm', channelId: input.channelId },
    token: input.token,
    viewerUserId: input.viewerUserId,
    memberUserIds: input.authorizedUserIds,
    preferredDeviceId: input.deviceId,
  });
  if (!result.mediaKey || !result.channelKey) return null;
  active = {
    channelKey: result.channelKey,
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

async function syncActiveVoiceMedia(): Promise<null> {
  return null;
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
