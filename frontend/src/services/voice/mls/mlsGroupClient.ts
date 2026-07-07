import {
  acceptAll,
  createCommit,
  createGroup,
  createGroupInfoWithExternalPubAndRatchetTree,
  decodeMlsMessage,
  defaultKeyPackageEqualityConfig,
  defaultKeyRetentionConfig,
  defaultLifetimeConfig,
  defaultPaddingConfig,
  emptyPskIndex,
  encodeGroupState,
  encodeMlsMessage,
  joinGroupExternal,
  processMessage,
  type CiphersuiteImpl,
  type ClientConfig,
  type ClientState,
  type GroupInfo,
  type MLSMessage,
  type Proposal,
} from 'ts-mls';
import { ratchetTreeFromExtension } from 'ts-mls/groupInfo.js';
import { EchoApiError } from '@/api/echo/transport';
import { bytesToBase64, base64ToBytes } from '@/services/e2ee/e2eeBase64';
import {
  echoSignalPersistenceSet,
  echoSignalPersistenceRemove,
} from '@/services/e2ee/e2eeSignalPersistence';
import {
  deriveMediaKeyForEpoch,
  echoMlsCiphersuite,
  epochOf,
} from './mlsCrypto';
import {
  createEchoMlsAuthService,
  getOrCreateMlsSignatureKeyPair,
  parseEchoCredentialIdentity,
  type EchoCredentialIdentity,
} from './mlsCredential';
import { generateEchoKeyPackage, type EchoKeyPackage } from './mlsKeyPackages';
import {
  fetchMlsGroupInfo,
  fetchMlsMessages,
  postMlsCommit,
  postMlsInit,
  type MlsScope,
} from './mlsDeliveryClient';

/** Derived media key for one MLS epoch, ready to install on the key provider. */
export type EchoMlsEpochKey = {
  raw: ArrayBuffer;
  keyIndex: number;
  epoch: string;
};

export type EchoMlsGroupClientOptions = {
  scope: MlsScope;
  viewerUserId: string;
  deviceId: string;
  token: string;
  /** Keyring size of the LiveKit key provider (epoch → keyIndex = epoch % size). */
  keyringSize: number;
  /** Current authorized roster (user ids, including self) for membership gating. */
  getAuthorizedUserIds: () => string[];
  onIdentityChanged?: (peer: EchoCredentialIdentity) => void;
};

const enc = new TextEncoder();
const MAX_COMMIT_RETRIES = 4;

/**
 * Voice E2EE is not enabled for this channel (server policy). Callers treat
 * this as "connect without E2EE", not as a hard failure.
 */
export class VoiceMlsDisabledError extends Error {
  readonly code = 'VOICE_MLS_DISABLED' as const;
  constructor() {
    super('Voice E2EE is not enabled for this channel.');
    this.name = 'VoiceMlsDisabledError';
  }
}

export function isVoiceMlsDisabledError(e: unknown): boolean {
  if (e instanceof VoiceMlsDisabledError) return true;
  return (
    e instanceof EchoApiError &&
    e.status === 403 &&
    e.body.code === 'VOICE_E2EE_DISABLED'
  );
}

/** Transport a GroupInfo as an MLSMessage envelope (public API only). */
function encodeGroupInfoWire(groupInfo: GroupInfo): Uint8Array {
  const msg: MLSMessage = {
    version: 'mls10',
    wireformat: 'mls_group_info',
    groupInfo,
  };
  return encodeMlsMessage(msg);
}

function decodeGroupInfoWire(b64: string): GroupInfo {
  const decoded = decodeMlsMessage(base64ToBytes(b64), 0);
  if (!decoded || decoded[0].wireformat !== 'mls_group_info') {
    throw new Error('Invalid MLS group info from server.');
  }
  return decoded[0].groupInfo;
}

function groupIdBytes(scope: MlsScope): Uint8Array {
  const key =
    scope.kind === 'dm'
      ? `dm:${scope.channelId}`
      : `${scope.serverId}:${scope.channelId}`;
  return enc.encode(`echo-voice-mls:${key}`);
}

function stateStoreKey(viewerUserId: string, scope: MlsScope): string {
  const key =
    scope.kind === 'dm'
      ? `dm:${scope.channelId}`
      : `${scope.serverId}:${scope.channelId}`;
  return `echo_mls_v1:${viewerUserId}:groupstate:${key}`;
}

type TreeMember = {
  leafIndex: number;
  identity: EchoCredentialIdentity;
};

/**
 * Owns one voice channel's MLS group lifecycle: external-commit join, ordered
 * application of the delivery log, deterministic-committer removals on leave, and
 * per-epoch media-key derivation. The server never sees key material.
 */
export class EchoMlsGroupClient {
  private cs: CiphersuiteImpl | null = null;
  private state: ClientState | null = null;
  private keyPackage: EchoKeyPackage | null = null;
  private clientConfig: ClientConfig | null = null;
  private lastSeq = 0n;
  private current: EchoMlsEpochKey | null = null;

  constructor(private readonly opts: EchoMlsGroupClientOptions) {}

  get currentEpochKey(): EchoMlsEpochKey | null {
    return this.current;
  }

  private async ensureInit(): Promise<CiphersuiteImpl> {
    if (this.cs && this.keyPackage && this.clientConfig) return this.cs;
    const cs = await echoMlsCiphersuite();
    const sig = await getOrCreateMlsSignatureKeyPair(
      this.opts.viewerUserId,
      cs,
    );
    this.keyPackage = await generateEchoKeyPackage(
      this.opts.viewerUserId,
      this.opts.deviceId,
      sig,
      cs,
    );
    this.clientConfig = {
      keyRetentionConfig: defaultKeyRetentionConfig,
      lifetimeConfig: defaultLifetimeConfig,
      keyPackageEqualityConfig: defaultKeyPackageEqualityConfig,
      paddingConfig: defaultPaddingConfig,
      authService: createEchoMlsAuthService({
        viewerUserId: this.opts.viewerUserId,
        isAuthorizedUser: (uid) =>
          this.opts.getAuthorizedUserIds().includes(uid) ||
          uid === this.opts.viewerUserId,
        onIdentityChanged: this.opts.onIdentityChanged,
      }),
    };
    this.cs = cs;
    return cs;
  }

  /** Join (or create) the channel's MLS group; returns the initial epoch key. */
  async start(): Promise<EchoMlsEpochKey> {
    const cs = await this.ensureInit();
    const info = await fetchMlsGroupInfo(this.opts.token, this.opts.scope);
    if (!info.enabled) {
      throw new VoiceMlsDisabledError();
    }
    if (!info.groupInfo || info.currentEpoch === null) {
      return this.createFreshGroup(cs);
    }
    return this.externalJoin(cs, info.groupInfo, info.currentEpoch);
  }

  private async createFreshGroup(
    cs: CiphersuiteImpl,
  ): Promise<EchoMlsEpochKey> {
    const kp = this.keyPackage!;
    const state = await createGroup(
      groupIdBytes(this.opts.scope),
      kp.publicPackage,
      kp.privatePackage,
      [],
      cs,
      this.clientConfig!,
    );
    const groupInfo = await createGroupInfoWithExternalPubAndRatchetTree(
      state,
      [],
      cs,
    );
    const res = await postMlsInit(this.opts.token, this.opts.scope, {
      groupInfo: bytesToBase64(encodeGroupInfoWire(groupInfo)),
    });
    if (!res.created) {
      // Lost the create race — another member made the group first. Re-fetch and
      // external-join their group instead.
      const info = await fetchMlsGroupInfo(this.opts.token, this.opts.scope);
      if (info.groupInfo && info.currentEpoch !== null) {
        return this.externalJoin(cs, info.groupInfo, info.currentEpoch);
      }
    }
    this.state = state;
    await this.persistState();
    return this.installEpochKey(cs);
  }

  private async externalJoin(
    cs: CiphersuiteImpl,
    groupInfoB64: string,
    currentEpoch: string,
    attempt = 0,
    /** RFC 9420 "resync" external commit: replaces our stale leaf on rejoin. */
    resync = false,
  ): Promise<EchoMlsEpochKey> {
    const groupInfo: GroupInfo = decodeGroupInfoWire(groupInfoB64);
    const kp = this.keyPackage!;
    const { publicMessage, newState } = await joinGroupExternal(
      groupInfo,
      kp.publicPackage,
      kp.privatePackage,
      resync,
      cs,
      undefined,
      this.clientConfig!,
    );
    const commitMsg: MLSMessage = {
      version: 'mls10',
      wireformat: 'mls_public_message',
      publicMessage,
    };
    const newGroupInfo = await createGroupInfoWithExternalPubAndRatchetTree(
      newState,
      [],
      cs,
    );
    try {
      const res = await postMlsCommit(this.opts.token, this.opts.scope, {
        expectedEpoch: currentEpoch,
        commit: bytesToBase64(encodeMlsMessage(commitMsg)),
        groupInfo: bytesToBase64(encodeGroupInfoWire(newGroupInfo)),
        deviceId: this.opts.deviceId,
      });
      this.state = newState;
      this.lastSeq = bigintMax(this.lastSeq, BigInt(res.seq));
      await this.persistState();
      return this.installEpochKey(cs);
    } catch (e) {
      if (isEpochConflict(e) && attempt < MAX_COMMIT_RETRIES) {
        const info = await fetchMlsGroupInfo(this.opts.token, this.opts.scope);
        if (info.groupInfo && info.currentEpoch !== null) {
          return this.externalJoin(
            cs,
            info.groupInfo,
            info.currentEpoch,
            attempt + 1,
            resync,
          );
        }
      }
      throw e;
    }
  }

  /**
   * Full recovery when local state diverged from the delivery log (we were
   * removed, missed a commit we cannot apply, or the group forked): regenerate
   * a fresh key package and perform a resync external commit against the
   * server's current group info. Without this, a client that falls off the
   * epoch keeps encrypting with a stale key and goes silent for everyone else.
   */
  private async rejoinAfterDesync(
    cs: CiphersuiteImpl,
  ): Promise<EchoMlsEpochKey | null> {
    const info = await fetchMlsGroupInfo(this.opts.token, this.opts.scope);
    if (!info.enabled) return null;
    const sig = await getOrCreateMlsSignatureKeyPair(
      this.opts.viewerUserId,
      cs,
    );
    this.keyPackage = await generateEchoKeyPackage(
      this.opts.viewerUserId,
      this.opts.deviceId,
      sig,
      cs,
    );
    if (!info.groupInfo || info.currentEpoch === null) {
      return this.createFreshGroup(cs);
    }
    // Resync (remove-then-add of our own leaf) is only valid when our leaf is
    // still in the tree; if we were already removed by the committer, a plain
    // external join is required. ts-mls's resync path assumes the former leaf
    // exists (matched by signature public key), so mirror that predicate here.
    const resync = this.groupInfoHasOwnLeaf(info.groupInfo);
    return this.externalJoin(cs, info.groupInfo, info.currentEpoch, 0, resync);
  }

  /** Whether the published group info's tree contains our current leaf (by signature key). */
  private groupInfoHasOwnLeaf(groupInfoB64: string): boolean {
    try {
      const tree = ratchetTreeFromExtension(decodeGroupInfoWire(groupInfoB64));
      const own = this.keyPackage?.publicPackage.leafNode.signaturePublicKey;
      if (!tree || !own) return false;
      return tree.some(
        (n) =>
          n !== undefined &&
          n.nodeType === 'leaf' &&
          bytesEqual(n.leaf.signaturePublicKey, own),
      );
    } catch {
      return false;
    }
  }

  /**
   * Pull and apply any new handshake messages in order. Returns a new epoch key
   * when the epoch advanced (caller rotates the LiveKit key in-band), else null.
   */
  async sync(): Promise<EchoMlsEpochKey | null> {
    if (!this.state || !this.cs) return null;
    const cs = this.cs;
    const { messages } = await fetchMlsMessages(
      this.opts.token,
      this.opts.scope,
      this.lastSeq.toString(),
    );
    let epochChanged = false;
    for (const m of messages) {
      const seq = BigInt(m.seq);
      if (seq <= this.lastSeq) continue;
      // Skip our own messages — we already advanced local state when we sent them.
      const isOwn =
        m.senderUserId === this.opts.viewerUserId &&
        m.senderDeviceId === this.opts.deviceId;
      if (!isOwn && (m.msgType === 'commit' || m.msgType === 'proposal')) {
        const beforeEpoch = epochOf(this.state);
        try {
          await this.applyWireMessage(m.payload, cs);
        } catch {
          // We cannot apply this message (removed from the group, missed
          // history, or a fork). Advance the cursor past it, then recover by
          // rejoining the group at its current epoch via a resync external
          // commit — otherwise we'd keep using a stale media key and our
          // audio would be undecryptable for the rest of the call.
          this.lastSeq = bigintMax(this.lastSeq, seq);
          try {
            return await this.rejoinAfterDesync(cs);
          } catch {
            // Rejoin failed (transient network/conflict); a later sync or the
            // session-level reconnect path retries.
            return null;
          }
        }
        if (epochOf(this.state) !== beforeEpoch) epochChanged = true;
      }
      this.lastSeq = bigintMax(this.lastSeq, seq);
    }
    if (epochChanged) {
      await this.persistState();
      return this.installEpochKey(cs);
    }
    return null;
  }

  private async applyWireMessage(
    payloadB64: string,
    cs: CiphersuiteImpl,
  ): Promise<void> {
    const decoded = decodeMlsMessage(base64ToBytes(payloadB64), 0);
    if (!decoded) throw new Error('Invalid MLS wire message.');
    const msg = decoded[0];
    if (
      msg.wireformat !== 'mls_public_message' &&
      msg.wireformat !== 'mls_private_message'
    ) {
      // Welcomes / group-info are not applied via processMessage in our flow.
      return;
    }
    const result = await processMessage(
      msg,
      this.state!,
      emptyPskIndex,
      acceptAll,
      cs,
    );
    if (result.kind === 'newState') {
      this.state = result.newState;
    }
  }

  /**
   * If members remain in the MLS group who are no longer in the authorized roster
   * (they left the call), the deterministic committer removes them — providing
   * forward secrecy. Returns a new epoch key if this client performed the commit.
   */
  async reconcileRoster(): Promise<EchoMlsEpochKey | null> {
    if (!this.state || !this.cs) return null;
    const cs = this.cs;
    const authorized = new Set(this.opts.getAuthorizedUserIds());
    authorized.add(this.opts.viewerUserId);
    const members = this.treeMembers();
    const present = members.filter((m) => authorized.has(m.identity.userId));
    const toRemove = members.filter((m) => !authorized.has(m.identity.userId));
    if (toRemove.length === 0) return null;
    if (!this.isLocalCommitter(present)) return null;

    const proposals: Proposal[] = toRemove.map((m) => ({
      proposalType: 'remove',
      remove: { removed: m.leafIndex },
    }));
    const expectedEpoch = epochOf(this.state).toString();
    const res = await createCommit(
      { state: this.state, cipherSuite: cs, pskIndex: emptyPskIndex },
      { extraProposals: proposals, wireAsPublicMessage: true },
    );
    const newGroupInfo = await createGroupInfoWithExternalPubAndRatchetTree(
      res.newState,
      [],
      cs,
    );
    try {
      const posted = await postMlsCommit(this.opts.token, this.opts.scope, {
        expectedEpoch,
        commit: bytesToBase64(encodeMlsMessage(res.commit)),
        groupInfo: bytesToBase64(encodeGroupInfoWire(newGroupInfo)),
        deviceId: this.opts.deviceId,
      });
      this.state = res.newState;
      this.lastSeq = bigintMax(this.lastSeq, BigInt(posted.seq));
      await this.persistState();
      return this.installEpochKey(cs);
    } catch (e) {
      if (isEpochConflict(e)) {
        // Another member committed first; pick up their change instead.
        return this.sync();
      }
      throw e;
    }
  }

  /**
   * Tear down local group state on leave. Forward secrecy is provided by the
   * *remaining* deterministic committer, which removes this now-absent member via
   * {@link reconcileRoster} when it observes the roster change — a leaving client
   * cannot rekey the group it is exiting.
   */
  async leave(): Promise<void> {
    this.state = null;
    this.current = null;
    await this.clearPersistedState();
  }

  // --- helpers ---

  private treeMembers(): TreeMember[] {
    const state = this.state;
    if (!state) return [];
    const out: TreeMember[] = [];
    const tree = state.ratchetTree;
    for (let i = 0; i < tree.length; i += 1) {
      const node = tree[i];
      if (!node || node.nodeType !== 'leaf') continue;
      const identity = parseEchoCredentialIdentity(node.leaf.credential);
      if (!identity) continue;
      out.push({ leafIndex: i >> 1, identity });
    }
    return out;
  }

  private isLocalCommitter(present: TreeMember[]): boolean {
    if (present.length === 0) return false;
    const sortKey = (m: TreeMember) =>
      `${m.identity.userId} ${m.identity.deviceId}`;
    let min = present[0];
    for (const m of present) if (sortKey(m) < sortKey(min)) min = m;
    return (
      min.identity.userId === this.opts.viewerUserId &&
      min.identity.deviceId === this.opts.deviceId
    );
  }

  private async installEpochKey(cs: CiphersuiteImpl): Promise<EchoMlsEpochKey> {
    const state = this.state!;
    const epoch = epochOf(state);
    const raw = await deriveMediaKeyForEpoch(state, cs);
    const size = BigInt(this.opts.keyringSize);
    const keyIndex = Number(((epoch % size) + size) % size);
    this.current = { raw, keyIndex, epoch: epoch.toString() };
    return this.current;
  }

  private async persistState(): Promise<void> {
    if (!this.state) return;
    try {
      const bytes = encodeGroupState(this.state);
      await echoSignalPersistenceSet(
        stateStoreKey(this.opts.viewerUserId, this.opts.scope),
        JSON.stringify({
          seq: this.lastSeq.toString(),
          state: bytesToBase64(bytes),
        }),
      );
    } catch {
      /* persistence is best-effort; in-memory state is authoritative */
    }
  }

  private async clearPersistedState(): Promise<void> {
    try {
      await echoSignalPersistenceRemove(
        stateStoreKey(this.opts.viewerUserId, this.opts.scope),
      );
    } catch {
      /* ignore */
    }
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function bigintMax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function isEpochConflict(e: unknown): boolean {
  return (
    e instanceof EchoApiError &&
    e.status === 409 &&
    e.body.code === 'VOICE_MLS_EPOCH_CONFLICT'
  );
}
