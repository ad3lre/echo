import type pg from 'pg';
import {
  copyEchoChannelPermissionOverwrites,
  getEchoForumChannelRow,
} from '../domain/echoStore/forums';
import { createEchoChannel } from '../domain/echoStore/categoriesWorkspace';

export function deriveForumPostTitleFromWebhookContent(content: string): string {
  const trimmed = content.trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'New post';
  return trimmed.length > 100 ? `${trimmed.slice(0, 99)}…` : trimmed;
}

function parseForumAvailableTagIds(forumAvailableTags: unknown): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(forumAvailableTags)) return ids;
  for (const t of forumAvailableTags) {
    if (t && typeof t === 'object' && typeof (t as { id?: unknown }).id === 'string') {
      const id = String((t as { id: string }).id).trim();
      if (id) ids.add(id);
    }
  }
  return ids;
}

export async function resolveWebhookExecuteTargetChannel(opts: {
  pool: pg.Pool;
  serverId: string;
  webhookChannelId: string;
  webhookChannelType: string;
  queryThreadId?: string | null;
  bodyThreadName?: string | null;
  bodyAppliedTags?: unknown;
  /** First line of message body for default forum post title when `thread_name` omitted. */
  contentForTitle: string;
}): Promise<
  | {
      ok: true;
      targetChannelId: string;
      /** When a new forum post channel was created. */
      createdForumPostChannelId?: string;
    }
  | { ok: false; status: number; code: string; message: string }
> {
  const {
    pool,
    serverId,
    webhookChannelId,
    webhookChannelType,
    queryThreadId,
    bodyThreadName,
    bodyAppliedTags,
    contentForTitle,
  } = opts;

  const tid =
    typeof queryThreadId === 'string' && queryThreadId.trim()
      ? queryThreadId.trim()
      : null;
  const tname =
    typeof bodyThreadName === 'string' && bodyThreadName.trim()
      ? bodyThreadName.trim().slice(0, 100)
      : null;

  if (webhookChannelType === 'forum') {
    if (tid && tname) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_BODY',
        message: 'Cannot combine thread_id and thread_name.',
      };
    }
    if (!tid && !tname) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_BODY',
        message: 'This webhook is attached to a forum channel: provide thread_id or thread_name.',
      };
    }

    const forum = await getEchoForumChannelRow(pool, webhookChannelId);
    if (!forum || forum.type !== 'forum') {
      return {
        ok: false,
        status: 404,
        code: 'NOT_FOUND',
        message: 'Webhook target channel is no longer valid.',
      };
    }

    if (tid) {
      const ch = await pool.query(
        `
        SELECT id, type, parent_channel_id, server_id
        FROM echo_channels
        WHERE id = $1
        LIMIT 1
        `,
        [tid],
      );
      const row = ch.rows[0] as
        | { id: unknown; type: unknown; parent_channel_id: unknown; server_id: unknown }
        | undefined;
      if (!row || String(row.server_id) !== serverId) {
        return {
          ok: false,
          status: 400,
          code: 'INVALID_BODY',
          message: 'Invalid thread_id.',
        };
      }
      if (String(row.type) !== 'text' || String(row.parent_channel_id ?? '') !== webhookChannelId) {
        return {
          ok: false,
          status: 400,
          code: 'INVALID_BODY',
          message: 'thread_id must be a forum post channel under this forum hub.',
        };
      }
      return { ok: true, targetChannelId: tid };
    }

    const tagIdsRaw = Array.isArray(bodyAppliedTags)
      ? bodyAppliedTags.filter((x): x is string => typeof x === 'string')
      : [];
    const allowed = parseForumAvailableTagIds(forum.forumAvailableTags);
    const tagIds: string[] = [];
    for (const id of tagIdsRaw) {
      const t = id.trim();
      if (!t) continue;
      if (!allowed.has(t)) {
        return {
          ok: false,
          status: 400,
          code: 'INVALID_BODY',
          message: `Unknown forum tag: ${t}`,
        };
      }
      tagIds.push(t);
    }

    const title = tname ?? deriveForumPostTitleFromWebhookContent(contentForTitle);
    const postChannelId = await createEchoChannel(
      pool,
      serverId,
      title,
      'text',
      forum.categoryId,
      undefined,
      {
        parentChannelId: webhookChannelId,
        forumPostTagIds: tagIds,
        forumPostPinned: false,
        forumPostLocked: false,
        forumPostArchivedAt: null,
        forumPostCreatorUserId: null,
      },
    );
    if (postChannelId === 'invalid_category') {
      return {
        ok: false,
        status: 409,
        code: 'CONFLICT',
        message: 'Could not create forum post (invalid category).',
      };
    }
    await copyEchoChannelPermissionOverwrites(
      pool,
      serverId,
      webhookChannelId,
      postChannelId,
    );
    return {
      ok: true,
      targetChannelId: postChannelId,
      createdForumPostChannelId: postChannelId,
    };
  }

  if (webhookChannelType === 'text') {
    if (tname || (Array.isArray(bodyAppliedTags) && bodyAppliedTags.length > 0)) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_BODY',
        message: 'thread_name and applied_tags are only valid for forum channel webhooks.',
      };
    }
    if (!tid) {
      return { ok: true, targetChannelId: webhookChannelId };
    }
    const ch = await pool.query(
      `
      SELECT id, type, parent_channel_id, server_id
      FROM echo_channels
      WHERE id = $1
      LIMIT 1
      `,
      [tid],
    );
    const row = ch.rows[0] as
      | { id: unknown; type: unknown; parent_channel_id: unknown; server_id: unknown }
      | undefined;
    if (!row || String(row.server_id) !== serverId) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_BODY',
        message: 'Invalid thread_id.',
      };
    }
    if (String(row.type) !== 'text' || String(row.parent_channel_id ?? '') !== webhookChannelId) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_BODY',
        message: 'thread_id must be a child text channel of this webhook’s channel.',
      };
    }
    return { ok: true, targetChannelId: tid };
  }

  return { ok: true, targetChannelId: webhookChannelId };
}
