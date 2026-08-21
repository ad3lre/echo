import { echoFetch } from '@/api/echo/transport';

export type EchoUserRingtoneDto = {
  id: string;
  label: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type EchoUserRingtonesListResponse = {
  maxCustom: number;
  ringtones: EchoUserRingtoneDto[];
};

export async function fetchEchoUserRingtones(
  token: string | null,
): Promise<EchoUserRingtonesListResponse> {
  return echoFetch<EchoUserRingtonesListResponse>(token, '/ringtones', {
    method: 'GET',
  });
}

export async function registerEchoUserRingtone(
  token: string | null,
  body: {
    label: string;
    storageKey: string;
    publicUrl: string;
    mimeType: string;
    sizeBytes: number;
  },
): Promise<EchoUserRingtoneDto> {
  return echoFetch<EchoUserRingtoneDto>(token, '/ringtones', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteEchoUserRingtone(
  token: string | null,
  ringtoneId: string,
): Promise<void> {
  await echoFetch<{ ok: true }>(
    token,
    `/ringtones/${encodeURIComponent(ringtoneId)}`,
    { method: 'DELETE' },
  );
}
