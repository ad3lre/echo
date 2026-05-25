import type pg from 'pg';
import { nextEchoSnowflakeId } from '../echoSnowflake';
import { invalidateEchoPermissionCacheForServer } from '../echoPermissionCache';
import { createEchoChannel } from './categoriesWorkspace';
import { getMergedRolePermissions } from './permissions';
import { isEchoServerOwner } from './access';
import type {
  EchoTicket,
  EchoTicketConfig,
  EchoTicketFormField,
  EchoTicketCategory,
  EchoTicketStatus,
} from '../../../../shared/types/ticket';

// ─── Config ──────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: EchoTicketConfig = {
  enabled: false,
  panelChannelId: null,
  ticketCategoryId: null,
  handlerRoleIds: [],
  logChannelId: null,
  formFields: [],
  maxOpenPerUser: 3,
  greetingMessage: '',
  requireCategory: false,
  ticketCategories: [],
};

export async function getEchoTicketConfig(
  pool: pg.Pool,
  serverId: string,
): Promise<EchoTicketConfig> {
  const r = await pool.query(
    `SELECT * FROM echo_server_ticket_config WHERE server_id = $1 LIMIT 1`,
    [serverId],
  );
  if (r.rows.length === 0) return { ...DEFAULT_CONFIG };
  const row = r.rows[0] as Record<string, unknown>;
  return {
    enabled: Boolean(row.enabled),
    panelChannelId: row.panel_channel_id ? String(row.panel_channel_id) : null,
    ticketCategoryId: row.ticket_category_id
      ? String(row.ticket_category_id)
      : null,
    handlerRoleIds: Array.isArray(row.handler_role_ids)
      ? (row.handler_role_ids as string[]).map(String)
      : [],
    logChannelId: row.log_channel_id ? String(row.log_channel_id) : null,
    formFields: parseJsonArray<EchoTicketFormField>(row.form_fields),
    maxOpenPerUser: Number(row.max_open_per_user) || 3,
    greetingMessage: String(row.greeting_message ?? ''),
    requireCategory: Boolean(row.require_category),
    ticketCategories: parseJsonArray<EchoTicketCategory>(row.ticket_categories),
  };
}

export type UpdateEchoTicketConfigInput = Partial<
  Omit<EchoTicketConfig, 'handlerRoleIds' | 'formFields' | 'ticketCategories'>
> & {
  handlerRoleIds?: string[];
  formFields?: EchoTicketFormField[];
  ticketCategories?: EchoTicketCategory[];
};

export async function updateEchoTicketConfig(
  pool: pg.Pool,
  serverId: string,
  input: UpdateEchoTicketConfigInput,
): Promise<EchoTicketConfig> {
  const existing = await getEchoTicketConfig(pool, serverId);
  const merged: EchoTicketConfig = {
    enabled: input.enabled ?? existing.enabled,
    panelChannelId:
      input.panelChannelId !== undefined
        ? input.panelChannelId
        : existing.panelChannelId,
    ticketCategoryId:
      input.ticketCategoryId !== undefined
        ? input.ticketCategoryId
        : existing.ticketCategoryId,
    handlerRoleIds: input.handlerRoleIds ?? existing.handlerRoleIds,
    logChannelId:
      input.logChannelId !== undefined
        ? input.logChannelId
        : existing.logChannelId,
    formFields: input.formFields ?? existing.formFields,
    maxOpenPerUser: input.maxOpenPerUser ?? existing.maxOpenPerUser,
    greetingMessage: input.greetingMessage ?? existing.greetingMessage,
    requireCategory: input.requireCategory ?? existing.requireCategory,
    ticketCategories: input.ticketCategories ?? existing.ticketCategories,
  };

  await pool.query(
    `INSERT INTO echo_server_ticket_config
       (server_id, enabled, panel_channel_id, ticket_category_id, handler_role_ids,
        log_channel_id, form_fields, max_open_per_user, greeting_message,
        require_category, ticket_categories)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11::jsonb)
     ON CONFLICT (server_id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       panel_channel_id = EXCLUDED.panel_channel_id,
       ticket_category_id = EXCLUDED.ticket_category_id,
       handler_role_ids = EXCLUDED.handler_role_ids,
       log_channel_id = EXCLUDED.log_channel_id,
       form_fields = EXCLUDED.form_fields,
       max_open_per_user = EXCLUDED.max_open_per_user,
       greeting_message = EXCLUDED.greeting_message,
       require_category = EXCLUDED.require_category,
       ticket_categories = EXCLUDED.ticket_categories`,
    [
      serverId,
      merged.enabled,
      merged.panelChannelId,
      merged.ticketCategoryId,
      merged.handlerRoleIds,
      merged.logChannelId,
      JSON.stringify(merged.formFields),
      merged.maxOpenPerUser,
      merged.greetingMessage,
      merged.requireCategory,
      JSON.stringify(merged.ticketCategories),
    ],
  );
  return merged;
}

// ─── Ticket CRUD ─────────────────────────────────────────────────────────────

export type CreateEchoTicketResult =
  | { ok: true; ticket: EchoTicket }
  | {
      ok: false;
      reason:
        | 'disabled'
        | 'max_open_reached'
        | 'missing_category'
        | 'invalid_category'
        | 'no_ticket_category'
        | 'channel_create_failed';
    };

export async function createEchoTicket(
  pool: pg.Pool,
  serverId: string,
  authorId: string,
  input: { subject: string; category?: string | null; answers?: unknown },
): Promise<CreateEchoTicketResult> {
  const config = await getEchoTicketConfig(pool, serverId);
  if (!config.enabled) return { ok: false, reason: 'disabled' };

  if (config.requireCategory && !input.category) {
    return { ok: false, reason: 'missing_category' };
  }
  if (
    input.category &&
    !config.ticketCategories.some((c) => c.id === input.category)
  ) {
    return { ok: false, reason: 'invalid_category' };
  }
  if (!config.ticketCategoryId) {
    return { ok: false, reason: 'no_ticket_category' };
  }

  const openCount = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM echo_tickets
     WHERE server_id = $1 AND author_id = $2 AND status IN ('open', 'in_progress')`,
    [serverId, authorId],
  );
  if ((openCount.rows[0]?.cnt ?? 0) >= config.maxOpenPerUser) {
    return { ok: false, reason: 'max_open_reached' };
  }

  const ticketId = nextEchoSnowflakeId();
  const ticketNumber = await getNextTicketNumber(pool, serverId);
  const channelName = buildTicketChannelName(ticketNumber, input.subject);

  const channelId = await createEchoChannel(
    pool,
    serverId,
    channelName,
    'text',
    config.ticketCategoryId,
  );
  if (channelId === 'invalid_category') {
    return { ok: false, reason: 'channel_create_failed' };
  }

  await setupTicketChannelPermissions(
    pool,
    serverId,
    channelId,
    authorId,
    config.handlerRoleIds,
  );

  await pool.query(
    `INSERT INTO echo_tickets
       (id, server_id, channel_id, author_id, subject, category, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'open')`,
    [
      ticketId,
      serverId,
      channelId,
      authorId,
      input.subject,
      input.category ?? null,
    ],
  );

  const ticket: EchoTicket = {
    id: ticketId,
    serverId,
    channelId,
    authorId,
    subject: input.subject,
    category: input.category ?? null,
    status: 'open',
    assignedTo: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
    closedBy: null,
  };

  return { ok: true, ticket };
}

export async function listEchoTicketsForServer(
  pool: pg.Pool,
  serverId: string,
  opts?: { status?: EchoTicketStatus; authorId?: string },
): Promise<EchoTicket[]> {
  let query = `SELECT * FROM echo_tickets WHERE server_id = $1`;
  const params: unknown[] = [serverId];
  let paramIdx = 2;

  if (opts?.status) {
    query += ` AND status = $${paramIdx}`;
    params.push(opts.status);
    paramIdx++;
  }
  if (opts?.authorId) {
    query += ` AND author_id = $${paramIdx}`;
    params.push(opts.authorId);
    paramIdx++;
  }

  query += ` ORDER BY created_at DESC`;
  const r = await pool.query(query, params);
  return r.rows.map(rowToTicket);
}

export async function getEchoTicketById(
  pool: pg.Pool,
  ticketId: string,
): Promise<EchoTicket | null> {
  const r = await pool.query(`SELECT * FROM echo_tickets WHERE id = $1`, [
    ticketId,
  ]);
  if (r.rows.length === 0) return null;
  return rowToTicket(r.rows[0]);
}

export async function getEchoTicketByChannelId(
  pool: pg.Pool,
  channelId: string,
): Promise<EchoTicket | null> {
  const r = await pool.query(
    `SELECT * FROM echo_tickets WHERE channel_id = $1 LIMIT 1`,
    [channelId],
  );
  if (r.rows.length === 0) return null;
  return rowToTicket(r.rows[0]);
}

export type UpdateEchoTicketResult =
  | { ok: true; ticket: EchoTicket }
  | { ok: false; reason: 'not_found' | 'forbidden' | 'invalid_status' };

export async function updateEchoTicketStatus(
  pool: pg.Pool,
  serverId: string,
  ticketId: string,
  actorId: string,
  newStatus: EchoTicketStatus,
): Promise<UpdateEchoTicketResult> {
  const ticket = await getEchoTicketById(pool, ticketId);
  if (!ticket || ticket.serverId !== serverId)
    return { ok: false, reason: 'not_found' };

  const validTransitions: Record<EchoTicketStatus, EchoTicketStatus[]> = {
    open: ['in_progress', 'resolved', 'closed'],
    in_progress: ['open', 'resolved', 'closed'],
    resolved: ['open', 'closed'],
    closed: ['open'],
  };

  if (!validTransitions[ticket.status]?.includes(newStatus)) {
    return { ok: false, reason: 'invalid_status' };
  }

  const isClosing = newStatus === 'closed';
  await pool.query(
    `UPDATE echo_tickets SET
       status = $1,
       updated_at = NOW(),
       closed_at = CASE WHEN $2 THEN NOW() ELSE closed_at END,
       closed_by = CASE WHEN $2 THEN $3 ELSE closed_by END
     WHERE id = $4`,
    [newStatus, isClosing, isClosing ? actorId : null, ticketId],
  );

  if (isClosing) {
    await lockTicketChannel(pool, serverId, ticket.channelId);
  }

  const updated = await getEchoTicketById(pool, ticketId);
  return { ok: true, ticket: updated! };
}

export async function assignEchoTicket(
  pool: pg.Pool,
  serverId: string,
  ticketId: string,
  assigneeId: string | null,
): Promise<UpdateEchoTicketResult> {
  const ticket = await getEchoTicketById(pool, ticketId);
  if (!ticket || ticket.serverId !== serverId)
    return { ok: false, reason: 'not_found' };

  await pool.query(
    `UPDATE echo_tickets SET assigned_to = $1, updated_at = NOW() WHERE id = $2`,
    [assigneeId, ticketId],
  );

  const updated = await getEchoTicketById(pool, ticketId);
  return { ok: true, ticket: updated! };
}

export async function deleteEchoTicket(
  pool: pg.Pool,
  serverId: string,
  ticketId: string,
): Promise<boolean> {
  const ticket = await getEchoTicketById(pool, ticketId);
  if (!ticket || ticket.serverId !== serverId) return false;

  await pool.query(`DELETE FROM echo_tickets WHERE id = $1`, [ticketId]);
  await pool.query(
    `DELETE FROM echo_channels WHERE id = $1 AND server_id = $2`,
    [ticket.channelId, serverId],
  );
  return true;
}

// ─── Permission helpers ──────────────────────────────────────────────────────

export async function canManageTickets(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<boolean> {
  if (await isEchoServerOwner(pool, serverId, userId)) return true;
  const perms = await getMergedRolePermissions(pool, serverId, userId);
  return (
    perms.has('MANAGE_TICKETS') ||
    perms.has('MANAGE_GUILD') ||
    perms.has('ADMINISTRATOR')
  );
}

export async function isTicketHandler(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<boolean> {
  if (await canManageTickets(pool, serverId, userId)) return true;
  const config = await getEchoTicketConfig(pool, serverId);
  if (config.handlerRoleIds.length === 0) return false;
  const r = await pool.query(
    `SELECT role_id FROM echo_member_roles
     WHERE server_id = $1 AND user_id = $2 AND role_id = ANY($3)`,
    [serverId, userId, config.handlerRoleIds],
  );
  return r.rows.length > 0;
}

// ─── Internals ───────────────────────────────────────────────────────────────

async function setupTicketChannelPermissions(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
  authorId: string,
  handlerRoleIds: string[],
): Promise<void> {
  await pool.query(
    `DELETE FROM echo_channel_permission_overwrite_rows WHERE server_id = $1 AND channel_id = $2`,
    [serverId, channelId],
  );

  const everyoneDeny = {
    VIEW_CHANNEL: false,
    SEND_MESSAGES: false,
  };

  const authorAllow = {
    VIEW_CHANNEL: true,
    SEND_MESSAGES: true,
    ATTACH_FILES: true,
    ADD_REACTIONS: true,
    READ_MESSAGE_HISTORY: true,
  };

  const handlerAllow = {
    VIEW_CHANNEL: true,
    SEND_MESSAGES: true,
    MANAGE_MESSAGES: true,
    ATTACH_FILES: true,
    ADD_REACTIONS: true,
    READ_MESSAGE_HISTORY: true,
  };

  // Deny @everyone
  await pool.query(
    `INSERT INTO echo_channel_permission_overwrite_rows (id, server_id, channel_id, target_type, target_id, partial)
     VALUES ($1, $2, $3, 'everyone', NULL, $4::jsonb)`,
    [nextEchoSnowflakeId(), serverId, channelId, JSON.stringify(everyoneDeny)],
  );

  // Allow ticket author
  await pool.query(
    `INSERT INTO echo_channel_permission_overwrite_rows (id, server_id, channel_id, target_type, target_id, partial)
     VALUES ($1, $2, $3, 'member', $4, $5::jsonb)`,
    [
      nextEchoSnowflakeId(),
      serverId,
      channelId,
      authorId,
      JSON.stringify(authorAllow),
    ],
  );

  // Allow handler roles
  for (const roleId of handlerRoleIds) {
    await pool.query(
      `INSERT INTO echo_channel_permission_overwrite_rows (id, server_id, channel_id, target_type, target_id, partial)
       VALUES ($1, $2, $3, 'role', $4, $5::jsonb)`,
      [
        nextEchoSnowflakeId(),
        serverId,
        channelId,
        roleId,
        JSON.stringify(handlerAllow),
      ],
    );
  }

  invalidateEchoPermissionCacheForServer(serverId);
}

async function lockTicketChannel(
  pool: pg.Pool,
  serverId: string,
  channelId: string,
): Promise<void> {
  // Revoke SEND_MESSAGES for the author member overwrite
  await pool.query(
    `UPDATE echo_channel_permission_overwrite_rows
     SET partial = partial || '{"SEND_MESSAGES": false}'::jsonb
     WHERE server_id = $1 AND channel_id = $2 AND target_type = 'member'`,
    [serverId, channelId],
  );
  invalidateEchoPermissionCacheForServer(serverId);
}

async function getNextTicketNumber(
  pool: pg.Pool,
  serverId: string,
): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int + 1 AS num FROM echo_tickets WHERE server_id = $1`,
    [serverId],
  );
  return r.rows[0]?.num ?? 1;
}

function buildTicketChannelName(num: number, subject: string): string {
  const slug = subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);
  return `ticket-${num}${slug ? '-' + slug : ''}`;
}

function rowToTicket(row: Record<string, unknown>): EchoTicket {
  return {
    id: String(row.id),
    serverId: String(row.server_id),
    channelId: String(row.channel_id),
    authorId: String(row.author_id),
    subject: String(row.subject ?? ''),
    category: row.category != null ? String(row.category) : null,
    status: String(row.status) as EchoTicketStatus,
    assignedTo: row.assigned_to != null ? String(row.assigned_to) : null,
    createdAt: row.created_at
      ? new Date(row.created_at as string).toISOString()
      : new Date().toISOString(),
    updatedAt: row.updated_at
      ? new Date(row.updated_at as string).toISOString()
      : new Date().toISOString(),
    closedAt: row.closed_at
      ? new Date(row.closed_at as string).toISOString()
      : null,
    closedBy: row.closed_by != null ? String(row.closed_by) : null,
  };
}

function parseJsonArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
