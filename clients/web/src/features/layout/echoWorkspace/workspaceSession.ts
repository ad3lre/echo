import type { Ref, ShallowRef } from 'vue';
import type { EchoWorkspaceState } from '@/api/echoClient';
import type { EchoServerMemberDto } from '@/api/echo/types';
import {
  dbgMemberList,
  isEchoMemberListDebugEnabled,
} from '@/features/layout/composables/members/echoMemberListDebug';
import { applyWorkspaceRosterUsersPipeline } from '@/features/layout/echoWorkspace/workspaceRoster';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import type { ChannelCategory } from '@/features/layout/channels/useChannels';
import {
  applyVoiceRosterDeltaToEphemeralMap,
  emptyVoiceEphemeralMap,
  ingestVoiceEphemeralFromCategories,
  isStageChannelInServer,
  listVoiceChannelIdsForServer,
  stripVoiceFieldsFromCategories,
  type VoiceChannelEphemeral,
} from '@/features/layout/echoWorkspace/workspaceVoiceEphemeral';

type WorkspaceMembersMap = NonNullable<EchoWorkspaceState['membersByServer']>;

export type EchoWorkspaceSessionUser = {
  id: string;
  name: string;
  username?: string;
  pfp: string;
  status: string;
  customStatus?: string;
  bannerImage?: string;
  bannerColor?: string;
  bannerRefractionEnabled?: boolean;
  bannerBlurEnabled?: boolean;
  bannerBlackoutEnabled?: boolean;
  bannerPositionY?: number;
  bio?: string;
};

export type EchoWorkspaceDiscoverableServer = {
  id?: string;
  name: string;
  pfp: string;
  banner?: string;
  description?: string;
  memberCount?: number;
  voiceParticipantCount?: number;
  lastVoiceActivityAt?: string;
  lastChatActivityAt?: string;
  createdAt?: string;
  allowGlobalGuests?: boolean;
};

export type EchoWorkspaceSessionApplyRefs = {
  users: Ref<EchoWorkspaceSessionUser[]>;
  presenceByUserId: Ref<Record<string, string>>;
  /** Sparse: user ids whose last Echo presence row used a phone-class client (see `active_client`). */
  presenceMobileByUserId: Ref<Record<string, true>>;
  /** Sparse: user ids who are currently online on Discord. */
  discordOnlineByUserId: Ref<Record<string, true>>;
  /** Sparse: user id -> ISO timestamp when they were last online. */
  lastOnlineAtByUserId: Ref<Record<string, string>>;
  servers: Ref<EchoWorkspaceState['servers']>;
  categoriesByServer: Ref<Record<string, ChannelCategory[]>>;
  /** Ephemeral voice roster keyed by channel id — not part of the structural tree. */
  voiceEphemeralByChannelId: ShallowRef<Map<string, VoiceChannelEphemeral>>;
  discoverableServers: Ref<EchoWorkspaceDiscoverableServer[]>;
  messages: Ref<Record<string, RawMessage[]>>;
  serverMemberIds: Ref<Record<string, string[]>>;
  workspaceMembersByServer: Ref<WorkspaceMembersMap>;
  workspaceVersion: Ref<string>;
  liveSyncConnected: Ref<boolean>;
  lastWorkspaceEventVersion: Ref<string>;
  lastSnapshotFetchedAtMs: Ref<number>;
  upcomingEventsByServerId: Ref<EchoWorkspaceState['upcomingEventsByServerId']>;
  myEventRsvps: Ref<EchoWorkspaceState['myEventRsvps']>;
};

export type EchoWorkspacePresencePatch = {
  userId: string;
  status: string;
  mobileSurface?: boolean;
};

export type EchoWorkspaceDiscordPresencePatch = {
  userId: string;
  discordOnline: boolean;
};

export type EchoWorkspaceLastOnlinePatch = {
  userId: string;
  lastOnlineAt: string;
};

export function compareWorkspaceVersion(
  a: string | undefined,
  b: string | undefined,
): number {
  const av = typeof a === 'string' && a.trim() ? a.trim() : '0';
  const bv = typeof b === 'string' && b.trim() ? b.trim() : '0';
  try {
    const ai = BigInt(av);
    const bi = BigInt(bv);
    if (ai === bi) return 0;
    return ai > bi ? 1 : -1;
  } catch {
    if (av === bv) return 0;
    return av > bv ? 1 : -1;
  }
}

export function getEffectiveWorkspaceVersion(
  lastWorkspaceEventVersion: string,
  workspaceVersion: string,
): string {
  return compareWorkspaceVersion(lastWorkspaceEventVersion, workspaceVersion) >
    0
    ? lastWorkspaceEventVersion
    : workspaceVersion;
}

export function sessionAcceptsIncomingVersion(
  nextVersion: string | undefined,
  lastWorkspaceEventVersion: string,
  workspaceVersion: string,
): boolean {
  const effective = getEffectiveWorkspaceVersion(
    lastWorkspaceEventVersion,
    workspaceVersion,
  );
  return compareWorkspaceVersion(nextVersion, effective) >= 0;
}

export function replaceUsersInEchoSession(
  refs: EchoWorkspaceSessionApplyRefs,
  nextUsers: EchoWorkspaceSessionUser[],
): void {
  refs.users.value = applyWorkspaceRosterUsersPipeline(nextUsers, {});
}

function serverMemberIdsMapsEqual(
  a: Record<string, string[]>,
  b: Record<string, string[]>,
): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i += 1) {
    if (aKeys[i] !== bKeys[i]) return false;
    const av = a[aKeys[i]!] ?? [];
    const bv = b[bKeys[i]!] ?? [];
    if (av.length !== bv.length) return false;
    for (let j = 0; j < av.length; j += 1) {
      if (av[j] !== bv[j]) return false;
    }
  }
  return true;
}

function memberDtoPanelSignature(row: EchoServerMemberDto): string {
  return [
    row.userId,
    row.name,
    row.pfp,
    row.username ?? '',
    row.serverNickname ?? '',
    row.accountDisplayName ?? '',
    row.isGuest === true ? '1' : '0',
    row.isDiscordShadow === true ? '1' : '0',
    row.communicationTimeoutUntil ?? '',
    row.joinedAt ?? '',
    row.signupOrdinal ?? '',
    (row.badges ?? []).join(','),
    row.bio ?? '',
  ].join('\x1f');
}

function membersByServerMapsEqual(
  a: WorkspaceMembersMap | undefined,
  b: WorkspaceMembersMap | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i += 1) {
    if (aKeys[i] !== bKeys[i]) return false;
    const aRows = a[aKeys[i]!] ?? [];
    const bRows = b[bKeys[i]!] ?? [];
    if (aRows.length !== bRows.length) return false;
    for (let j = 0; j < aRows.length; j += 1) {
      if (
        memberDtoPanelSignature(aRows[j]!) !==
        memberDtoPanelSignature(bRows[j]!)
      ) {
        return false;
      }
    }
  }
  return true;
}

export function workspaceSnapshotMemberDataEqual(
  stored: {
    serverMemberIds: Record<string, string[]>;
    membersByServer: WorkspaceMembersMap | undefined;
  },
  incoming: {
    serverMemberIds: Record<string, string[]>;
    membersByServer: WorkspaceMembersMap | undefined;
  },
): boolean {
  return (
    serverMemberIdsMapsEqual(
      stored.serverMemberIds ?? {},
      incoming.serverMemberIds ?? {},
    ) &&
    membersByServerMapsEqual(stored.membersByServer, incoming.membersByServer)
  );
}

export function mergeMembersByServerInEchoSession(
  refs: EchoWorkspaceSessionApplyRefs,
  membersByServer:
    | NonNullable<EchoWorkspaceState['membersByServer']>
    | undefined,
): void {
  if (!membersByServer) return;
  if (
    workspaceSnapshotMemberDataEqual(
      {
        serverMemberIds: refs.serverMemberIds.value ?? {},
        membersByServer: refs.workspaceMembersByServer.value,
      },
      {
        serverMemberIds: {
          ...(refs.serverMemberIds.value ?? {}),
          ...Object.fromEntries(
            Object.entries(membersByServer).map(([serverId, members]) => [
              serverId,
              (members ?? []).map((m) => m.userId).filter(Boolean),
            ]),
          ),
        },
        membersByServer: {
          ...(refs.workspaceMembersByServer.value ?? {}),
          ...membersByServer,
        },
      },
    )
  ) {
    dbgMemberList('mergeMembersByServer NOOP (unchanged roster)', {
      serverIds: Object.keys(membersByServer),
    });
    return;
  }
  dbgMemberList('mergeMembersByServer START', {
    serverIds: Object.keys(membersByServer),
    incomingCounts: Object.fromEntries(
      Object.entries(membersByServer).map(([sid, rows]) => [
        sid,
        Array.isArray(rows) ? rows.length : -1,
      ]),
    ),
  });
  refs.users.value = applyWorkspaceRosterUsersPipeline(refs.users.value, {
    membersByServer,
  });
  refs.workspaceMembersByServer.value = {
    ...(refs.workspaceMembersByServer.value ?? {}),
    ...membersByServer,
  };
  const nextServerMemberIds: Record<string, string[]> = {
    ...(refs.serverMemberIds.value ?? {}),
  };
  for (const [serverId, members] of Object.entries(membersByServer)) {
    nextServerMemberIds[serverId] = (members ?? [])
      .map((m) => m.userId)
      .filter(Boolean);
  }
  refs.serverMemberIds.value = nextServerMemberIds;
  dbgMemberList('mergeMembersByServer DONE', {
    userRowsCount: refs.users.value.length,
    serverMemberIdCounts: Object.fromEntries(
      Object.entries(nextServerMemberIds).map(([sid, ids]) => [
        sid,
        Array.isArray(ids) ? ids.length : -1,
      ]),
    ),
  });
}

export type ApplyWorkspaceSnapshotOptions = {
  /**
   * GET `/workspace` is membership-authoritative: always apply even when the
   * monotonic version is lower than a cached snapshot that still listed ghost guilds.
   */
  authoritative?: boolean;
};

export function applyWorkspaceSnapshotToEchoSession(
  refs: EchoWorkspaceSessionApplyRefs,
  state: EchoWorkspaceState,
  opts?: ApplyWorkspaceSnapshotOptions,
): boolean {
  const shouldLog = isEchoMemberListDebugEnabled();
  const t0 = shouldLog ? performance.now() : 0;
  const incomingV = state.workspaceVersion;
  const lastEvt = refs.lastWorkspaceEventVersion.value;
  const storedV = refs.workspaceVersion.value;

  if (
    !opts?.authoritative &&
    !sessionAcceptsIncomingVersion(incomingV, lastEvt, storedV)
  ) {
    dbgMemberList('applyWorkspaceSnapshot REJECTED (version)', {
      incomingWorkspaceVersion: incomingV,
      effectiveVersion: getEffectiveWorkspaceVersion(lastEvt, storedV),
      storedWorkspaceVersion: storedV,
      lastWorkspaceEventVersion: lastEvt,
      serverIds: state.servers.map((s) => s.id),
      incomingServerMemberCounts: Object.fromEntries(
        Object.entries(state.serverMemberIds).map(([k, arr]) => [
          k,
          Array.isArray(arr) ? arr.length : -1,
        ]),
      ),
    });
    return false;
  }

  const normalizedIncomingV =
    typeof incomingV === 'string' && incomingV.trim() ? incomingV.trim() : '0';
  const incomingMemberData = {
    serverMemberIds: state.serverMemberIds ?? {},
    membersByServer: state.membersByServer,
  };
  const storedMemberData = {
    serverMemberIds: refs.serverMemberIds.value ?? {},
    membersByServer: refs.workspaceMembersByServer.value,
  };
  const memberDataUnchanged = workspaceSnapshotMemberDataEqual(
    storedMemberData,
    incomingMemberData,
  );

  if (compareWorkspaceVersion(normalizedIncomingV, storedV) === 0) {
    if (memberDataUnchanged) {
      refs.lastSnapshotFetchedAtMs.value = Date.now();
      dbgMemberList(
        'applyWorkspaceSnapshot NOOP (duplicate version + roster)',
        {
          workspaceVersion: normalizedIncomingV,
          serverCount: state.servers.length,
          ms: shouldLog ? Math.round(performance.now() - t0) : undefined,
        },
      );
      return true;
    }
    dbgMemberList('applyWorkspaceSnapshot WARN (same version, shape differs)', {
      workspaceVersion: normalizedIncomingV,
      incomingServerCount: state.servers.length,
      storedServerCount: refs.servers.value.length,
      incomingServerMemberKeys: Object.keys(state.serverMemberIds ?? {}).length,
      storedServerMemberKeys: Object.keys(refs.serverMemberIds.value ?? {})
        .length,
    });
  }

  refs.servers.value = state.servers;
  refs.voiceEphemeralByChannelId.value = ingestVoiceEphemeralFromCategories(
    state.categoriesByServer,
  );
  refs.categoriesByServer.value = stripVoiceFieldsFromCategories(
    state.categoriesByServer,
  );
  refs.upcomingEventsByServerId.value = state.upcomingEventsByServerId ?? {};
  refs.myEventRsvps.value = state.myEventRsvps ?? [];
  if (state.membersByServer && !memberDataUnchanged) {
    refs.serverMemberIds.value = state.serverMemberIds;
  }
  refs.workspaceVersion.value = state.workspaceVersion;
  refs.lastSnapshotFetchedAtMs.value = Date.now();
  if (state.membersByServer && !memberDataUnchanged) {
    mergeMembersByServerInEchoSession(refs, state.membersByServer);
    refs.workspaceMembersByServer.value = state.membersByServer;
  }
  dbgMemberList('applyWorkspaceSnapshot OK', {
    workspaceVersion: state.workspaceVersion,
    serverCount: state.servers.length,
    userRowsCount: refs.users.value.length,
    ms: shouldLog ? Math.round(performance.now() - t0) : undefined,
    serverMemberCounts: Object.fromEntries(
      Object.entries(state.serverMemberIds).map(([k, arr]) => [
        k,
        Array.isArray(arr) ? arr.length : -1,
      ]),
    ),
    membersByServerCounts: state.membersByServer
      ? Object.fromEntries(
          Object.entries(state.membersByServer).map(([k, rows]) => [
            k,
            Array.isArray(rows) ? rows.length : -1,
          ]),
        )
      : '(payload omitted)',
  });
  return true;
}

export function noteWorkspaceEventVersionOnEchoSession(
  refs: EchoWorkspaceSessionApplyRefs,
  version: string | undefined,
): boolean {
  if (
    !sessionAcceptsIncomingVersion(
      version,
      refs.lastWorkspaceEventVersion.value,
      refs.workspaceVersion.value,
    )
  ) {
    return false;
  }
  refs.lastWorkspaceEventVersion.value =
    typeof version === 'string' && version.trim() ? version.trim() : '0';
  return true;
}

export function setDiscoverableServerRowsOnEchoSession(
  refs: EchoWorkspaceSessionApplyRefs,
  rows: EchoWorkspaceDiscoverableServer[],
): void {
  refs.discoverableServers.value = rows;
}

export function patchPresenceOnEchoSession(
  refs: EchoWorkspaceSessionApplyRefs,
  userId: string,
  status: string,
  opts?: { mobileSurface?: boolean },
): void {
  patchPresenceBatchOnEchoSession(refs, [
    { userId, status, mobileSurface: opts?.mobileSurface },
  ]);
}

export function patchPresenceBatchOnEchoSession(
  refs: EchoWorkspaceSessionApplyRefs,
  patches: readonly EchoWorkspacePresencePatch[],
): void {
  if (!patches.length) return;

  const currentPresence = refs.presenceByUserId.value;
  let nextPresence: Record<string, string> | null = null;

  const currentMobilePresence = refs.presenceMobileByUserId.value;
  let nextMobilePresence: Record<string, true> | null = null;

  const currentUsers = refs.users.value;
  const userIndexById = new Map<string, number>();
  for (let i = 0; i < currentUsers.length; i++) {
    userIndexById.set(currentUsers[i]!.id, i);
  }
  let nextUsers: EchoWorkspaceSessionUser[] | null = null;

  for (const patch of patches) {
    const userId = patch.userId;
    const status = patch.status;

    if (currentPresence[userId] !== status) {
      nextPresence ??= { ...currentPresence };
      nextPresence[userId] = status;
    }

    const userIndex = userIndexById.get(userId);
    if (userIndex !== undefined) {
      const user = (nextUsers ?? currentUsers)[userIndex];
      if (user && user.status !== status) {
        nextUsers ??= currentUsers.slice();
        nextUsers[userIndex] = { ...user, status };
      }
    }

    if (patch.mobileSurface !== undefined) {
      const currentlyMobile = currentMobilePresence[userId] === true;
      if (patch.mobileSurface && !currentlyMobile) {
        nextMobilePresence ??= { ...currentMobilePresence };
        nextMobilePresence[userId] = true;
      } else if (!patch.mobileSurface && currentlyMobile) {
        nextMobilePresence ??= { ...currentMobilePresence };
        delete nextMobilePresence[userId];
      }
    }
  }

  if (nextPresence) {
    refs.presenceByUserId.value = nextPresence;
  }
  if (nextUsers) {
    refs.users.value = nextUsers;
  }
  if (nextMobilePresence) {
    refs.presenceMobileByUserId.value = nextMobilePresence;
  }
}

export function patchDiscordPresenceBatchOnEchoSession(
  refs: EchoWorkspaceSessionApplyRefs,
  patches: readonly EchoWorkspaceDiscordPresencePatch[],
): void {
  if (!patches.length) return;

  const currentDiscordOnline = refs.discordOnlineByUserId.value;
  let nextDiscordOnline: Record<string, true> | null = null;

  for (const patch of patches) {
    const userId = patch.userId;
    const currentlyOnline = currentDiscordOnline[userId] === true;

    if (patch.discordOnline && !currentlyOnline) {
      nextDiscordOnline ??= { ...currentDiscordOnline };
      nextDiscordOnline[userId] = true;
    } else if (!patch.discordOnline && currentlyOnline) {
      nextDiscordOnline ??= { ...currentDiscordOnline };
      delete nextDiscordOnline[userId];
    }
  }

  if (nextDiscordOnline) {
    refs.discordOnlineByUserId.value = nextDiscordOnline;
  }
}

export function patchLastOnlineBatchOnEchoSession(
  refs: EchoWorkspaceSessionApplyRefs,
  patches: readonly EchoWorkspaceLastOnlinePatch[],
): void {
  if (!patches.length) return;

  const currentLastOnline = refs.lastOnlineAtByUserId.value;
  let nextLastOnline: Record<string, string> | null = null;

  for (const patch of patches) {
    const userId = patch.userId;
    if (currentLastOnline[userId] !== patch.lastOnlineAt) {
      nextLastOnline ??= { ...currentLastOnline };
      nextLastOnline[userId] = patch.lastOnlineAt;
    }
  }

  if (nextLastOnline) {
    refs.lastOnlineAtByUserId.value = nextLastOnline;
  }
}

export function setLiveSyncConnectedOnEchoSession(
  refs: EchoWorkspaceSessionApplyRefs,
  connected: boolean,
): void {
  if (refs.liveSyncConnected.value === connected) return;
  refs.liveSyncConnected.value = connected;
}

/**
 * Apply a `voice_roster_delta` event in-place to `categoriesByServer`.
 *
 * Three-tier model: this is tier-1 (instant optimistic patch). The debounced
 * full workspace hydrate (`workspace_invalidated` tier-2) and the HTTP snapshot
 * (tier-3) remain as correctness fallbacks — they overwrite whatever tier-1
 * left behind if the version ordering allows it.
 *
 * Version gate: skip if the session already carries a version strictly newer
 * than the delta (a full snapshot already corrected this era).
 *
 * Mutation rules (ephemeral map only — structural `categoriesByServer` stays stable):
 *  - join:       add userId to target channel's participantIds (idempotent)
 *  - leave/disconnect: remove userId from EVERY voice channel in the server +
 *                      clear their mute/deaf entries (prevents ghost tiles)
 *  - move:       remove userId from ALL channels (same as leave) then add to target
 *                (fromChannelId is a hint only — correctness does not depend on it)
 *  - mute/unmute/deafen/undeafen: patch mute/deaf maps on the target channel
 */
export function applyVoiceRosterDeltaToEchoSession(
  refs: EchoWorkspaceSessionApplyRefs,
  delta: NonNullable<
    import('@shared/types/socket').EchoWorkspaceEvent['voiceRosterDelta']
  >,
): void {
  const { serverId, channelId, userId } = delta;
  if (!serverId || !userId || !channelId) return;

  // Version gate: skip if the session already has a strictly newer snapshot.
  const effectiveV = getEffectiveWorkspaceVersion(
    refs.lastWorkspaceEventVersion.value,
    refs.workspaceVersion.value,
  );
  if (compareWorkspaceVersion(delta.workspaceVersion, effectiveV) < 0) return;

  const serverCats = refs.categoriesByServer.value[serverId];
  if (!Array.isArray(serverCats)) return;

  const next = new Map(refs.voiceEphemeralByChannelId.value);
  const voiceIds = listVoiceChannelIdsForServer(
    refs.categoriesByServer.value,
    serverId,
  );
  const targetIsStage = isStageChannelInServer(
    refs.categoriesByServer.value,
    serverId,
    channelId,
  );
  const changed = applyVoiceRosterDeltaToEphemeralMap(
    next,
    delta,
    voiceIds,
    targetIsStage,
  );
  if (!changed) return;
  refs.voiceEphemeralByChannelId.value = next;
}

/** Test / reset helper — clear ephemeral voice without touching the channel tree. */
export function resetVoiceEphemeralOnEchoSession(
  refs: EchoWorkspaceSessionApplyRefs,
): void {
  refs.voiceEphemeralByChannelId.value = emptyVoiceEphemeralMap();
}
