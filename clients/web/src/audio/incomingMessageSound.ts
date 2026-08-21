import type { MentionEntity, ReplyTo } from '@shared/types';
import {
  applyAttentionNotificationLevel,
  classifyAttentionPingKind,
  messageRepliesToUser,
} from '@shared/attentionPing';
import { useNotificationPreferencesStore } from '@/features/settings/notificationPreferences';
import type { ServerNotificationLevel } from '@/features/server-notifications/types';
import { ECHO_INCOMING_CHAT_MESSAGE_EVENT } from '@/audio/echoSoundEvents';
import type { EchoSoundId } from '@/audio/echoSoundAssets';
import { playEchoSound } from '@/features/layout/useEchoSounds';

export { ECHO_INCOMING_CHAT_MESSAGE_EVENT };

/**
 * Pick UI sound for mention-based server notifications.
 * Distinguishes @active vs @everyone when both classify as "broadcast".
 */
function echoSoundIdForMentionPing(
  mentions: MentionEntity[] | undefined,
  opts: {
    userId?: string;
    username?: string;
    displayName?: string;
    memberRoleIds?: Set<string>;
  },
  serverNotificationLevel: ServerNotificationLevel | undefined,
): EchoSoundId | null {
  if (!mentions?.length) return null;
  const raw = classifyAttentionPingKind(mentions, opts);
  const level = serverNotificationLevel ?? 'all';
  const ping = applyAttentionNotificationLevel(level, raw);
  if (!ping) return null;

  if (ping === 'personal') return 'pingDirectMention';
  if (ping === 'role') return 'pingActive';

  const hasEveryone = mentions.some((m) => m.kind === 'everyone');
  const hasActive = mentions.some((m) => m.kind === 'active');
  if (hasEveryone) return 'pingEveryone';
  if (hasActive) return 'pingActive';
  return 'pingEveryone';
}

export function playIncomingChatMessageSound(opts: {
  channelId: string;
  authorId: string;
  mentions?: MentionEntity[];
  replyTo?: ReplyTo;
  activeChannelId: string;
  currentUserId: string | undefined;
  /** Login — matched when mention labels use handle-style names. */
  currentUsername: string | undefined;
  /** Profile display name — matched when mention labels show display names. */
  currentDisplayName?: string | undefined;
  isDmChannel: boolean;
  serverNotificationLevel: ServerNotificationLevel | undefined;
  memberRoleIds: Set<string> | undefined;
}): boolean {
  const prefs = useNotificationPreferencesStore();
  if (!prefs.settings.soundEffects) return false;
  if (!opts.currentUserId || opts.authorId === opts.currentUserId) return false;

  if (opts.isDmChannel) {
    // DMs should notify even while the user is viewing a server channel.
    playEchoSound('pingDm');
    return true;
  }

  // Mentions and reply-pings notify regardless of which channel is active — an
  // @you in another channel should not stay silent just because it isn't open.
  // The server notification level (applied below) still gates noise; non-mention
  // messages never reach a sound here.

  if (
    messageRepliesToUser(
      opts.replyTo,
      opts.replyTo?.authorId,
      opts.currentUserId,
    )
  ) {
    const level = opts.serverNotificationLevel ?? 'all';
    const ping = applyAttentionNotificationLevel(level, 'personal');
    if (ping === 'personal') {
      playEchoSound('pingDirectMention');
      return true;
    }
  }

  const soundId = echoSoundIdForMentionPing(
    opts.mentions,
    {
      userId: opts.currentUserId,
      username: opts.currentUsername,
      displayName: opts.currentDisplayName,
      memberRoleIds: opts.memberRoleIds,
    },
    opts.serverNotificationLevel,
  );
  if (soundId) {
    playEchoSound(soundId);
    return true;
  }
  return false;
}
