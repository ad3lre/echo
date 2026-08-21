import {
  getEchoE2eeDevices,
  postEchoE2eeDeviceRegister,
} from '@/api/echo/e2ee';
import {
  echoSignalPersistenceGet,
  echoSignalPersistenceSet,
} from '@/services/e2ee/e2eeSignalPersistence';
import {
  ensureEchoSignalBootstrap,
  setCachedLocalProtocolDeviceId,
} from '@/services/e2ee/e2eeSignalStore';
import type { E2eeDeviceRegistration } from '@/services/e2ee/e2eeTypes';

const DEVICE_REGISTER_MIN_INTERVAL_MS = 3600000;

export type LocalE2eeDevice = {
  deviceId: string;
  identityKey: string;
};

/** Hydrates LibSignal protocol device id from the server device list (multi-device receive). */
export async function syncEchoE2eeLocalProtocolDeviceId(
  userId: string | undefined,
  token: string | null | undefined,
): Promise<void> {
  const uid = userId?.trim();
  if (!uid || !token?.trim()) return;
  const { registration } = await ensureEchoSignalBootstrap(uid);
  const regKey = `echo_sig_v1:${uid}:e2ee_device_register_ms`;
  const lastReg = Number((await echoSignalPersistenceGet(regKey)) ?? '0');
  if (
    !Number.isFinite(lastReg) ||
    Date.now() - lastReg > DEVICE_REGISTER_MIN_INTERVAL_MS
  ) {
    await postEchoE2eeDeviceRegister(token, registration);
    await echoSignalPersistenceSet(regKey, String(Date.now()));
  }
  const { devices } = await getEchoE2eeDevices(token);
  const row = devices.find(
    (d: { deviceId: string; revokedAt?: string | null }) =>
      d.deviceId === registration.deviceId && !d.revokedAt,
  );
  if (
    row &&
    typeof row.protocolDeviceId === 'number' &&
    Number.isInteger(row.protocolDeviceId) &&
    row.protocolDeviceId >= 1
  ) {
    await setCachedLocalProtocolDeviceId(uid, row.protocolDeviceId);
  }
}

export async function getOrCreateLocalE2eeDevice(
  authorUserId: string | undefined,
  authToken?: string | null,
): Promise<LocalE2eeDevice> {
  const uid = authorUserId?.trim();
  if (!uid) throw new Error('authorUserId required for E2EE device material');
  const { registration } = await ensureEchoSignalBootstrap(uid);
  try {
    await syncEchoE2eeLocalProtocolDeviceId(uid, authToken);
  } catch {
    // Best-effort: a transient registration sync failure must not block the
    // voice call. The local device key material is still valid; peers may not
    // be able to look up our device until the next successful sync, but the
    // epoch retry / key-rotation flow will recover when connectivity returns.
  }
  return {
    deviceId: registration.deviceId,
    identityKey: registration.identityKey,
  };
}

export async function buildE2eeDeviceRegistration(
  authorUserId: string | undefined,
): Promise<E2eeDeviceRegistration> {
  const uid = authorUserId?.trim();
  if (!uid)
    throw new Error('authorUserId required for E2EE device registration');
  const { registration } = await ensureEchoSignalBootstrap(uid);
  return registration;
}
