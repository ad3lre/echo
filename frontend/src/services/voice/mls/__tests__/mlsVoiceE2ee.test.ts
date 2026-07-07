import { describe, expect, it } from 'vitest';
import {
  createCommit,
  createGroup,
  createGroupInfoWithExternalPubAndRatchetTree,
  defaultCapabilities,
  defaultLifetime,
  emptyPskIndex,
  generateKeyPackageWithKey,
  joinGroup,
  joinGroupExternal,
  processMessage,
  acceptAll,
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

async function makeMember(
  userId: string,
  deviceId: string,
  sigKey?: { signKey: Uint8Array; publicKey: Uint8Array },
) {
  const cs = await echoMlsCiphersuite();
  const sig = sigKey ?? (await cs.signature.keygen());
  const credential: Credential = buildEchoCredential(userId, deviceId);
  const kp = await generateKeyPackageWithKey(
    credential,
    defaultCapabilities(),
    defaultLifetime,
    [],
    { signKey: sig.signKey, publicKey: sig.publicKey },
    cs,
  );
  return { cs, kp, sig };
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

  it('external-commit join and resync rejoin converge on the same media key', async () => {
    const a = await makeMember('user-a', 'dev-a');
    const b = await makeMember('user-b', 'dev-b');
    const cs = a.cs;

    let stateA = await createGroup(
      new TextEncoder().encode('echo-voice-mls:test3'),
      a.kp.publicPackage,
      a.kp.privatePackage,
      [],
      cs,
      permissiveConfig(),
    );

    // B joins via external commit against A's published group info — the
    // late-joiner path used by EchoMlsGroupClient (no welcome required).
    const infoForJoin = await createGroupInfoWithExternalPubAndRatchetTree(
      stateA,
      [],
      cs,
    );
    const joined = await joinGroupExternal(
      infoForJoin,
      b.kp.publicPackage,
      b.kp.privatePackage,
      false,
      cs,
      undefined,
      permissiveConfig(),
    );
    let stateB = joined.newState;
    const applyJoin = await processMessage(
      {
        wireformat: 'mls_public_message',
        publicMessage: joined.publicMessage,
      },
      stateA,
      emptyPskIndex,
      acceptAll,
      cs,
    );
    expect(applyJoin.kind).toBe('newState');
    if (applyJoin.kind === 'newState') stateA = applyJoin.newState;
    expect(
      bufEq(
        await deriveMediaKeyForEpoch(stateA, cs),
        await deriveMediaKeyForEpoch(stateB, cs),
      ),
    ).toBe(true);

    // B "desyncs" (loses group state) and rejoins with a resync external
    // commit — the recovery path of rejoinAfterDesync. The signature key is
    // persistent across rejoins (getOrCreateMlsSignatureKeyPair), which is how
    // ts-mls locates the stale leaf to replace. Both sides converge again and
    // B's stale leaf is replaced, not duplicated.
    const b2 = await makeMember('user-b', 'dev-b', b.sig);
    const infoForResync = await createGroupInfoWithExternalPubAndRatchetTree(
      stateA,
      [],
      cs,
    );
    const rejoined = await joinGroupExternal(
      infoForResync,
      b2.kp.publicPackage,
      b2.kp.privatePackage,
      true,
      cs,
      undefined,
      permissiveConfig(),
    );
    stateB = rejoined.newState;
    const applyResync = await processMessage(
      {
        wireformat: 'mls_public_message',
        publicMessage: rejoined.publicMessage,
      },
      stateA,
      emptyPskIndex,
      acceptAll,
      cs,
    );
    expect(applyResync.kind).toBe('newState');
    if (applyResync.kind === 'newState') stateA = applyResync.newState;

    expect(epochOf(stateA)).toBe(epochOf(stateB));
    expect(
      bufEq(
        await deriveMediaKeyForEpoch(stateA, cs),
        await deriveMediaKeyForEpoch(stateB, cs),
      ),
    ).toBe(true);
    const leaves = stateA.ratchetTree.filter(
      (n) => n?.nodeType === 'leaf',
    ).length;
    expect(leaves).toBe(2);
  });
});
