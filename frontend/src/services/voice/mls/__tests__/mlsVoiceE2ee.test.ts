import { describe, expect, it } from 'vitest';
import {
  createCommit,
  createGroup,
  defaultCapabilities,
  defaultLifetime,
  emptyPskIndex,
  generateKeyPackageWithKey,
  joinGroup,
  type ClientConfig,
  type Credential,
} from 'ts-mls';
import {
  defaultKeyPackageEqualityConfig,
  defaultKeyRetentionConfig,
  defaultLifetimeConfig,
  defaultPaddingConfig,
} from 'ts-mls';
import {
  deriveMediaKeyForEpoch,
  echoMlsCiphersuite,
  epochOf,
} from '../mlsCrypto';
import {
  buildEchoCredential,
  parseEchoCredentialIdentity,
} from '../mlsCredential';

function bufEq(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const ua = new Uint8Array(a);
  const ub = new Uint8Array(b);
  for (let i = 0; i < ua.length; i += 1) if (ua[i] !== ub[i]) return false;
  return true;
}

const permissiveConfig = (): ClientConfig => ({
  keyRetentionConfig: defaultKeyRetentionConfig,
  lifetimeConfig: defaultLifetimeConfig,
  keyPackageEqualityConfig: defaultKeyPackageEqualityConfig,
  paddingConfig: defaultPaddingConfig,
  authService: { validateCredential: async () => true },
});

async function makeMember(userId: string, deviceId: string) {
  const cs = await echoMlsCiphersuite();
  const sig = await cs.signature.keygen();
  const credential: Credential = buildEchoCredential(userId, deviceId);
  const kp = await generateKeyPackageWithKey(
    credential,
    defaultCapabilities(),
    defaultLifetime,
    [],
    { signKey: sig.signKey, publicKey: sig.publicKey },
    cs,
  );
  return { cs, kp };
}

describe('mlsCredential', () => {
  it('round-trips an Echo basic credential identity', () => {
    const cred = buildEchoCredential('user-a', 'device-1');
    expect(parseEchoCredentialIdentity(cred)).toEqual({
      userId: 'user-a',
      deviceId: 'device-1',
    });
  });

  it('rejects a non-echo credential', () => {
    expect(
      parseEchoCredentialIdentity({
        credentialType: 'basic',
        identity: new TextEncoder().encode('not-echo'),
      }),
    ).toBeNull();
  });
});

describe('MLS group key agreement (RFC 9420)', () => {
  it('derives an identical media key for all members of an epoch', async () => {
    const a = await makeMember('user-a', 'dev-a');
    const b = await makeMember('user-b', 'dev-b');
    const cs = a.cs;

    let stateA = await createGroup(
      new TextEncoder().encode('echo-voice-mls:test'),
      a.kp.publicPackage,
      a.kp.privatePackage,
      [],
      cs,
      permissiveConfig(),
    );

    // A adds B and commits; B joins from the welcome (with ratchet tree).
    const commitRes = await createCommit(
      { state: stateA, cipherSuite: cs, pskIndex: emptyPskIndex },
      {
        extraProposals: [
          { proposalType: 'add', add: { keyPackage: b.kp.publicPackage } },
        ],
        ratchetTreeExtension: true,
      },
    );
    stateA = commitRes.newState;
    expect(commitRes.welcome).toBeDefined();
    const stateB = await joinGroup(
      commitRes.welcome!,
      b.kp.publicPackage,
      b.kp.privatePackage,
      emptyPskIndex,
      cs,
    );

    expect(epochOf(stateA)).toBe(epochOf(stateB));
    const keyA = await deriveMediaKeyForEpoch(stateA, cs);
    const keyB = await deriveMediaKeyForEpoch(stateB, cs);
    expect(keyA.byteLength).toBe(16);
    expect(bufEq(keyA, keyB)).toBe(true);
  });

  it('rotates the key on removal so a removed member cannot derive it (forward secrecy)', async () => {
    const a = await makeMember('user-a', 'dev-a');
    const b = await makeMember('user-b', 'dev-b');
    const cs = a.cs;

    let stateA = await createGroup(
      new TextEncoder().encode('echo-voice-mls:test2'),
      a.kp.publicPackage,
      a.kp.privatePackage,
      [],
      cs,
      permissiveConfig(),
    );
    const add = await createCommit(
      { state: stateA, cipherSuite: cs, pskIndex: emptyPskIndex },
      {
        extraProposals: [
          { proposalType: 'add', add: { keyPackage: b.kp.publicPackage } },
        ],
        ratchetTreeExtension: true,
      },
    );
    stateA = add.newState;
    const stateB = await joinGroup(
      add.welcome!,
      b.kp.publicPackage,
      b.kp.privatePackage,
      emptyPskIndex,
      cs,
    );

    const sharedKey = await deriveMediaKeyForEpoch(stateA, cs);
    const bKeyBeforeRemoval = await deriveMediaKeyForEpoch(stateB, cs);
    expect(bufEq(sharedKey, bKeyBeforeRemoval)).toBe(true);

    // A removes B (leaf index 1) and commits → new epoch.
    const remove = await createCommit(
      { state: stateA, cipherSuite: cs, pskIndex: emptyPskIndex },
      { extraProposals: [{ proposalType: 'remove', remove: { removed: 1 } }] },
    );
    stateA = remove.newState;

    const keyAfterRemoval = await deriveMediaKeyForEpoch(stateA, cs);
    // The post-removal key must differ from the key B still holds.
    expect(bufEq(keyAfterRemoval, bKeyBeforeRemoval)).toBe(false);
    expect(epochOf(stateA)).not.toBe(epochOf(stateB));
  });
});
