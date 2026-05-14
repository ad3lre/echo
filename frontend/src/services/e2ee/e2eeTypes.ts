export type E2eeMode = 'e2ee_v1';

export type E2eeThreadState =
  | { enabled: false }
  | { enabled: true; mode: string; keyEpoch: number; enabledAt: string };

export type E2eeOutboundEncryption = {
  kind: 'e2ee';
  version: 1 | 2;
  senderDeviceId: string;
  envelope: unknown;
  ciphertext: string;
};

export type E2eeSignedPrekeyPublic = {
  keyId: number;
  pubKeyB64: string;
  signatureB64: string;
};

export type E2eeOneTimePrekeyPublic = {
  keyId: number;
  pubKeyB64: string;
};

export type E2eeDeviceRegistration = {
  deviceId: string;
  /** Base64 Curve25519 identity public key (32 bytes). */
  identityKey: string;
  registrationId: number;
  signedPrekey: E2eeSignedPrekeyPublic;
  oneTimePrekeys: E2eeOneTimePrekeyPublic[];
};
