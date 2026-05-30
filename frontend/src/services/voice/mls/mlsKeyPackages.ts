import {
  defaultCapabilities,
  defaultLifetime,
  generateKeyPackageWithKey,
  type CiphersuiteImpl,
  type KeyPackage,
  type PrivateKeyPackage,
} from 'ts-mls';
import {
  buildEchoCredential,
  type EchoMlsSignatureKeyPair,
} from './mlsCredential';

export type EchoKeyPackage = {
  publicPackage: KeyPackage;
  privatePackage: PrivateKeyPackage;
};

/**
 * Generate a fresh MLS KeyPackage for this device, signed by the device's stable
 * signature key so the leaf credential and signature key are consistent across
 * key packages (required for the TOFU identity pin).
 */
export async function generateEchoKeyPackage(
  userId: string,
  deviceId: string,
  sig: EchoMlsSignatureKeyPair,
  cs: CiphersuiteImpl,
): Promise<EchoKeyPackage> {
  const credential = buildEchoCredential(userId, deviceId);
  return generateKeyPackageWithKey(
    credential,
    defaultCapabilities(),
    defaultLifetime,
    [],
    { signKey: sig.signKey, publicKey: sig.publicKey },
    cs,
  );
}
