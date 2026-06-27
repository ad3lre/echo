import { randomUUID } from 'crypto';
import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
} from 'fastify';
import type pg from 'pg';
import type { WebSocket } from 'ws';
import { GatewayOpcodes, GatewayIntents, intentHas } from './opcodes';
import { getEchoStore } from '../../../../domain/echoStore/bootstrap';
import {
  listEchoRolesForServer,
  listEchoChannelsForUser,
} from '../../../../domain/echoStore';
import { getEffectiveChannelPermissions } from '../../../../domain/echoStore/permissions';
import { getAuthStore } from '../../../../auth/store';
import {
  serializeGuild,
  serializeChannel,
  serializeGuildMember,
  serializeBotUser,
  serializeUser,
  serializeMessage,
} from '../serializers';
import { botEventBus, type BotEvent } from '../../../../platform/botEventBus';
import { botIdFromBotToken, type BotApp } from '../botAuth';
import { verifyBotTokenAgainstStoredHash } from '../../../../services/botTokenHash';

const HEARTBEAT_INTERVAL_MS = 41250;

interface GatewaySession {
  botApp: BotApp;
  intents: number;
  installedGuildIds: Set<string>;
  installerIdsByGuildId: Map<string, string>;
  sessionId: string;
  seq: number;
  alive: boolean;
  heartbeatTimer?: ReturnType<typeof setInterval>;
}

export type InstalledGuildAccess = {
  guildId: string;
  installerId: string;
};

function send(
  ws: WebSocket,
  op: number,
  d: unknown,
  t?: string,
  s?: number,
): void {
  if (ws.readyState !== 1) return;
  ws.send(
    JSON.stringify({
      op,
      d,
      ...(t !== undefined ? { t } : {}),
      ...(s !== undefined ? { s } : {}),
    }),
  );
}

export async function getInstalledGuildAccess(
  botId: string,
  poolOverride?: pg.Pool,
): Promise<InstalledGuildAccess[]> {
  const effectivePool = poolOverride ?? (await getEchoStore()).pool;
  if (!effectivePool) return [];
  const r = await effectivePool.query(
    `SELECT guild_id, installed_by_user_id
     FROM echo_bot_guild_installs
     WHERE bot_id = $1 AND installed_by_user_id IS NOT NULL`,
    [botId],
  );
  return r.rows.map((row: Record<string, unknown>) => ({
    guildId: String(row.guild_id),
    installerId: String(row.installed_by_user_id),
  }));
}

async function resolveTokenToBot(token: string): Promise<BotApp | null> {
  const rawToken = token.startsWith('Bot ')
    ? token.slice(4).trim()
    : token.trim();
  const botId = botIdFromBotToken(rawToken);
  if (!botId) return null;
  const { pool, enabled } = await getEchoStore();
  if (!enabled || !pool) return null;
  const r = await pool.query(
    `SELECT id, name, owner_user_id, token_hash FROM echo_bot_applications WHERE id = $1`,
    [botId],
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0] as Record<string, unknown>;
  const storedHash = String(row.token_hash ?? '');
  const ok = await verifyBotTokenAgainstStoredHash(rawToken, storedHash);
  if (!ok) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    ownerUserId: String(row.owner_user_id),
  };
}

export async function buildGuildCreatePayload(
  guildId: string,
  installerId: string,
  intents: number,
  poolOverride?: pg.Pool,
) {
  const pool = poolOverride ?? (await getEchoStore()).pool;
  if (!pool) return null;

  const serverRow = await pool.query(
    `SELECT id, name, icon_url, owner_id, description FROM echo_servers WHERE id = $1`,
    [guildId],
  );
  if (serverRow.rows.length === 0) return null;
  const s = serverRow.rows[0] as Record<string, unknown>;

  const [roles, channels, countRow] = await Promise.all([
    listEchoRolesForServer(pool, guildId),
    listEchoChannelsForUser(pool, guildId, installerId),
    pool.query(
      `SELECT COUNT(*)::int AS cnt FROM echo_server_members WHERE server_id = $1`,
      [guildId],
    ),
  ]);

  const memberCount = Number(countRow.rows[0]?.cnt ?? 0);
  const guild = serializeGuild(
    {
      id: String(s.id),
      name: String(s.name),
      iconUrl: String(s.icon_url ?? ''),
      ownerId: String(s.owner_id),
      description:
        typeof s.description === 'string' ? s.description : undefined,
    },
    roles,
    memberCount,
  );

  const serializedChannels = channels.map((ch) =>
    serializeChannel(
      {
        id: ch.id,
        name: ch.name,
        type: ch.type,
        position: ch.position,
        categoryId: ch.categoryId || undefined,
        nsfw: ch.nsfw,
        bitrateBps: ch.bitrateBps,
        userLimit: ch.userLimit,
      },
      guildId,
    ),
  );

  let members: ReturnType<typeof serializeGuildMember>[] = [];
  if (intentHas(intents, GatewayIntents.GUILD_MEMBERS)) {
    const memberRows = await pool.query(
      `SELECT m.user_id, m.joined_at, m.nickname, u.username, u.display_name, u.pfp
       FROM echo_server_members m
       INNER JOIN auth_users u ON u.id = m.user_id
       WHERE m.server_id = $1
       ORDER BY m.user_id ASC
       LIMIT 500`,
      [guildId],
    );

    const userIds = memberRows.rows.map((r: Record<string, unknown>) =>
      String(r.user_id),
    );
    const rolesByUser: Record<string, string[]> = {};
    if (userIds.length > 0) {
      const roleRows = await pool.query(
        `SELECT user_id, role_id FROM echo_member_roles WHERE server_id = $1 AND user_id = ANY($2::text[])`,
        [guildId, userIds],
      );
      for (const row of roleRows.rows as Record<string, unknown>[]) {
        const uid = String(row.user_id);
        if (!rolesByUser[uid]) rolesByUser[uid] = [];
        rolesByUser[uid].push(String(row.role_id));
      }
    }

    members = memberRows.rows.map((row: Record<string, unknown>) => {
      const userId = String(row.user_id);
      const joinedRaw = row.joined_at;
      const joinedAt =
        joinedRaw instanceof Date
          ? joinedRaw.toISOString()
          : typeof joinedRaw === 'string' && joinedRaw
            ? new Date(joinedRaw).toISOString()
            : new Date(0).toISOString();
      return serializeGuildMember(
        {
          userId,
          username: typeof row.username === 'string' ? row.username : undefined,
          displayName:
            typeof row.display_name === 'string' ? row.display_name : undefined,
          pfp: typeof row.pfp === 'string' ? row.pfp : undefined,
          serverNickname:
            typeof row.nickname === 'string' && row.nickname.trim()
              ? row.nickname.trim()
              : undefined,
          joinedAt,
        },
        rolesByUser[userId] ?? [],
      );
    });
  }

  return {
    ...guild,
    channels: serializedChannels,
    members,
    presences: [],
    voice_states: [],
    threads: [],
    stage_instances: [],
    guild_scheduled_events: [],
    large: false,
    unavailable: false,
    member_count: memberCount,
  };
}

async function sessionCanViewChannel(
  session: GatewaySession,
  serverId: string,
  channelId: string,
): Promise<boolean> {
  if (!session.installedGuildIds.has(serverId)) return false;
  const installerId = session.installerIdsByGuildId.get(serverId);
  if (!installerId) return false;
  const { pool, enabled } = await getEchoStore();
  if (!enabled || !pool) return false;
  const perms = await getEffectiveChannelPermissions(
    pool,
    serverId,
    installerId,
    channelId,
  );
  return perms.has('VIEW_CHANNEL');
}

export default async function discordGatewayRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  fastify.get(
    '/discord/gateway',
    { websocket: true },
    (ws: WebSocket, _req: FastifyRequest) => {
      let session: GatewaySession | null = null;

      // Send HELLO immediately
      send(ws, GatewayOpcodes.HELLO, {
        heartbeat_interval: HEARTBEAT_INTERVAL_MS,
      });

      // Bot event listener
      const onBotEvent = async (event: BotEvent) => {
        if (!session || !session.alive) return;

        if (event.kind === 'message') {
          if (!intentHas(session.intents, GatewayIntents.GUILD_MESSAGES))
            return;
          if (
            !(await sessionCanViewChannel(
              session,
              event.serverId,
              event.channelId,
            ))
          )
            return;

          const msg = event.message;
          let authorUser:
            | ReturnType<typeof serializeUser>
            | ReturnType<typeof serializeBotUser>;

          const { pool } = await getEchoStore();
          if (pool) {
            const botRow = await pool.query(
              `SELECT id, name FROM echo_bot_applications WHERE id = $1`,
              [msg.authorId],
            );
            if (botRow.rows.length > 0) {
              const br = botRow.rows[0] as Record<string, unknown>;
              authorUser = {
                id: String(br.id),
                username: String(br.name),
                discriminator: '0',
                global_name: String(br.name),
                avatar: null,
                bot: true,
                system: false,
                flags: 0,
              };
            } else {
              const { store: authStore } = await getAuthStore();
              const user = await authStore.getUserById(msg.authorId);
              authorUser = user
                ? serializeUser({
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    pfp: user.pfp,
                  })
                : serializeUser({
                    id: msg.authorId,
                    username: msg.authorDisplayName ?? 'Unknown',
                    displayName: msg.authorDisplayName,
                    pfp: msg.authorAvatar,
                  });
            }
          } else {
            authorUser = serializeUser({
              id: msg.authorId,
              username: msg.authorDisplayName ?? 'Unknown',
              displayName: msg.authorDisplayName,
            });
          }

          session.seq++;
          const discordMsg = serializeMessage(
            msg as Parameters<typeof serializeMessage>[0],
            authorUser,
          );
          // Include guild_id on the message for guild messages
          const payload = { ...discordMsg, guild_id: event.serverId };
          send(
            ws,
            GatewayOpcodes.DISPATCH,
            payload,
            'MESSAGE_CREATE',
            session.seq,
          );
        } else if (event.kind === 'message:updated') {
          if (!intentHas(session.intents, GatewayIntents.GUILD_MESSAGES))
            return;
          if (
            !(await sessionCanViewChannel(
              session,
              event.serverId,
              event.channelId,
            ))
          )
            return;

          session.seq++;
          send(
            ws,
            GatewayOpcodes.DISPATCH,
            {
              id: event.messageId,
              channel_id: event.channelId,
              guild_id: event.serverId,
              content: event.content,
              edited_timestamp: event.editedAt,
            },
            'MESSAGE_UPDATE',
            session.seq,
          );
        } else if (event.kind === 'message:deleted') {
          if (!intentHas(session.intents, GatewayIntents.GUILD_MESSAGES))
            return;
          if (
            !(await sessionCanViewChannel(
              session,
              event.serverId,
              event.channelId,
            ))
          )
            return;

          session.seq++;
          send(
            ws,
            GatewayOpcodes.DISPATCH,
            {
              id: event.messageId,
              channel_id: event.channelId,
              guild_id: event.serverId,
            },
            'MESSAGE_DELETE',
            session.seq,
          );
        } else if (event.kind === 'workspace') {
          const wsEvent = event.payload;
          if (
            !wsEvent.serverId ||
            !session.installedGuildIds.has(wsEvent.serverId)
          )
            return;

          // Map workspace event kinds to Discord dispatch events
          const kindMap: Record<string, string> = {
            channel_tree_changed: 'CHANNEL_UPDATE',
            role_graph_changed: 'GUILD_ROLE_UPDATE',
            membership_changed: 'GUILD_MEMBER_UPDATE',
            server_updated: 'GUILD_UPDATE',
          };
          const discordEventName = kindMap[wsEvent.kind];
          if (!discordEventName) return;

          session.seq++;
          send(
            ws,
            GatewayOpcodes.DISPATCH,
            { guild_id: wsEvent.serverId, version: wsEvent.version },
            discordEventName,
            session.seq,
          );
        }
      };

      ws.on('message', async (rawMsg: Buffer | string) => {
        let parsed: { op: number; d?: unknown; s?: number; t?: string };
        try {
          parsed = JSON.parse(
            typeof rawMsg === 'string' ? rawMsg : rawMsg.toString('utf8'),
          ) as typeof parsed;
        } catch {
          return;
        }

        const { op, d } = parsed;

        if (op === GatewayOpcodes.HEARTBEAT) {
          send(ws, GatewayOpcodes.HEARTBEAT_ACK, null);
          return;
        }

        if (op === GatewayOpcodes.IDENTIFY) {
          const identify = d as { token?: string; intents?: number };
          if (!identify?.token) {
            send(ws, GatewayOpcodes.INVALID_SESSION, false);
            ws.close(4004, 'Authentication failed');
            return;
          }

          const botApp = await resolveTokenToBot(identify.token);
          if (!botApp) {
            send(ws, GatewayOpcodes.INVALID_SESSION, false);
            ws.close(4004, 'Authentication failed');
            return;
          }

          const intents =
            typeof identify.intents === 'number' ? identify.intents : 0;
          const installedAccess = await getInstalledGuildAccess(botApp.id);
          const installedGuildIds = installedAccess.map((row) => row.guildId);
          const installerIdsByGuildId = new Map(
            installedAccess.map((row) => [row.guildId, row.installerId]),
          );

          const sessionId = randomUUID();
          const hostname = 'localhost';
          session = {
            botApp,
            intents,
            installedGuildIds: new Set(installedGuildIds),
            installerIdsByGuildId,
            sessionId,
            seq: 0,
            alive: true,
          };

          // Start heartbeat ack timer (detect dead connections)
          session.heartbeatTimer = setInterval(() => {
            if (!session?.alive) return;
            if (ws.readyState !== 1) {
              cleanup();
            }
          }, HEARTBEAT_INTERVAL_MS * 2);

          // Subscribe to bot event bus
          botEventBus.on('event', onBotEvent);

          // Build and send GUILD_CREATE for each installed guild
          for (const { guildId, installerId } of installedAccess) {
            const guildPayload = await buildGuildCreatePayload(
              guildId,
              installerId,
              intents,
            );
            if (guildPayload) {
              session.seq++;
              send(
                ws,
                GatewayOpcodes.DISPATCH,
                guildPayload,
                'GUILD_CREATE',
                session.seq,
              );
            }
          }

          // Send READY
          session.seq++;
          send(
            ws,
            GatewayOpcodes.DISPATCH,
            {
              v: 10,
              user: serializeBotUser(botApp),
              guilds: installedGuildIds.map((id) => ({
                id,
                unavailable: false,
              })),
              session_id: sessionId,
              resume_gateway_url: `ws://${hostname}/discord/gateway`,
              shard: [0, 1],
              application: {
                id: botApp.id,
                flags: 0,
              },
            },
            'READY',
            session.seq,
          );
          return;
        }

        if (op === GatewayOpcodes.RESUME) {
          // Minimal RESUME support: just send RESUMED
          if (!session) {
            send(ws, GatewayOpcodes.INVALID_SESSION, false);
            return;
          }
          session.seq++;
          send(ws, GatewayOpcodes.DISPATCH, null, 'RESUMED', session.seq);
          return;
        }
      });

      function cleanup() {
        if (session) {
          session.alive = false;
          if (session.heartbeatTimer) {
            clearInterval(session.heartbeatTimer);
            session.heartbeatTimer = undefined;
          }
          session = null;
        }
        botEventBus.off('event', onBotEvent);
      }

      ws.on('close', () => {
        cleanup();
      });

      ws.on('error', () => {
        cleanup();
      });
    },
  );
}
