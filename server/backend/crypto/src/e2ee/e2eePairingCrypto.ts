import { base64ToBytes, bytesToBase64 } from '@/services/e2ee/e2eeBase64';

const PAIRING_INFO = new TextEncoder().encode('echo-e2ee-pairing-aes-v1');

export async function derivePairingAesGcmKey(
  pairingId: string,
  pairingSecret: string,
): Promise<CryptoKey> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto is not available');
  const enc = new TextEncoder();
  const prk = await subtle.digest(
    'SHA-256',
    enc.encode(`echo-e2ee-pair|${pairingId.trim()}|${pairingSecret.trim()}`),
  );
  const baseKey = await subtle.importKey('raw', prk, 'HKDF', false, [
    'deriveKey',
  ]);
  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: PAIRING_INFO,
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptPairingExport(
  pairingId: string,
  pairingSecret: string,
  plaintextUtf8: string,
): Promise<string> {
  const key = await derivePairingAesGcmKey(pairingId, pairingSecret);
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const pt = new TextEncoder().encode(plaintextUtf8);
  const subtle = globalThis.crypto.subtle;
  const ct = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, pt),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return bytesToBase64(out);
}

export async function decryptPairingExport(
  pairingId: string,
  pairingSecret: string,
  b64: string,
): Promise<string> {
  const key = await derivePairingAesGcmKey(pairingId, pairingSecret);
  const raw = base64ToBytes(b64.trim());
  if (raw.length < 13) throw new Error('Invalid pairing payload');
  const iv = new Uint8Array(raw.subarray(0, 12));
  const ct = new Uint8Array(raw.subarray(12));
  const subtle = globalThis.crypto.subtle;
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(new Uint8Array(pt));
}
