import {
  getOrCreateLocalE2eeDevice,
  syncEchoE2eeLocalProtocolDeviceId,
} from '@/services/e2ee/e2eeDeviceStore';
import { activeVoiceE2eeChannelKey } from '@/services/voice/voiceE2eeActiveState';
import { ECHO_MLS_KEYRING_SIZE } from './echoMlsKeyProvider';
import { EchoMlsGroupClient, type EchoMlsEpochKey } from './mlsGroupClient';
import type { MlsScope } from './mlsDeliveryClient';
import type { EchoCredentialIdentity } from './mlsCredential';

/**
 * Process-wide holder for the active call's MLS group client. The LiveKit key
 * provider lives in `useLiveKitVoiceRoom` (it owns the room/worker); this manager
 * only drives the MLS protocol and produces per-epoch media keys. Rotation is
 * applied by the caller via `liveKitVoiceApi.rotateEpochKey(...)`.
 */
type ActiveSession = {
  channelKey: string;
  client: EchoMlsGroupClient;
  /** Live authorized roster (user ids incl. self); updated as the call roster changes. */
  authorizedUserIds: string[];
};

let active: ActiveSession | null = null;

export function mlsChannelKey(scope: MlsScope): string {
  return scope.kind === 'dm'
    ? `dm:${scope.channelId}`
    : `${scope.serverId}:${scope.channelId}`;
}

export function activeVoiceMlsChannelKey(): string | null {
  return active?.channelKey ?? null;
}

export type StartVoiceMlsOptions = {
  scope: MlsScope;
  viewerUserId: string;
  token: string;
  /** Initial authorized roster (user ids); update later via {@link setVoiceMlsAuthorizedUserIds}. */
  authorizedUserIds: string[];
  onIdentityChanged?: (peer: EchoCredentialIdentity) => void;
};

/** Update the live authorized roster used by committer-side leave reconciliation. */
export function setVoiceMlsAuthorizedUserIds(
  channelKey: string,
  ids: string[],
): void {
  if (active && active.channelKey === channelKey) {
    active.authorizedUserIds = [
      ...new Set(ids.map((s) => s.trim()).filter(Boolean)),
    ];
  }
}

/**
 * Join (or create) the channel's MLS group and return the initial epoch media
 * key for the LiveKit key provider. Tears down any previous session first.
 */
export async function startVoiceMlsSession(
  opts: StartVoiceMlsOptions,
): Promise<{ epochKey: EchoMlsEpochKey; senderDeviceId: string }> {
  await stopVoiceMlsSession();
  const dev = await getOrCreateLocalE2eeDevice(opts.viewerUserId, opts.token);
  // MLS commits are rejected when the device row is missing on the server.
  await syncEchoE2eeLocalProtocolDeviceId(opts.viewerUserId, opts.token);
  const channelKey = mlsChannelKey(opts.scope);
  const initialRoster = [
    ...new Set(
      [opts.viewerUserId, ...opts.authorizedUserIds]
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  const session: ActiveSession = {
    channelKey,
    authorizedUserIds: initialRoster,
    client: null as unknown as EchoMlsGroupClient,
  };
  session.client = new EchoMlsGroupClient({
    scope: opts.scope,
    viewerUserId: opts.viewerUserId,
    deviceId: dev.deviceId,
    token: opts.token,
    keyringSize: ECHO_MLS_KEYRING_SIZE,
    getAuthorizedUserIds: () => session.authorizedUserIds,
    onIdentityChanged: opts.onIdentityChanged,
  });
  const epochKey = await session.client.start();
  active = session;
  activeVoiceE2eeChannelKey.value = channelKey;
  return { epochKey, senderDeviceId: dev.deviceId };
}

/** Pull + apply delivery-log messages; returns a new epoch key if it advanced. */
export async function syncVoiceMlsSession(
  channelKey: string,
): Promise<EchoMlsEpochKey | null> {
  if (!active || active.channelKey !== channelKey) return null;
  return active.client.sync();
}

/**
 * Remove members who left the call (forward secrecy) if this client is the
 * deterministic committer; returns a new epoch key if we committed.
 */
export async function reconcileVoiceMlsSession(
  channelKey: string,
): Promise<EchoMlsEpochKey | null> {
  if (!active || active.channelKey !== channelKey) return null;
  return active.client.reconcileRoster();
}

export async function stopVoiceMlsSession(): Promise<void> {
  const prev = active;
  active = null;
  activeVoiceE2eeChannelKey.value = null;
  if (prev) {
    try {
      await prev.client.leave();
    } catch {
      /* best-effort teardown */
    }
  }
}
