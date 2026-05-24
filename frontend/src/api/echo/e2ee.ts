import { echoFetch } from '@/api/echo/transport';
import type { E2eeDeviceRegistration } from '@/services/e2ee/e2eeTypes';

export type EchoE2eeDeviceListRow = {
  deviceId: string;
  protocolDeviceId: number;
  createdAt: string;
  revokedAt: string | null;
};

export async function postEchoE2eeDeviceRegister(
  token: string | null | undefined,
  body: E2eeDeviceRegistration,
): Promise<void> {
  await echoFetch(token, `/e2ee/devices/register`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function postEchoE2eePrekeysRefresh(
  token: string | null | undefined,
  body: { deviceId: string; oneTimePrekeys: unknown },
): Promise<void> {
  await echoFetch(token, `/e2ee/prekeys/refresh`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getEchoE2eeDevices(
  token: string | null | undefined,
): Promise<{ devices: EchoE2eeDeviceListRow[] }> {
  return await echoFetch(token, `/e2ee/devices`, { method: 'GET' });
}

export async function postEchoRevokeE2eeDevice(
  token: string | null | undefined,
  deviceId: string,
): Promise<void> {
  await echoFetch(
    token,
    `/e2ee/devices/${encodeURIComponent(deviceId)}/revoke`,
    { method: 'POST' },
  );
}

export async function postEchoE2eePairingStart(
  token: string | null | undefined,
): Promise<{ pairingId: string }> {
  return await echoFetch(token, `/e2ee/pairing/start`, { method: 'POST' });
}

export async function getEchoE2eePairingState(
  token: string | null | undefined,
  pairingId: string,
): Promise<{ status: string; ciphertext?: string }> {
  return await echoFetch(
    token,
    `/e2ee/pairing/${encodeURIComponent(pairingId)}`,
    { method: 'GET' },
  );
}

export async function postEchoE2eePairingRespond(
  token: string | null | undefined,
  pairingId: string,
  body: { ciphertext: string },
): Promise<void> {
  await echoFetch(
    token,
    `/e2ee/pairing/${encodeURIComponent(pairingId)}/respond`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}
