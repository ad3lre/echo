import {
  createGroup,
  createGroupInfoWithExternalPubAndRatchetTree,
  defaultCapabilities,
  defaultLifetime,
  emptyPskIndex,
  generateKeyPackageWithKey,
  joinGroupExternal,
  processMessage,
  acceptAll,
  defaultKeyPackageEqualityConfig,
  defaultKeyRetentionConfig,
  defaultLifetimeConfig,
  defaultPaddingConfig,
} from 'ts-mls';
const enc = new TextEncoder();
function cred(u, d) {
  return { credentialType: 'basic', identity: enc.encode(`echo:${u}:${d}`) };
}
const cfg = () => ({
  keyRetentionConfig: defaultKeyRetentionConfig,
  lifetimeConfig: defaultLifetimeConfig,
  keyPackageEqualityConfig: defaultKeyPackageEqualityConfig,
  paddingConfig: defaultPaddingConfig,
  authService: { validateCredential: async () => true },
});
const { echoMlsCiphersuite } =
  await import('./src/services/voice/mls/mlsCrypto.ts');
const cs = await echoMlsCiphersuite();
async function member(u, d) {
  const sig = await cs.signature.keygen();
  return generateKeyPackageWithKey(
    cred(u, d),
    defaultCapabilities(),
    defaultLifetime,
    [],
    { signKey: sig.signKey, publicKey: sig.publicKey },
    cs,
  );
}
console.log('t0');
const a = await member('a', '1');
const b = await member('b', '1');
let stateA = await createGroup(
  enc.encode('g'),
  a.publicPackage,
  a.privatePackage,
  [],
  cs,
  cfg(),
);
console.log('created');
const info = await createGroupInfoWithExternalPubAndRatchetTree(stateA, [], cs);
console.log('info');
const joined = await joinGroupExternal(
  info,
  b.publicPackage,
  b.privatePackage,
  false,
  cs,
  undefined,
  cfg(),
);
console.log('joined externally, epoch', joined.newState.groupContext?.epoch);

const apply1 = await processMessage(
  {
    version: 'mls10',
    wireformat: 'mls_public_message',
    publicMessage: joined.publicMessage,
  },
  stateA,
  emptyPskIndex,
  acceptAll,
  cs,
);
console.log('applied join on A:', apply1.kind);
if (apply1.kind === 'newState') stateA = apply1.newState;
const b2 = await member('b', '1');
console.log('b2 ready');
const info2 = await createGroupInfoWithExternalPubAndRatchetTree(
  stateA,
  [],
  cs,
);
console.log('info2');
const rejoined = await joinGroupExternal(
  info2,
  b2.publicPackage,
  b2.privatePackage,
  true,
  cs,
  undefined,
  cfg(),
);
console.log('resync join ok, epoch', rejoined.newState.groupContext?.epoch);
const apply2 = await processMessage(
  {
    version: 'mls10',
    wireformat: 'mls_public_message',
    publicMessage: rejoined.publicMessage,
  },
  stateA,
  emptyPskIndex,
  acceptAll,
  cs,
);
console.log('applied resync on A:', apply2.kind);
process.exit(0);
