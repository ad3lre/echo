import type { Ref } from 'vue';
import type { EchoWorkspaceState } from '@/api/echoClient';
import {
  dbgMemberList,
  isEchoMemberListDebugEnabled,
} from '@/utils/echoMemberListDebug';
import { applyWorkspaceRosterUsersPipeline } from '@/services/domain/workspaceRoster';
import type { RawMessage } from '@/services/realtime/chatMessageTypes';
import type { ChannelCategory } from '@/composables/useChannels';

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
  createdAt?: string;
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
  discoverableServers: Ref<EchoWorkspaceDiscoverableServer[]>;
  messages: Ref<Record<string, RawMessage[]>>;
  serverMemberIds: Ref<Record<string, string[]>>;
  workspaceMembersByServer: Ref<WorkspaceMembersMap>;
  workspaceVersion: Ref<string>;
  liveSyncConnected: Ref<boolean>;
  lastWorkspaceEventVersion: Ref<string>;
  lastSnapshotFetchedAtMs: Ref<number>;
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

export function mergeMembersByServerInEchoSession(
  refs: EchoWorkspaceSessionApplyRefs,
  membersByServer:
    | NonNullable<EchoWorkspaceState['membersByServer']>
    | undefined,
): void {
  if (!membersByServer) return;
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

export function applyWorkspaceSnapshotToEchoSession(
  refs: EchoWorkspaceSessionApplyRefs,
  state: EchoWorkspaceState,
): boolean {
  const shouldLog = isEchoMemberListDebugEnabled();
  const t0 = shouldLog ? performance.now() : 0;
  const incomingV = state.workspaceVersion;
  const lastEvt = refs.lastWorkspaceEventVersion.value;
  const storedV = refs.workspaceVersion.value;

  if (!sessionAcceptsIncomingVersion(incomingV, lastEvt, storedV)) {
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
  if (compareWorkspaceVersion(normalizedIncomingV, storedV) === 0) {
    const looksSame =
      state.servers.length === refs.servers.value.length &&
      Object.keys(state.serverMemberIds ?? {}).length ===
        Object.keys(refs.serverMemberIds.value ?? {}).length;
    if (looksSame) {
      refs.lastSnapshotFetchedAtMs.value = Date.now();
      dbgMemberList('applyWorkspaceSnapshot NOOP (duplicate version)', {
        workspaceVersion: normalizedIncomingV,
        serverCount: state.servers.length,
        ms: shouldLog ? Math.round(performance.now() - t0) : undefined,
      });
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
  refs.categoriesByServer.value = state.categoriesByServer;
  if (state.membersByServer) {
    refs.serverMemberIds.value = state.serverMemberIds;
  }
  refs.workspaceVersion.value = state.workspaceVersion;
  refs.lastSnapshotFetchedAtMs.value = Date.now();
  mergeMembersByServerInEchoSession(refs, state.membersByServer);
  if (state.membersByServer) {
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
  refs.liveSyncConnected.value = connected;
}
