/**
 * Host-facing Apple MLS prepare entry. Bundled for WKWebView; network and KV
 * storage are injected by Swift via `globalThis.__echoMlsHost`.
 *
 * Keeps an active EchoMlsGroupClient for the duration of the call so mid-call
 * delivery-log sync and leave can rotate LiveKit keys without a full reconnect.
 *
 * Device ownership for MLS commits uses a lightweight `/e2ee/devices/register`
 * upsert (identity key only) — Apple does not need the full LibSignal stack
 * for voice MLS.
 */
import { bytesToBase64 } from '../shims/e2eeBase64.ts';
import { echoFetch } from '@/api/echo/transport';
import {
  echoSignalPersistenceGet,
  echoSignalPersistenceSet,
} from '@/services/e2ee/e2eeSignalPersistence';
import { EchoMlsGroupClient } from '@/services/voice/mls/mlsGroupClient';
import type { EchoMlsEpochKey } from '@/services/voice/mls/mlsGroupClient';

const KEYRING_SIZE = 16;

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

export type AppleMlsEpochOutput = {
  keyIndex: number;
  epoch: string;
  senderKeys: Record<string, string>;
} | null;

type ActiveSession = {
  channelKey: string;
  client: EchoMlsGroupClient;
  authorizedUserIds: string[];
};

let active: ActiveSession | null = null;

function channelKeyForDm(channelId: string): string {
  return `dm:${channelId}`;
}

function encodeEpoch(epochKey: EchoMlsEpochKey): AppleMlsEpochOutput {
  const senderKeys: Record<string, string> = {};
  for (const [identity, raw] of epochKey.senderKeys) {
    senderKeys[identity] = bytesToBase64(new Uint8Array(raw));
  }
  return {
    keyIndex: epochKey.keyIndex,
    epoch: epochKey.epoch,
    senderKeys,
  };
}

function randomDeviceId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID().toLowerCase();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function ensureRegisteredVoiceDevice(
  viewerUserId: string,
  token: string,
  preferredDeviceId: string | undefined,
): Promise<string> {
  const idKey = `echo_mls_v1:${viewerUserId}:voice_device_id`;
  const pubKey = `echo_mls_v1:${viewerUserId}:voice_identity_pub`;
  let deviceId =
    preferredDeviceId?.trim() || (await echoSignalPersistenceGet(idKey)) || '';
  if (!deviceId) {
    deviceId = randomDeviceId();
    await echoSignalPersistenceSet(idKey, deviceId);
  }

  let identityKey = (await echoSignalPersistenceGet(pubKey)) || '';
  if (!identityKey) {
    // X25519 identity material for the device row. MLS uses a separate Ed25519
    // leaf; this key only satisfies echo_e2ee_devices ownership checks.
    const pair = await crypto.subtle.generateKey({ name: 'X25519' }, true, [
      'deriveBits',
    ]);
    const raw = new Uint8Array(
      await crypto.subtle.exportKey('raw', pair.publicKey),
    );
    identityKey = bytesToBase64(raw);
    await echoSignalPersistenceSet(pubKey, identityKey);
  }

  await echoFetch(token, '/e2ee/devices/register', {
    method: 'POST',
    body: JSON.stringify({
      deviceId,
      identityKey,
      registrationId: 1,
    }),
  });
  return deviceId;
}

async function stopActive(): Promise<void> {
  const prev = active;
  active = null;
  if (!prev) return;
  try {
    await prev.client.leave();
  } catch {
    /* best-effort teardown */
  }
}

export async function prepareDmVoiceMls(
  input: AppleMlsPrepareInput,
): Promise<AppleMlsPrepareOutput> {
  const channelId = input.channelId.trim();
  const viewerUserId = input.viewerUserId.trim();
  if (!channelId || !viewerUserId || !input.token.trim()) {
    throw new Error('MLS prepare requires channelId, viewerUserId, and token.');
  }

  const deviceId = await ensureRegisteredVoiceDevice(
    viewerUserId,
    input.token,
    input.deviceId,
  );

  await stopActive();

  const authorized = [
    ...new Set(
      [viewerUserId, ...input.authorizedUserIds.map((s) => s.trim())].filter(
        Boolean,
      ),
    ),
  ];
  const channelKey = channelKeyForDm(channelId);
  const session: ActiveSession = {
    channelKey,
    authorizedUserIds: authorized,
    client: null as unknown as EchoMlsGroupClient,
  };
  session.client = new EchoMlsGroupClient({
    scope: { kind: 'dm', channelId },
    viewerUserId,
    deviceId,
    token: input.token,
    keyringSize: KEYRING_SIZE,
    getAuthorizedUserIds: () => session.authorizedUserIds,
  });
  const epochKey = await session.client.start();
  active = session;

  const encoded = encodeEpoch(epochKey);
  if (!encoded) throw new Error('MLS prepare produced no epoch key.');
  return {
    ...encoded,
    deviceId,
    channelKey,
  };
}

export async function syncActiveVoiceMls(): Promise<AppleMlsEpochOutput> {
  if (!active) return null;
  const next = await active.client.sync();
  return next ? encodeEpoch(next) : null;
}

export async function reconcileActiveVoiceMls(): Promise<AppleMlsEpochOutput> {
  if (!active) return null;
  const next = await active.client.reconcileRoster();
  return next ? encodeEpoch(next) : null;
}

export async function stopActiveVoiceMls(): Promise<void> {
  await stopActive();
}

export function setActiveAuthorizedUserIds(ids: string[]): void {
  if (!active) return;
  active.authorizedUserIds = [
    ...new Set(ids.map((s) => s.trim()).filter(Boolean)),
  ];
}

export function activeChannelKey(): string | null {
  return active?.channelKey ?? null;
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
      let message = 'MLS operation failed';
      if (e instanceof Error) {
        message = e.message || message;
        if (e.stack) message = `${message}\n${e.stack}`;
      } else if (typeof e === 'string') {
        message = e;
      } else {
        try {
          message = `MLS operation failed: ${JSON.stringify(e)}`;
        } catch {
          message = `MLS operation failed: ${String(e)}`;
        }
      }
      callback(message, null);
    }
  })();
}

globalThis.__echoMlsPrepareDm = (inputJson, callback) => {
  report(callback, async () => {
    const input = JSON.parse(inputJson) as AppleMlsPrepareInput;
    return prepareDmVoiceMls(input);
  });
};

globalThis.__echoMlsSync = (callback) => {
  report(callback, () => syncActiveVoiceMls());
};

globalThis.__echoMlsReconcile = (callback) => {
  report(callback, () => reconcileActiveVoiceMls());
};

globalThis.__echoMlsStop = (callback) => {
  report(callback, async () => {
    await stopActiveVoiceMls();
    return { stopped: true };
  });
};
