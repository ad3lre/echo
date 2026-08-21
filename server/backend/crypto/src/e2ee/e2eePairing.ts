import {
  getEchoE2eePairingState,
  postEchoE2eePairingRespond,
  postEchoE2eePairingStart,
} from '@/api/echo/e2ee';
import {
  encryptPairingExport,
  decryptPairingExport,
} from '@/services/e2ee/e2eePairingCrypto';
import {
  exportEchoSignalLocalBackup,
  importEchoSignalLocalBackup,
} from '@/services/e2ee/e2eeSignalStore';

export type E2eePairingPayload = {
  pairingId: string;
  pairingSecret: string;
};

/** Delay between polls while waiting for the trusted device to respond. */
const PAIRING_POLL_INTERVAL_MS = 1200;

function createPairingSecret(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function buildE2eePairingQrPayload(payload: E2eePairingPayload): string {
  return `echo://e2ee-pair/${encodeURIComponent(payload.pairingId)}?s=${encodeURIComponent(payload.pairingSecret)}`;
}

function safeDecodeQrSegment(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

export function parsePairingPayloadFromQr(
  payload: string,
): E2eePairingPayload | null {
  const t = payload.trim();
  const m = /^echo:\/\/e2ee-pair\/([^?]+)(?:\?(.+))?$/i.exec(t);
  if (!m?.[1]) return null;
  const pairingId = safeDecodeQrSegment(m[1].trim());
  const qs = new URLSearchParams(m[2] ?? '');
  const pairingSecret = (qs.get('s') ?? '').trim();
  if (!pairingId || !pairingSecret) return null;
  return { pairingId, pairingSecret };
}

export function parsePairingIdFromQrPayload(payload: string): string | null {
  const parsed = parsePairingPayloadFromQr(payload);
  if (parsed) return parsed.pairingId;
  const t = payload.trim();
  const m = /^echo:\/\/e2ee-pair\/(.+)$/i.exec(t);
  return m?.[1] ? safeDecodeQrSegment(m[1].trim()) : null;
}

export async function startDevicePairingSession(
  token: string | null | undefined,
): Promise<E2eePairingPayload> {
  const { pairingId } = await postEchoE2eePairingStart(token);
  return { pairingId, pairingSecret: createPairingSecret() };
}

export async function pollDevicePairingSession(
  token: string | null | undefined,
  pairingId: string,
): Promise<{ status: string; ciphertext?: string }> {
  return getEchoE2eePairingState(token, pairingId);
}

export async function respondDevicePairingFromQr(
  token: string | null | undefined,
  pairing: E2eePairingPayload,
  authUserId: string,
): Promise<void> {
  const backup = await exportEchoSignalLocalBackup(authUserId);
  const json = JSON.stringify(backup);
  const ciphertext = await encryptPairingExport(
    pairing.pairingId,
    pairing.pairingSecret,
    json,
  );
  await postEchoE2eePairingRespond(token, pairing.pairingId, { ciphertext });
}

export async function completeDevicePairingAsNewDevice(opts: {
  token: string | null | undefined;
  pairing: E2eePairingPayload;
  authUserId: string;
}): Promise<void> {
  const deadline = Date.now() + 10 * 60 * 1000;
  let ciphertext: string | undefined;
  while (Date.now() < deadline) {
    const st = await pollDevicePairingSession(
      opts.token,
      opts.pairing.pairingId,
    );
    if (st.status === 'ready' && st.ciphertext) {
      ciphertext = st.ciphertext;
      break;
    }
    if (st.status === 'expired' || st.status === 'consumed') {
      throw new Error('Pairing session is no longer available');
    }
    await new Promise((r) => setTimeout(r, PAIRING_POLL_INTERVAL_MS));
  }
  if (!ciphertext)
    throw new Error('Pairing timed out waiting for trusted device');
  const json = await decryptPairingExport(
    opts.pairing.pairingId,
    opts.pairing.pairingSecret,
    ciphertext,
  );
  const backup = JSON.parse(json) as Record<string, string>;
  await importEchoSignalLocalBackup(opts.authUserId, backup);
}
