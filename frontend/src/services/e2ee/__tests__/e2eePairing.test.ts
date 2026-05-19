import { describe, expect, it } from 'vitest';
import {
  buildE2eePairingQrPayload,
  parsePairingPayloadFromQr,
  parsePairingIdFromQrPayload,
} from '@/services/e2ee/e2eePairing';
import {
  decryptPairingExport,
  encryptPairingExport,
} from '@/services/e2ee/e2eePairingCrypto';

describe('e2ee pairing payload', () => {
  it('round-trips pairing id through QR payload', () => {
    const id = 'abc123_ snowflake';
    const secret = 'sec_deadbeef';
    const payload = buildE2eePairingQrPayload({
      pairingId: id,
      pairingSecret: secret,
    });
    expect(payload.startsWith('echo://e2ee-pair/')).toBe(true);
    expect(parsePairingIdFromQrPayload(payload)).toBe(id);
    expect(parsePairingPayloadFromQr(payload)).toEqual({
      pairingId: id,
      pairingSecret: secret,
    });
  });

  it('encryptPairingExport / decryptPairingExport roundtrip', async () => {
    const pairingId = 'pair_test_snowflake_1';
    const pairingSecret = 'pair_secret_test_1';
    const plain = JSON.stringify({ hello: 'world', n: 42 });
    const ct = await encryptPairingExport(pairingId, pairingSecret, plain);
    const out = await decryptPairingExport(pairingId, pairingSecret, ct);
    expect(out).toBe(plain);
  });
});
