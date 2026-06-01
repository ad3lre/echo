import { onMounted, onUnmounted, type ComputedRef } from 'vue';
import type { AuthUserPublic } from '@/api/authClient';
import type { IncomingChatMessageNotifyDetail } from '@/audio/incomingChatMessageNotifyDetail';
import { playIncomingChatMessageSound } from '@/audio/incomingMessageSound';
import { ECHO_INCOMING_CHAT_MESSAGE_EVENT } from '@/audio/echoSoundEvents';
import type { ServerNotificationLevel } from '@/features/server-notifications/types';
import {
  isEchoChannelSnoozed,
  resolveEffectiveChannelNotificationLevel,
} from '@shared/attentionPing';
import { useNotificationPreferencesStore } from '@/stores/notificationPreferences';
import { useChannelNotificationOverridesStore } from '@/stores/channelNotificationOverrides';
import { dispatchAppToastDetail } from '@/utils/controllerMissingAction';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { avatarUrlForCallDisplay } from '@/utils/avatarDisplay';
import { isEchoAppActivelyFocused } from '@/utils/isEchoAppActivelyFocused';

const PREVIEW_MAX = 140;

function truncatePreview(s: string): string {
  const t = s.trim();
  if (t.length <= PREVIEW_MAX) return t;
  return `${t.slice(0, PREVIEW_MAX - 1)}…`;
}

export function useAppLayoutChatSound(deps: {
  activeChannelId: { readonly value: string };
  currentUser: ComputedRef<AuthUserPublic | undefined>;
  selectedServerId: { readonly value: string | null | undefined };
  serverNotificationLevelsMap: ComputedRef<
    Record<string, ServerNotificationLevel>
  >;
  memberRoleIds: () => Set<string> | undefined;
  isDmChannel: (channelId: string) => boolean;
  /** Human-readable channel / DM thread label for toast subtitle. */
  resolveChannelToastLabel: (channelId: string) => string;
  /** Resolve author display when the payload omitted `authorDisplayName`. */
  resolveAuthorToastTitle: (authorId: string) => string;
  /** Whether this conversation is open in the main column (paired with window focus to suppress alerts). */
  isViewingConversationChannel: (channelId: string) => boolean;
  /** DM rail selected — suppress DM toasts while browsing DMs (sound still plays). */
  isInDmUiContext: () => boolean;
  /** Same navigation as picking a channel in the sidebar. */
  openConversationChannel: (channelId: string, authorId: string) => void;
}) {
  onMounted(() => {
    if (typeof window === 'undefined') return;
    const handler = (ev: Event) => {
      const d = (ev as CustomEvent<IncomingChatMessageNotifyDetail>).detail;
      if (
        deps.isViewingConversationChannel(d.channelId) &&
        isEchoAppActivelyFocused()
      ) {
        return;
      }

      const isDm = deps.isDmChannel(d.channelId);
      const sid = deps.selectedServerId.value;
      const currentUser = deps.currentUser.value;

      // Per-channel snooze suppresses both sound and toast (server or DM).
      const channelOverrides = useChannelNotificationOverridesStore();
      const channelOverride =
        channelOverrides.overridesByChannelId[d.channelId];
      if (isEchoChannelSnoozed(channelOverride)) return;

      const baseServerLevel =
        !isDm && sid && sid !== 'echo'
          ? deps.serverNotificationLevelsMap.value[sid]
          : undefined;
      const effectiveServerLevel = baseServerLevel
        ? resolveEffectiveChannelNotificationLevel(
            baseServerLevel,
            channelOverride,
          )
        : undefined;

      const played = playIncomingChatMessageSound({
        channelId: d.channelId,
        authorId: d.authorId,
        mentions: d.mentions,
        replyTo: d.replyTo,
        activeChannelId: deps.activeChannelId.value,
        currentUserId: currentUser?.id,
        currentUsername: currentUser?.username,
        currentDisplayName: currentUser?.displayName,
        isDmChannel: isDm,
        serverNotificationLevel: effectiveServerLevel,
        memberRoleIds: deps.memberRoleIds(),
      });
      if (!played) return;
      const prefs = useNotificationPreferencesStore();
      if (!prefs.allowDesktopAlerts()) return;
      if (isDm && deps.isInDmUiContext() && isEchoAppActivelyFocused()) {
        return;
      }

      const title =
        d.authorDisplayName?.trim() || deps.resolveAuthorToastTitle(d.authorId);

      const channelLabel = deps.resolveChannelToastLabel(d.channelId);
      const previewRaw = d.contentPreview?.trim() ?? '';
      const messageBody = previewRaw
        ? truncatePreview(previewRaw)
        : isDm
          ? 'New direct message'
          : 'New message';

      const rawPfp = d.authorAvatar?.trim();
      const imageUrl = rawPfp
        ? safeImageUrl(avatarUrlForCallDisplay(rawPfp, d.authorId))
        : undefined;

      dispatchAppToastDetail({
        variant: 'incoming_chat_message',
        severity: 'info',
        durationMs: 12000,
        title,
        subtitle: channelLabel,
        message: messageBody,
        imageUrl,
        quickReplyChannelId: d.channelId,
        actions: [
          {
            id: 'open_message_channel',
            label: 'Open',
            kind: 'primary',
            run: () => {
              deps.openConversationChannel(d.channelId, d.authorId);
            },
          },
        ],
      });
    };
    window.addEventListener(ECHO_INCOMING_CHAT_MESSAGE_EVENT, handler);
    onUnmounted(() =>
      window.removeEventListener(ECHO_INCOMING_CHAT_MESSAGE_EVENT, handler),
    );
  });
}
