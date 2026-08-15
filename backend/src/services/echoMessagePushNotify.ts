import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import type { Message, MentionEntity } from '../../../shared/types';
import {
  applyAttentionNotificationLevel,
  resolveEffectiveChannelNotificationLevel,
} from '../../../shared/attentionPing';
import { config } from '../config';
import {
  listEchoChannelNotificationOverridesForUser,
  listEchoMemberRoleAssignmentsByUser,
  listEchoServerNotificationLevelsForUser,
  getEchoUserNotificationPreferences,
  buildEchoAttentionSnapshot,
} from '../domain/echoStore';
import {
  isEchoWebPushConfigured,
  sendEchoWebPushToUser,
  type EchoWebPushPayload,
} from './echoWebPush';
import { isEchoApnsConfigured, sendEchoApnsToUser } from './echoApns';

const PREVIEW_MAX = 140;

function previewFromMessage(m: Message): string {
  const raw = (m.contentText ?? m.content ?? '').replace(/\s+/g, ' ').trim();
  if (raw) {
    return raw.length > PREVIEW_MAX ? `${raw.slice(0, PREVIEW_MAX - 1)}…` : raw;
  }
  if ((m.attachments && m.attachments.length > 0) || m.imageUrl) {
    return '📎 Attachment';
  }
  if (m.videoUrl) return '🎬 Video';
  if (m.poll) return '📊 Poll';
  if (m.stickers && m.stickers.length > 0) return 'Sticker';
  return 'New message';
}

function channelDeepLink(channelId: string, serverId: string | null): string {
  const base = config.echoAppPublicUrl.replace(/\/$/, '');
  const path = serverId
    ? `/channels/${encodeURIComponent(serverId)}/${encodeURIComponent(channelId)}`
    : `/channels/@me/c/${encodeURIComponent(channelId)}`;
  return `${base}${path}`;
}

type PingTarget = { userId: string; pingKind: 'personal' | 'role' };

export function userAllowsMessagePush(
  settings: Record<string, unknown> | null | undefined,
): boolean {
  return settings?.desktopAlerts !== false;
}

/**
 * Resolve which users a server-channel message should *push* to. We push for
 * direct user mentions and reply-to-self (personal) plus role mentions (role),
 * but deliberately skip @everyone/@active to avoid server-wide push storms —
 * those still surface in-app via the attention badge.
 */
export function collectServerPushTargets(
  message: Message,
  authorId: string,
  roleIdsByUser: Record<string, string[]>,
): PingTarget[] {
  const byUser = new Map<string, 'personal' | 'role'>();
  const setPersonal = (uid: string) => {
    const id = uid.trim();
    if (!id || id === authorId) return;
    byUser.set(id, 'personal');
  };

  const mentions = (message.mentions ?? []) as MentionEntity[];
  const mentionedRoleIds = new Set<string>();
  for (const m of mentions) {
    if (m.kind === 'user') {
      setPersonal((m.userId ?? m.id ?? '').toString());
    } else if (m.kind === 'role' && m.roleId?.trim()) {
      mentionedRoleIds.add(m.roleId.trim());
    }
  }

  if (mentionedRoleIds.size > 0) {
    for (const [uid, roleIds] of Object.entries(roleIdsByUser)) {
      if (uid === authorId || byUser.get(uid) === 'personal') continue;
      if (roleIds.some((r) => mentionedRoleIds.has(r))) {
        byUser.set(uid, 'role');
      }
    }
  }

  const replyAuthor = message.replyTo?.authorId?.trim();
  if (replyAuthor) setPersonal(replyAuthor);

  return [...byUser.entries()].map(([userId, pingKind]) => ({
    userId,
    pingKind,
  }));
}

async function pushToUserIfAllowed(
  pool: pg.Pool,
  userId: string,
  channelId: string,
  payload: EchoWebPushPayload,
  gate: {
    serverId: string | null;
    pingKind?: 'personal' | 'role';
  },
): Promise<void> {
  const preferences = await getEchoUserNotificationPreferences(pool, userId);
  if (!userAllowsMessagePush(preferences?.settings)) return;

  const overrides = await listEchoChannelNotificationOverridesForUser(
    pool,
    userId,
    [channelId],
  );
  const override = overrides[channelId];

  if (gate.serverId) {
    const levels = await listEchoServerNotificationLevelsForUser(pool, userId, [
      gate.serverId,
    ]);
    const serverLevel = levels[gate.serverId] ?? 'mentions';
    const effective = resolveEffectiveChannelNotificationLevel(
      serverLevel,
      override,
    );
    const result = applyAttentionNotificationLevel(
      effective,
      gate.pingKind ?? 'personal',
    );
    if (!result) return;
  } else {
    // DM: notify unless snoozed.
    const effective = resolveEffectiveChannelNotificationLevel('all', override);
    if (effective === 'none') return;
  }

  const apnsConfigured = isEchoApnsConfigured();
  const badge =
    !apnsConfigured || preferences?.settings.unreadBadge === false
      ? undefined
      : await buildEchoAttentionSnapshot(pool, userId).then((snapshot) =>
          Object.values(snapshot.channelAttentionByChannelId).reduce(
            (total, channel) => total + Math.max(0, channel.unreadCount),
            0,
          ),
        );

  await Promise.all([
    isEchoWebPushConfigured()
      ? sendEchoWebPushToUser(pool, userId, payload)
      : Promise.resolve(0),
    apnsConfigured
      ? sendEchoApnsToUser(pool, userId, { ...payload, badge })
      : Promise.resolve(0),
  ]);
}

/**
 * Best-effort web-push fan-out for a freshly broadcast message. Never throws.
 * `dmRecipients` is the DM participant list (empty for server channels).
 */
export async function dispatchEchoMessagePushNotifications(
  pool: pg.Pool,
  log: FastifyBaseLogger,
  args: {
    message: Message;
    authorId: string;
    serverId: string | null;
    dmRecipients: string[];
  },
): Promise<void> {
  if (!isEchoWebPushConfigured() && !isEchoApnsConfigured()) return;
  const { message, authorId, serverId } = args;
  if (message.systemMessage) return;

  try {
    const title = message.authorDisplayName?.trim() || 'New message';
    const body = previewFromMessage(message);
    const url = channelDeepLink(message.channelId, serverId);
    const payloadBase: Omit<EchoWebPushPayload, 'tag'> = {
      title,
      body,
      url,
      channelId: message.channelId,
      authorId,
    };

    if (!serverId) {
      // DM / group DM: every participant except the author.
      const recipients = [...new Set(args.dmRecipients)].filter(
        (id) => id && id !== authorId,
      );
      await Promise.all(
        recipients.map((userId) =>
          pushToUserIfAllowed(
            pool,
            userId,
            message.channelId,
            { ...payloadBase, tag: message.channelId },
            { serverId: null },
          ),
        ),
      );
      return;
    }

    const roleIdsByUser = await listEchoMemberRoleAssignmentsByUser(
      pool,
      serverId,
    );
    const targets = collectServerPushTargets(message, authorId, roleIdsByUser);
    await Promise.all(
      targets.map((t) =>
        pushToUserIfAllowed(
          pool,
          t.userId,
          message.channelId,
          { ...payloadBase, tag: message.channelId },
          { serverId, pingKind: t.pingKind },
        ),
      ),
    );
  } catch (e) {
    log.warn(
      { err: e, channelId: message.channelId, messageId: message.id },
      'echo.web_push.dispatch_failed',
    );
  }
}
