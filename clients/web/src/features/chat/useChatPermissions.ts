/**
 * Chat send permissions for the main shell, provided from `AppLayout` via `provideChatPermissions`.
 *
 * **Authority (charter):** Effective permission **math** for the signed-in user in the active channel
 * is **server-side**. The client consumes `EchoChannelCapabilitiesDto` from
 * `GET /channels/:id/capabilities` (`fetchEchoChannelCapabilities`), held in layout by
 * `useAppLayoutLiveChannelCaps` and passed here as `liveChannelCapabilities`. This composable does
 * not recompute role × overwrite matrices for live chat — it maps those server booleans (plus
 * communication timeout fields) into composer UX via `getOutgoingBlockReasonDomain`.
 *
 * **While live caps are still null** (initial load / race): channel flags default permissive so the
 * composer stays usable; illegal sends remain impossible **authoritatively** because the server (and
 * socket pipeline) rejects them.
 *
 * **Role preview** (server settings): when preview is active, `resolvePreviewChannelPermission` and
 * related helpers in `@/features/chat/domain/chatRolePreviewPermissions` simulate “what this draft role could do”
 * from local channel/category snapshots — **not** the live effective-capabilities DTO. That path is
 * UI-only; it must not be mistaken for persisted-send truth.
 *
 * **Do not use parallel boolean “can send” APIs** — use `getSendState` or `assertCanSend` so UI cannot
 * half-enforce permissions. `getOutgoingBlockReason` remains the low-level gate for custom call sites.
 *
 * **Future entry points** (notifications, retry, commands): pass `attempt.context.source` when extending rules.
 *
 * **Provider:** In development, `useChatPermissions()` throws if `provideChatPermissions` was not
 * called above you. Production keeps a permissive inject fallback only for unusual mount trees.
 */
import { computed, inject, provide, type ComputedRef, type Ref } from 'vue';
import type { ChannelSummary } from '@shared/types';
import type { EchoChannelCapabilitiesDto } from '@/api/echo/types';
import type { ChannelCategory } from '@/features/layout/channels/useChannels';
import {
  findChannelContextById,
  liveChannelAllowsUseExternalEmoji,
  previewRoleHasUiPermission,
  resolvePreviewChannelPermission,
} from '@/features/chat/domain/chatRolePreviewPermissions';
import {
  attemptFlags as domainAttemptFlags,
  getOutgoingBlockReasonDomain,
  type OutgoingContentType,
} from '@/features/chat/domain/permissions';
import { formatOutgoingBlockReason } from '@/features/chat/domain/outgoingBlockReasonText';

export const CHAT_PERMISSIONS_KEY = Symbol('chatPermissions') as symbol & {
  __brand: 'ChatPermissions';
};

/** Parts of an outgoing payload for preview checks; extend with e.g. `sticker` when product adds them. */
export type { OutgoingContentType };

export type PermissionContextSource =
  | 'composer'
  | 'shell_executeSend'
  | 'notification'
  | 'retry'
  | 'command';

export type OutgoingBlockAttempt = {
  channelId: string;
  /**
   * What the action includes. Omitted or empty defaults to `['text']` (base send gate only).
   * Combine e.g. `['text', 'media']` for submits with attachments.
   */
  contentTypes?: OutgoingContentType[];
  /**
   * Reserved for future branching (e.g. different preview behavior per entry point).
   * Ignored by permission math today — pass it now so call sites stay forward-compatible.
   */
  context?: {
    source?: PermissionContextSource;
  };
};

export type SendPermissionState = {
  allowed: boolean;
  /** User-facing block message when `allowed` is false. */
  blockReason: string | null;
  blockKind?: 'permission' | 'timeout';
  communicationTimeoutUntilEpochMs?: number | null;
};

function attemptFlags(contentTypes: OutgoingContentType[] | undefined): {
  includesPoll: boolean;
  includesMedia: boolean;
  includesExternalEmoji: boolean;
  includesMassMention: boolean;
} {
  const types = contentTypes?.length
    ? contentTypes
    : (['text'] as OutgoingContentType[]);
  return domainAttemptFlags(types);
}

export type ChatPermissionsApi = {
  /**
   * Preferred API for UI: single object, no separate boolean to mis-wire.
   * Always pass the **real** target `channelId` (composer channel, not ambient routed id).
   */
  getSendState: (attempt: OutgoingBlockAttempt) => SendPermissionState;
  /** Throws `Error` with block message if send is not allowed. */
  assertCanSend: (attempt: OutgoingBlockAttempt) => void;
  /** Low-level gate; prefer `getSendState` / `assertCanSend` in new code. */
  getOutgoingBlockReason: (attempt: OutgoingBlockAttempt) => string | null;
};

/** DM message-request reply composer: not tied to the main active channel / role preview. */
export function createPermissiveChatPermissions(): ChatPermissionsApi {
  return {
    getSendState: () => ({ allowed: true, blockReason: null }),
    assertCanSend: () => {},
    getOutgoingBlockReason: () => null,
  };
}

const permissiveChatPermissionsFallback = createPermissiveChatPermissions();

export type CreateChatPermissionsDeps = {
  activeChannelId: Ref<string>;
  activeChannel: ComputedRef<ChannelSummary | null>;
  rawCategories: ComputedRef<ChannelCategory[]>;
  /** Accepts `useRolePreview().rolePreview` (readonly ref). */
  rolePreview: {
    readonly value: {
      serverId: string;
      uiPermissions: readonly string[];
      roleName: string;
    } | null;
  };
  selectedServerId: ComputedRef<string | undefined>;
  isRolePreviewActiveForServer: ComputedRef<boolean>;
  isInDMMode: ComputedRef<boolean>;
  isGroupDM: ComputedRef<boolean>;
  liveChannelCapabilities?: Ref<EchoChannelCapabilitiesDto | null>;
};

export function createChatPermissions(
  deps: CreateChatPermissionsDeps,
): ChatPermissionsApi {
  function previewHasUiPermission(permission: string): boolean {
    if (!deps.isRolePreviewActiveForServer.value) return false;
    return previewRoleHasUiPermission(
      deps.rolePreview.value?.uiPermissions,
      permission,
    );
  }

  const activeChannelContext = computed(() =>
    findChannelContextById(
      deps.rawCategories.value,
      deps.activeChannel.value?.id ?? deps.activeChannelId.value,
    ),
  );

  const shouldApplyServerChannelRolePreview = computed(() => {
    if (!deps.isRolePreviewActiveForServer.value) return false;
    if (deps.isInDMMode.value || deps.isGroupDM.value) return false;
    return !!activeChannelContext.value;
  });

  /** Internal: channel `sendMessages` (not the derived “composer allowed” flag). */
  const channelSendAllowed = computed(() => {
    if (!shouldApplyServerChannelRolePreview.value) {
      const live = deps.liveChannelCapabilities?.value;
      return live?.canSendMessages ?? true;
    }
    const ctx = activeChannelContext.value!;
    return resolvePreviewChannelPermission(
      deps.rolePreview.value,
      deps.selectedServerId.value,
      ctx.channel,
      ctx.category.channelPermissionDefaults,
      'sendMessages',
      previewHasUiPermission,
    );
  });

  const channelPollAllowed = computed(() => {
    if (!shouldApplyServerChannelRolePreview.value) {
      const live = deps.liveChannelCapabilities?.value;
      return live?.canCreatePolls ?? true;
    }
    return channelSendAllowed.value && previewHasUiPermission('createPolls');
  });

  const channelUploadAllowed = computed(() => {
    if (!shouldApplyServerChannelRolePreview.value) {
      const live = deps.liveChannelCapabilities?.value;
      return live?.canUploadFiles ?? true;
    }
    return channelSendAllowed.value && previewHasUiPermission('sendMedia');
  });

  const channelExternalEmojiAllowed = computed(() => {
    if (deps.isInDMMode.value || deps.isGroupDM.value) return true;
    const ctx = activeChannelContext.value;
    if (!ctx) return true;
    if (!shouldApplyServerChannelRolePreview.value) {
      const live = deps.liveChannelCapabilities?.value;
      if (live) return live.canUseExternalEmoji;
      return liveChannelAllowsUseExternalEmoji(ctx);
    }
    return resolvePreviewChannelPermission(
      deps.rolePreview.value,
      deps.selectedServerId.value,
      ctx.channel,
      ctx.category.channelPermissionDefaults,
      'useExternalEmoji',
      previewHasUiPermission,
    );
  });

  const channelMassMentionAllowed = computed(() => {
    if (deps.isInDMMode.value || deps.isGroupDM.value) return true;
    if (!shouldApplyServerChannelRolePreview.value) {
      const live = deps.liveChannelCapabilities?.value;
      return live?.canMentionEveryone ?? true;
    }
    const ctx = activeChannelContext.value;
    if (!ctx) return true;
    return resolvePreviewChannelPermission(
      deps.rolePreview.value,
      deps.selectedServerId.value,
      ctx.channel,
      ctx.category.channelPermissionDefaults,
      'mentionEveryone',
      previewHasUiPermission,
    );
  });

  const liveCommunicationTimeoutState = computed(() => {
    const live = deps.liveChannelCapabilities?.value;
    if (
      deps.isInDMMode.value ||
      deps.isGroupDM.value ||
      !live ||
      live.communicationTimeoutActive !== true
    ) {
      return null;
    }
    return {
      blockReason: 'You are in a communication timeout in this server.',
      communicationTimeoutUntilEpochMs:
        live.communicationTimeoutUntilEpochMs ?? null,
    };
  });

  function getOutgoingBlockReason(
    attempt: OutgoingBlockAttempt,
  ): string | null {
    void attempt.context;
    if (liveCommunicationTimeoutState.value) {
      return liveCommunicationTimeoutState.value.blockReason;
    }
    const {
      includesPoll,
      includesMedia,
      includesExternalEmoji,
      includesMassMention,
    } = attemptFlags(attempt.contentTypes);
    const reason = getOutgoingBlockReasonDomain({
      isRolePreviewActiveForServer: deps.isRolePreviewActiveForServer.value,
      activeChannel: deps.activeChannel.value,
      channelId: attempt.channelId,
      roleName: deps.rolePreview.value?.roleName ?? null,
      canSendMessages: channelSendAllowed.value,
      canCreatePolls: channelPollAllowed.value,
      canUploadFiles: channelUploadAllowed.value,
      canUseExternalEmoji: channelExternalEmojiAllowed.value,
      canMentionEveryone: channelMassMentionAllowed.value,
      includesPoll,
      includesMedia,
      includesExternalEmoji,
      includesMassMention,
    });
    return reason ? formatOutgoingBlockReason(reason) : null;
  }

  function getSendState(attempt: OutgoingBlockAttempt): SendPermissionState {
    if (liveCommunicationTimeoutState.value) {
      return {
        allowed: false,
        blockReason: liveCommunicationTimeoutState.value.blockReason,
        blockKind: 'timeout',
        communicationTimeoutUntilEpochMs:
          liveCommunicationTimeoutState.value.communicationTimeoutUntilEpochMs,
      };
    }
    const blockReason = getOutgoingBlockReason(attempt);
    return {
      allowed: blockReason === null,
      blockReason,
      ...(blockReason !== null ? { blockKind: 'permission' as const } : {}),
      communicationTimeoutUntilEpochMs: null,
    };
  }

  function assertCanSend(attempt: OutgoingBlockAttempt): void {
    const { allowed, blockReason } = getSendState(attempt);
    if (!allowed) {
      throw new Error(blockReason ?? 'You cannot send in this channel.');
    }
  }

  return {
    getSendState,
    assertCanSend,
    getOutgoingBlockReason,
  };
}

export function provideChatPermissions(api: ChatPermissionsApi): void {
  provide(CHAT_PERMISSIONS_KEY, api);
}

export function useChatPermissions(): ChatPermissionsApi {
  const injected = inject<ChatPermissionsApi | undefined>(
    CHAT_PERMISSIONS_KEY,
    undefined,
  );
  if (import.meta.env.DEV) {
    if (!injected) {
      throw new Error(
        'useChatPermissions() must run under a tree that called provideChatPermissions() (e.g. AppLayout). ' +
          'For message requests or other subtrees, call provideChatPermissions(createPermissiveChatPermissions()) explicitly.',
      );
    }
    return injected;
  }
  return injected ?? permissiveChatPermissionsFallback;
}
