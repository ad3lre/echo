import type pg from 'pg';
import { config } from '../config';
import { DEFAULT_ECHO_EVERYONE_ROLE_PERMISSIONS } from '../domain/echoStore/constants';
import { migrateEveryoneRoleHierarchyPositions } from '../domain/echoStore/roles';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';
import { normalizePermissionOverwritePartial } from '../domain/echoPermissionPrimitives';
import { repairEchoVoiceChannelMigrationDamage } from './repairEchoVoiceChannelMigration';

/**
 * Echo domain tables (servers, channels, messages, social, minimal RBAC).
 * Applied when PostgreSQL is available (same pool as auth).
 * Runs once per process; background jobs must not replay hundreds of DDL checks every tick.
 */
let echoTablesEnsureInflight: Promise<void> | null = null;

async function runEchoSchemaMigrationOnce(
  pool: pg.Pool,
  migrationId: string,
  run: () => Promise<void>,
): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const existing = await pool.query(
    `SELECT 1 FROM echo_schema_migrations WHERE id = $1 LIMIT 1`,
    [migrationId],
  );
  if (existing.rows.length > 0) return;
  await run();
  await pool.query(
    `INSERT INTO echo_schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
    [migrationId],
  );
}

async function runEnsureEchoTables(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon_url TEXT NOT NULL DEFAULT '',
      owner_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      banner_blur_enabled BOOLEAN NOT NULL DEFAULT false,
      banner_blackout_enabled BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE echo_servers ADD COLUMN IF NOT EXISTS banner_blur_enabled BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE echo_servers ALTER COLUMN banner_blur_enabled SET DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE echo_servers ADD COLUMN IF NOT EXISTS banner_blackout_enabled BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE echo_servers ADD COLUMN IF NOT EXISTS banner_url TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE echo_servers ADD COLUMN IF NOT EXISTS banner_position_y REAL NOT NULL DEFAULT 50;
  `);
  await pool.query(`
    ALTER TABLE echo_servers ADD COLUMN IF NOT EXISTS listed_in_directory BOOLEAN NOT NULL DEFAULT true;
  `);
  await pool.query(`
    ALTER TABLE echo_servers ADD COLUMN IF NOT EXISTS allow_global_guests BOOLEAN NOT NULL DEFAULT true;
  `);
  await pool.query(`
    ALTER TABLE echo_servers ADD COLUMN IF NOT EXISTS verification_require_email BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE echo_servers ADD COLUMN IF NOT EXISTS invite_join_enabled BOOLEAN NOT NULL DEFAULT true;
  `);
  await pool.query(`
    ALTER TABLE echo_servers ADD COLUMN IF NOT EXISTS vanity_code TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE echo_servers ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE echo_servers ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);
  await pool.query(`
    ALTER TABLE echo_servers ADD COLUMN IF NOT EXISTS last_voice_activity_at TIMESTAMPTZ NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_servers ADD COLUMN IF NOT EXISTS raid_protection_enabled BOOLEAN NOT NULL DEFAULT true;
  `);
  await pool.query(`
    ALTER TABLE echo_servers ADD COLUMN IF NOT EXISTS automod_spam_enabled BOOLEAN NOT NULL DEFAULT true;
  `);
  await pool.query(`
    ALTER TABLE echo_servers ADD COLUMN IF NOT EXISTS raid_join_threshold_count INT NOT NULL DEFAULT 10;
  `);
  await pool.query(`
    ALTER TABLE echo_servers ADD COLUMN IF NOT EXISTS raid_join_window_seconds INT NOT NULL DEFAULT 60;
  `);
  await pool.query(`
    ALTER TABLE echo_servers ADD COLUMN IF NOT EXISTS applications_enabled BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE echo_servers ADD COLUMN IF NOT EXISTS application_form JSONB NOT NULL DEFAULT '{"version":1,"questions":[]}'::jsonb;
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS echo_servers_vanity_lower_unique
    ON echo_servers (LOWER(vanity_code))
    WHERE vanity_code <> '';
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_server_members (
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (server_id, user_id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_server_members_user_idx
    ON echo_server_members(user_id);
  `);
  await pool.query(`
    ALTER TABLE echo_server_members ADD COLUMN IF NOT EXISTS nickname TEXT NOT NULL DEFAULT '';
  `);
  // Denormalized echo_servers.member_count so directory/invite/server reads never re-run
  // COUNT(*) over echo_server_members. Add + backfill exactly once (the backfill is heavy;
  // guard it to the boot where the column is first created). Defined here — after the
  // members table exists — because the backfill reads from it.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'echo_servers' AND column_name = 'member_count'
      ) THEN
        ALTER TABLE echo_servers ADD COLUMN member_count INT NOT NULL DEFAULT 0;
        UPDATE echo_servers s
        SET member_count = COALESCE(c.cnt, 0)
        FROM (
          SELECT server_id, COUNT(*)::int AS cnt
          FROM echo_server_members GROUP BY server_id
        ) c
        WHERE c.server_id = s.id;
      END IF;
    END $$;
  `);
  // Statement-level triggers (transition tables) keep member_count in sync. Statement-level
  // — not row-level — so a server delete that cascade-removes N members produces ONE
  // aggregated UPDATE per server instead of N updates to the same row (which row-level
  // triggers would fail on with "tuple already modified"). On a server delete the parent row
  // is already gone when the AFTER trigger fires, so the decrement simply matches zero rows.
  // ON CONFLICT DO NOTHING inserts that conflict never enter the NEW transition table, so the
  // count stays accurate.
  await pool.query(`
    CREATE OR REPLACE FUNCTION echo_server_member_count_ins() RETURNS trigger AS $fn$
    BEGIN
      UPDATE echo_servers s
      SET member_count = member_count + d.cnt
      FROM (
        SELECT server_id, COUNT(*)::int AS cnt FROM new_members GROUP BY server_id
      ) d
      WHERE s.id = d.server_id;
      RETURN NULL;
    END;
    $fn$ LANGUAGE plpgsql;
  `);
  await pool.query(`
    CREATE OR REPLACE FUNCTION echo_server_member_count_del() RETURNS trigger AS $fn$
    BEGIN
      UPDATE echo_servers s
      SET member_count = GREATEST(0, member_count - d.cnt)
      FROM (
        SELECT server_id, COUNT(*)::int AS cnt FROM old_members GROUP BY server_id
      ) d
      WHERE s.id = d.server_id;
      RETURN NULL;
    END;
    $fn$ LANGUAGE plpgsql;
  `);
  await pool.query(
    `DROP TRIGGER IF EXISTS echo_server_member_count_ins_trg ON echo_server_members;`,
  );
  await pool.query(`
    CREATE TRIGGER echo_server_member_count_ins_trg
    AFTER INSERT ON echo_server_members
    REFERENCING NEW TABLE AS new_members
    FOR EACH STATEMENT EXECUTE PROCEDURE echo_server_member_count_ins();
  `);
  await pool.query(
    `DROP TRIGGER IF EXISTS echo_server_member_count_del_trg ON echo_server_members;`,
  );
  await pool.query(`
    CREATE TRIGGER echo_server_member_count_del_trg
    AFTER DELETE ON echo_server_members
    REFERENCING OLD TABLE AS old_members
    FOR EACH STATEMENT EXECUTE PROCEDURE echo_server_member_count_del();
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_channels (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      category_name TEXT NOT NULL DEFAULT '',
      position INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_channels_server_idx ON echo_channels(server_id);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_categories (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_categories_server_idx ON echo_categories(server_id);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS echo_categories_server_name_lower_unique
    ON echo_categories (server_id, LOWER(name));
  `);
  await pool.query(
    `ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS category_id TEXT;`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_invites (
      code TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      inviter_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NULL
    );
  `);
  await pool.query(`
    ALTER TABLE echo_invites ADD COLUMN IF NOT EXISTS skips_application BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_server_applications (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'invite',
      invite_token_snapshot TEXT NOT NULL DEFAULT '',
      answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ NULL,
      resolved_by TEXT NULL REFERENCES auth_users(id) ON DELETE SET NULL,
      resolution_note TEXT NOT NULL DEFAULT '',
      CONSTRAINT echo_server_applications_status_chk
        CHECK (status IN ('pending', 'approved', 'rejected')),
      CONSTRAINT echo_server_applications_source_chk
        CHECK (source IN ('invite', 'directory'))
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_server_applications_server_status_idx
    ON echo_server_applications (server_id, status, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_server_applications_user_idx
    ON echo_server_applications (user_id);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS echo_server_applications_one_pending_per_user
    ON echo_server_applications (server_id, user_id)
    WHERE status = 'pending';
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES echo_channels(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      mentions JSONB,
      reply_to JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  /* Legacy timeline index; safe to drop after snowflake cutover is stable (see ADR 002 / runbook). */
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_messages_channel_created ON echo_messages(channel_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_messages_channel_id_idx ON echo_messages (channel_id, id);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_message_reactions (
      message_id TEXT NOT NULL REFERENCES echo_messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (message_id, user_id, emoji)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_message_reactions_message_idx ON echo_message_reactions (message_id);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_channel_pins (
      channel_id TEXT NOT NULL REFERENCES echo_channels(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL REFERENCES echo_messages(id) ON DELETE CASCADE,
      pinned_by TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (channel_id, message_id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_channel_pins_channel_idx ON echo_channel_pins (channel_id, pinned_at DESC);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_channel_read_state (
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL REFERENCES echo_channels(id) ON DELETE CASCADE,
      last_read_message_id TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, channel_id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_channel_read_state_channel_idx ON echo_channel_read_state (channel_id);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_server_notification_preferences (
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      level TEXT NOT NULL DEFAULT 'mentions',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, server_id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_server_notification_preferences_server_idx
    ON echo_server_notification_preferences (server_id);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_friendships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      peer_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT echo_friendships_pair UNIQUE (user_id, peer_id)
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS echo_friendships_user_idx ON echo_friendships(user_id);`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS echo_friendships_peer_idx ON echo_friendships(peer_id);`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_dm_threads (
      channel_id TEXT PRIMARY KEY REFERENCES echo_channels(id) ON DELETE CASCADE,
      user_low TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      user_high TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      CONSTRAINT echo_dm_threads_pair UNIQUE (user_low, user_high)
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS echo_dm_threads_user_low_idx ON echo_dm_threads(user_low);`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS echo_dm_threads_user_high_idx ON echo_dm_threads(user_high);`,
  );
  /**
   * Single canonical "last activity" timestamp per DM (direct or group) channel.
   * Authoritative ordering key for the DM inbox; written by message persist, DM call
   * signaling, friend-accept, and group-DM mutation paths. Survives message deletions
   * (unlike `MAX(echo_messages.id)`) so inbox order does not regress when history is purged.
   */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_dm_activity (
      channel_id TEXT PRIMARY KEY REFERENCES echo_channels(id) ON DELETE CASCADE,
      last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_activity_kind TEXT NOT NULL DEFAULT 'open'
        CHECK (last_activity_kind IN ('open','message','call','friend','group_event'))
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_dm_activity_last_idx
    ON echo_dm_activity (last_activity_at DESC);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_dm_message_requests (
      channel_id TEXT PRIMARY KEY REFERENCES echo_dm_threads(channel_id) ON DELETE CASCADE,
      requester_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      recipient_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      responded_at TIMESTAMPTZ NULL,
      CONSTRAINT echo_dm_message_requests_no_self CHECK (requester_user_id <> recipient_user_id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_dm_message_requests_recipient_status_idx
    ON echo_dm_message_requests(recipient_user_id, status, requested_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_dm_message_requests_requester_status_idx
    ON echo_dm_message_requests(requester_user_id, status, requested_at DESC);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_group_dm_members (
      channel_id TEXT NOT NULL REFERENCES echo_channels(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      PRIMARY KEY (channel_id, user_id)
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS echo_group_dm_members_user_idx ON echo_group_dm_members(user_id);`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_user_blocks (
      blocker_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (blocker_id, blocked_id),
      CONSTRAINT echo_user_blocks_no_self CHECK (blocker_id <> blocked_id)
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS echo_user_blocks_blocked_idx ON echo_user_blocks(blocked_id);`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_user_reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS echo_user_reports_target_idx ON echo_user_reports(target_id);`,
  );
  await pool.query(`
    ALTER TABLE echo_user_reports ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other';
  `);
  await pool.query(`
    ALTER TABLE echo_user_reports ADD COLUMN IF NOT EXISTS message_id TEXT;
  `);
  await pool.query(`
    ALTER TABLE echo_user_reports ADD COLUMN IF NOT EXISTS channel_id TEXT;
  `);
  await pool.query(`
    ALTER TABLE echo_user_reports ADD COLUMN IF NOT EXISTS server_id TEXT;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_message_reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      server_id TEXT,
      author_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      category TEXT NOT NULL DEFAULT 'other',
      reason TEXT NOT NULL DEFAULT '',
      content_snapshot TEXT NOT NULL DEFAULT '',
      attachments_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS echo_message_reports_message_idx ON echo_message_reports(message_id);`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS echo_message_reports_author_idx ON echo_message_reports(author_id);`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS echo_message_reports_created_idx ON echo_message_reports(created_at DESC);`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_bug_reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      body TEXT NOT NULL DEFAULT '',
      client_meta JSONB,
      trace_json JSONB,
      attachment_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS echo_bug_reports_reporter_idx ON echo_bug_reports(reporter_id);`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_user_ringtones (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT '',
      storage_key TEXT NOT NULL,
      public_url TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'audio/mpeg',
      size_bytes BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS echo_user_ringtones_user_idx ON echo_user_ringtones(user_id);`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_presence (
      user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'offline',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE echo_presence
    ADD COLUMN IF NOT EXISTS active_client TEXT NOT NULL DEFAULT 'web';
  `);
  await pool.query(`
    ALTER TABLE echo_presence
    ADD COLUMN IF NOT EXISTS last_online_at TIMESTAMPTZ NULL;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_presence_last_online_idx ON echo_presence(last_online_at);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_discord_presence (
      discord_user_id TEXT PRIMARY KEY,
      discord_username TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'offline',
      activities JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_online BOOLEAN NOT NULL DEFAULT false,
      snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      discord_guild_id TEXT NOT NULL DEFAULT ''
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS echo_discord_presence_online_idx ON echo_discord_presence(is_online) WHERE is_online = true;`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS echo_discord_presence_snapshot_idx ON echo_discord_presence(snapshot_at);`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_roles (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NULL DEFAULT NULL,
      position INT NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_member_roles (
      server_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role_id TEXT NOT NULL REFERENCES echo_roles(id) ON DELETE CASCADE,
      PRIMARY KEY (server_id, user_id, role_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_role_links (
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      anchor_role_id TEXT NOT NULL REFERENCES echo_roles(id) ON DELETE CASCADE,
      linked_role_id TEXT NOT NULL REFERENCES echo_roles(id) ON DELETE CASCADE,
      two_way BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (server_id, anchor_role_id, linked_role_id),
      CHECK (anchor_role_id <> linked_role_id)
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS echo_role_links_linked_idx ON echo_role_links(server_id, linked_role_id);`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_audit_log (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT '',
      target_id TEXT NOT NULL DEFAULT '',
      meta JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_server_bans (
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NULL,
      reason TEXT NULL,
      banned_by TEXT NULL REFERENCES auth_users(id) ON DELETE SET NULL,
      PRIMARY KEY (server_id, user_id)
    );
  `);
  await pool.query(`
    ALTER TABLE echo_server_bans ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_server_bans ADD COLUMN IF NOT EXISTS reason TEXT NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_server_bans ADD COLUMN IF NOT EXISTS banned_by TEXT NULL REFERENCES auth_users(id) ON DELETE SET NULL;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_server_ip_bans (
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      ip INET NOT NULL,
      banned_user_id TEXT NULL REFERENCES auth_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NULL,
      reason TEXT NULL,
      banned_by TEXT NULL REFERENCES auth_users(id) ON DELETE SET NULL,
      PRIMARY KEY (server_id, ip)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_server_ip_bans_banned_user_idx
    ON echo_server_ip_bans (server_id, banned_user_id);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_server_member_timeouts (
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      timeout_until TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (server_id, user_id)
    );
  `);
  const everyonePermsJson = JSON.stringify([
    ...DEFAULT_ECHO_EVERYONE_ROLE_PERMISSIONS,
  ]);
  // DDL DEFAULT cannot use bind parameters ($1) with node-pg; inline escaped JSON literal.
  const everyonePermsSqlLiteral = `'${everyonePermsJson.replace(/'/g, "''")}'`;
  await pool.query(
    `ALTER TABLE echo_roles ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT ${everyonePermsSqlLiteral}::jsonb`,
  );
  await pool.query(
    `ALTER TABLE echo_roles ALTER COLUMN permissions SET DEFAULT ${everyonePermsSqlLiteral}::jsonb`,
  );
  await pool.query(`
    ALTER TABLE echo_roles ADD COLUMN IF NOT EXISTS hoist BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE echo_roles ADD COLUMN IF NOT EXISTS default_on_join BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE echo_roles ADD COLUMN IF NOT EXISTS dark_color TEXT NULL DEFAULT NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_roles ADD COLUMN IF NOT EXISTS light_color TEXT NULL DEFAULT NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_roles ADD COLUMN IF NOT EXISTS separate_theme_colors BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    UPDATE echo_roles
    SET dark_color = COALESCE(dark_color, color)
    WHERE dark_color IS NULL;
  `);
  await pool.query(`
    UPDATE echo_roles
    SET light_color = COALESCE(light_color, color)
    WHERE light_color IS NULL;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_role_categories (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INT NOT NULL DEFAULT 0
    );
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS echo_role_categories_server_idx ON echo_role_categories(server_id);`,
  );
  await pool.query(`
    ALTER TABLE echo_role_categories ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE echo_role_categories ADD COLUMN IF NOT EXISTS default_permissions JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);
  await pool.query(`
    ALTER TABLE echo_role_categories ADD COLUMN IF NOT EXISTS default_hoist BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE echo_role_categories ADD COLUMN IF NOT EXISTS default_on_join BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE echo_role_categories ADD COLUMN IF NOT EXISTS default_role_scope TEXT NOT NULL DEFAULT 'category';
  `);
  await pool.query(`
    ALTER TABLE echo_role_categories ADD COLUMN IF NOT EXISTS default_role_type TEXT NOT NULL DEFAULT 'mixed';
  `);
  await pool.query(`
    ALTER TABLE echo_roles ADD COLUMN IF NOT EXISTS sync_with_category_defaults BOOLEAN NOT NULL DEFAULT true;
  `);
  await pool.query(`
    ALTER TABLE echo_roles ADD COLUMN IF NOT EXISTS role_category_id TEXT NULL REFERENCES echo_role_categories(id) ON DELETE SET NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_roles ADD COLUMN IF NOT EXISTS rank_in_category INT NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    ALTER TABLE echo_roles ADD COLUMN IF NOT EXISTS role_scope TEXT NOT NULL DEFAULT 'category';
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS echo_roles_role_category_idx ON echo_roles(server_id, role_category_id);`,
  );
  await pool.query(`
    ALTER TABLE echo_roles ADD COLUMN IF NOT EXISTS role_type TEXT NOT NULL DEFAULT 'mixed';
  `);
  await pool.query(`
    ALTER TABLE echo_roles ADD COLUMN IF NOT EXISTS role_icon_url TEXT NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_roles ADD COLUMN IF NOT EXISTS role_icon_emoji_id TEXT NULL;
  `);
  await pool.query(`
    UPDATE echo_roles SET role_type = 'mixed'
    WHERE role_type IS NULL OR TRIM(role_type) = '';
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_messages_deleted_at_purge_idx
    ON echo_messages (deleted_at)
    WHERE deleted_at IS NOT NULL;
  `);
  /** Backfill: any DM-realm channel without an activity row → MAX(message.created_at) else channel.created_at. */
  await pool.query(`
    INSERT INTO echo_dm_activity (channel_id, last_activity_at, last_activity_kind)
    SELECT
      ch.id,
      COALESCE(
        (
          SELECT MAX(m.created_at)
          FROM echo_messages m
          WHERE m.channel_id = ch.id AND m.deleted_at IS NULL
        ),
        ch.created_at
      ),
      CASE WHEN EXISTS (
        SELECT 1 FROM echo_messages m
        WHERE m.channel_id = ch.id AND m.deleted_at IS NULL
      ) THEN 'message' ELSE 'open' END
    FROM echo_channels ch
    WHERE ch.server_id = 'echo_dm_realm'
    ON CONFLICT (channel_id) DO NOTHING;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS embeds JSONB NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS image_url TEXT NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS video_url TEXT NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS audio_url TEXT NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS gif BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS image_spoiler BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS poll JSONB NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS attachments JSONB NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS stickers JSONB NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS content_json JSONB NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS search_index_text TEXT NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS message_format_version INT NOT NULL DEFAULT 1;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS content_schema_version INT NOT NULL DEFAULT 1;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS forward_of JSONB NULL;
  `);
  await pool.query(`
    UPDATE echo_messages
    SET search_index_text = content
    WHERE search_index_text IS NULL AND deleted_at IS NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS e2ee_envelope JSONB NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS e2ee_ciphertext TEXT NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS e2ee_sender_device_id TEXT NULL;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_e2ee_devices (
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL,
      identity_key TEXT NOT NULL,
      signed_prekey JSONB NULL,
      one_time_prekeys JSONB NOT NULL DEFAULT '[]'::jsonb,
      registration_id INT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ NULL,
      PRIMARY KEY (user_id, device_id)
    );
  `);
  await pool.query(`
    ALTER TABLE echo_e2ee_devices ADD COLUMN IF NOT EXISTS registration_id INT NULL;
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS echo_e2ee_devices_user_idx ON echo_e2ee_devices(user_id);`,
  );
  await pool.query(`
    ALTER TABLE echo_e2ee_devices ADD COLUMN IF NOT EXISTS protocol_device_id INT NULL;
  `);
  await pool.query(`
    WITH ranked AS (
      SELECT ctid,
        ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) AS rn
      FROM echo_e2ee_devices
      WHERE protocol_device_id IS NULL
    )
    UPDATE echo_e2ee_devices d
    SET protocol_device_id = ranked.rn
    FROM ranked
    WHERE d.ctid = ranked.ctid;
  `);
  await pool.query(`
    UPDATE echo_e2ee_devices SET protocol_device_id = 1 WHERE protocol_device_id IS NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_e2ee_devices ALTER COLUMN protocol_device_id SET DEFAULT 1;
  `);
  await pool.query(`
    ALTER TABLE echo_e2ee_devices ALTER COLUMN protocol_device_id SET NOT NULL;
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS echo_e2ee_devices_user_protocol_uidx
    ON echo_e2ee_devices(user_id, protocol_device_id);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_e2ee_threads (
      channel_id TEXT NOT NULL PRIMARY KEY REFERENCES echo_channels(id) ON DELETE CASCADE,
      mode TEXT NOT NULL DEFAULT 'e2ee_v1',
      key_epoch INT NOT NULL DEFAULT 1,
      enabled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      enabled_by_user_id TEXT NULL REFERENCES auth_users(id) ON DELETE SET NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_e2ee_pairing_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      ciphertext TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'ready', 'consumed'))
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_e2ee_pairing_user_created_idx
    ON echo_e2ee_pairing_sessions(user_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_e2ee_pairing_expires_idx
    ON echo_e2ee_pairing_sessions(expires_at);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_poll_votes (
      message_id TEXT NOT NULL REFERENCES echo_messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      option_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (message_id, user_id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_poll_votes_message_idx ON echo_poll_votes(message_id);
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS permission_overrides JSONB NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS slowmode_seconds INT NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS user_limit INT NOT NULL DEFAULT 0;
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS bitrate_bps INT NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS nsfw BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE echo_channels DROP COLUMN IF EXISTS announcement;
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS icon_key TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS message_history_anchor TEXT NOT NULL DEFAULT 'bottom';
  `);
  await pool.query(`
    ALTER TABLE echo_categories ADD COLUMN IF NOT EXISTS auto_delete_after_seconds INT NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS auto_delete_after_seconds INT NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS auto_delete_synced_to_category BOOLEAN NOT NULL DEFAULT true;
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS parent_channel_id TEXT NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS forum_available_tags JSONB NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS forum_post_tag_ids JSONB NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS forum_post_pinned BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS forum_post_locked BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS forum_post_archived_at TIMESTAMPTZ NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS forum_post_creator_user_id TEXT NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS forum_creator_default_perms JSONB NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS message_format_template TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS message_format_hard BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_channels_parent_channel_idx ON echo_channels(parent_channel_id);
  `);
  if (!config.echoDropLegacyMessageTimelineIndexes) {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS echo_messages_channel_author_created_idx
      ON echo_messages (channel_id, author_id, created_at DESC)
      WHERE deleted_at IS NULL;
    `);
  }
  if (config.echoDropLegacyMessageTimelineIndexes) {
    await pool.query(`DROP INDEX IF EXISTS echo_messages_channel_created`);
    await pool.query(
      `DROP INDEX IF EXISTS echo_messages_channel_author_created_idx`,
    );
  }
  if (config.echoCreateMessageAuthorIdIndex) {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS echo_messages_channel_author_id_idx
      ON echo_messages (channel_id, author_id, id)
      WHERE deleted_at IS NULL;
    `);
  }
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  } catch {
    /* Some hosts disallow CREATE EXTENSION for the app role */
  }
  try {
    await pool.query(`
      CREATE INDEX IF NOT EXISTS echo_messages_search_index_text_trgm_idx
      ON echo_messages USING gin (search_index_text gin_trgm_ops)
      WHERE deleted_at IS NULL AND search_index_text IS NOT NULL;
    `);
  } catch {
    /* pg_trgm missing or index creation not permitted */
  }
  try {
    await pool.query(`DROP INDEX IF EXISTS echo_messages_content_trgm_idx`);
  } catch {
    /* ignore */
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_category_permission_overrides (
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      category_name TEXT NOT NULL,
      permission_overrides JSONB NULL,
      PRIMARY KEY (server_id, category_name)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_voice_participants (
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL REFERENCES echo_channels(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (server_id, user_id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_voice_participants_channel_idx ON echo_voice_participants(server_id, channel_id);
  `);
  await pool.query(`
    ALTER TABLE echo_voice_participants
    ADD COLUMN IF NOT EXISTS has_published_camera BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await pool.query(`
    ALTER TABLE echo_voice_participants
    ADD COLUMN IF NOT EXISTS has_published_screen BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await pool.query(`
    ALTER TABLE echo_voice_participants
    ADD COLUMN IF NOT EXISTS server_muted BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await pool.query(`
    ALTER TABLE echo_voice_participants
    ADD COLUMN IF NOT EXISTS server_deafened BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await pool.query(`
    ALTER TABLE echo_voice_participants
    ADD COLUMN IF NOT EXISTS stage_speaker BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_stage_speak_requests (
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL REFERENCES echo_channels(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (server_id, channel_id, user_id)
    );
  `);
  await pool.query(`
    ALTER TABLE echo_channels
    ADD COLUMN IF NOT EXISTS voice_e2ee_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await pool.query(`
    ALTER TABLE echo_channels
    ALTER COLUMN voice_e2ee_enabled SET DEFAULT FALSE;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_voice_e2ee_epochs (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      channel_id TEXT NOT NULL REFERENCES echo_channels(id) ON DELETE CASCADE,
      room_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      superseded_at TIMESTAMPTZ NULL
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_voice_e2ee_epochs_channel_active_idx
    ON echo_voice_e2ee_epochs (server_id, channel_id)
    WHERE superseded_at IS NULL;
  `);
  await pool.query(`
    UPDATE echo_voice_e2ee_epochs older
    SET superseded_at = NOW()
    WHERE older.superseded_at IS NULL
      AND older.id NOT IN (
        SELECT DISTINCT ON (inner_e.server_id, inner_e.channel_id) inner_e.id
        FROM echo_voice_e2ee_epochs inner_e
        WHERE inner_e.superseded_at IS NULL
        ORDER BY inner_e.server_id, inner_e.channel_id, inner_e.created_at DESC
      );
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS echo_voice_e2ee_epochs_one_active_per_channel_idx
    ON echo_voice_e2ee_epochs (server_id, channel_id)
    WHERE superseded_at IS NULL;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_voice_e2ee_envelopes (
      epoch_id TEXT NOT NULL REFERENCES echo_voice_e2ee_epochs(id) ON DELETE CASCADE,
      recipient_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      recipient_device_id TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      envelope JSONB NULL,
      PRIMARY KEY (epoch_id, recipient_user_id, recipient_device_id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_voice_e2ee_envelopes_epoch_idx
    ON echo_voice_e2ee_envelopes (epoch_id);
  `);
  // ---- Voice E2EE v2: MLS (RFC 9420) delivery service ----
  // The server is a zero-knowledge delivery service: it stores opaque MLS
  // handshake messages and key packages (base64 TEXT) and enforces ordering and
  // single-commit-per-epoch. It never holds key material; the per-call media key
  // is derived locally by each member from the MLS exporter secret.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_mls_key_packages (
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL,
      key_package_ref TEXT NOT NULL,
      key_package TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      consumed_at TIMESTAMPTZ NULL,
      PRIMARY KEY (user_id, device_id, key_package_ref)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_mls_key_packages_unconsumed_idx
    ON echo_mls_key_packages (user_id, device_id)
    WHERE consumed_at IS NULL;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_mls_groups (
      server_id TEXT NOT NULL,
      channel_id TEXT NOT NULL REFERENCES echo_channels(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL,
      current_epoch BIGINT NOT NULL DEFAULT 0,
      group_info TEXT NULL,
      created_by_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (server_id, channel_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_mls_messages (
      seq BIGSERIAL PRIMARY KEY,
      server_id TEXT NOT NULL,
      channel_id TEXT NOT NULL REFERENCES echo_channels(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL,
      epoch BIGINT NOT NULL,
      msg_type TEXT NOT NULL CHECK (msg_type IN ('commit', 'proposal', 'welcome')),
      sender_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      sender_device_id TEXT NOT NULL,
      recipient_user_id TEXT NULL,
      recipient_device_id TEXT NULL,
      payload TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_mls_messages_channel_seq_idx
    ON echo_mls_messages (server_id, channel_id, seq);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_mls_messages_recipient_idx
    ON echo_mls_messages (server_id, channel_id, recipient_user_id, seq)
    WHERE recipient_user_id IS NOT NULL;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_vc_activity_opens (
      activity_key TEXT PRIMARY KEY,
      open_count BIGINT NOT NULL DEFAULT 0,
      last_open_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_vc_activity_opens_popularity_idx
    ON echo_vc_activity_opens (open_count DESC, activity_key ASC);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_server_emoji_packs (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('market', 'custom')),
      market_pack_id TEXT NULL,
      position INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS echo_server_emoji_packs_market_unique
    ON echo_server_emoji_packs (server_id, market_pack_id)
    WHERE market_pack_id IS NOT NULL;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_server_emoji_packs_server_idx ON echo_server_emoji_packs(server_id);
  `);
  await pool.query(`
    ALTER TABLE echo_server_emoji_packs ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE echo_server_emoji_packs ADD COLUMN IF NOT EXISTS listed_in_market BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE echo_server_emoji_packs ADD COLUMN IF NOT EXISTS market_settings JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_server_custom_emojis (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      pack_id TEXT NOT NULL REFERENCES echo_server_emoji_packs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      animated BOOLEAN NOT NULL DEFAULT false,
      image_url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS echo_server_custom_emojis_server_name_lower
    ON echo_server_custom_emojis (server_id, LOWER(name));
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_server_custom_emojis_pack_idx ON echo_server_custom_emojis(pack_id);
  `);
  /** Messages/reactions from Discord still reference the original emoji snowflake; import assigns Echo ids. */
  await pool.query(`
    ALTER TABLE echo_server_custom_emojis
      ADD COLUMN IF NOT EXISTS discord_source_emoji_id TEXT NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_server_custom_emojis
      ADD COLUMN IF NOT EXISTS expression_kind TEXT NOT NULL DEFAULT 'emoji';
  `);
  await pool.query(`
    ALTER TABLE echo_server_custom_emojis
      ADD COLUMN IF NOT EXISTS sticker_format TEXT NULL;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_server_custom_emojis_expression_kind_idx
    ON echo_server_custom_emojis (server_id, expression_kind);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS echo_server_custom_emojis_server_discord_emoji_unique
    ON echo_server_custom_emojis (server_id, discord_source_emoji_id)
    WHERE discord_source_emoji_id IS NOT NULL;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_server_emoji_usage (
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      emoji_id TEXT NOT NULL REFERENCES echo_server_custom_emojis(id) ON DELETE CASCADE,
      use_count BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (server_id, emoji_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_discord_import_states (
      server_id TEXT PRIMARY KEY REFERENCES echo_servers(id) ON DELETE CASCADE,
      source_dir TEXT NOT NULL DEFAULT '',
      discord_guild_id TEXT NULL,
      metadata_imported_at TIMESTAMPTZ NULL,
      roles_imported_at TIMESTAMPTZ NULL,
      channels_imported_at TIMESTAMPTZ NULL,
      role_id_map JSONB NOT NULL DEFAULT '{}'::jsonb,
      category_id_map JSONB NOT NULL DEFAULT '{}'::jsonb,
      channel_id_map JSONB NOT NULL DEFAULT '{}'::jsonb,
      warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
      last_error TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE echo_discord_import_states ADD COLUMN IF NOT EXISTS discord_guild_id TEXT NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_discord_import_states
      ADD COLUMN IF NOT EXISTS discord_to_echo_user_map JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);
  await pool.query(`
    ALTER TABLE echo_discord_import_states
      ADD COLUMN IF NOT EXISTS members_imported_at TIMESTAMPTZ NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_discord_import_states
      ADD COLUMN IF NOT EXISTS role_import_issues JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);
  /** Legacy imports completed before member sync: treat members step as done. */
  await pool.query(`
    UPDATE echo_discord_import_states
    SET members_imported_at = COALESCE(members_imported_at, channels_imported_at)
    WHERE channels_imported_at IS NOT NULL AND members_imported_at IS NULL;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_discord_import_user_daily (
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      day_utc DATE NOT NULL,
      metadata_starts INT NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day_utc)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_discord_import_user_daily_day_idx
    ON echo_discord_import_user_daily (day_utc);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_discord_bot_export_pending (
      echo_user_id TEXT NOT NULL,
      discord_guild_id TEXT NOT NULL,
      guild_name TEXT NOT NULL DEFAULT '',
      ready_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (echo_user_id, discord_guild_id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_discord_bot_export_pending_guild_idx
    ON echo_discord_bot_export_pending (discord_guild_id);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_discord_shadow_users (
      shadow_user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
      discord_user_id TEXT NOT NULL,
      source_server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (discord_user_id, source_server_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_discord_member_role_grants (
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      discord_user_id TEXT NOT NULL,
      role_id TEXT NOT NULL REFERENCES echo_roles(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (server_id, discord_user_id, role_id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_discord_member_role_grants_discord_idx
    ON echo_discord_member_role_grants (discord_user_id, server_id);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_discord_channel_message_imports (
      channel_id TEXT PRIMARY KEY REFERENCES echo_channels(id) ON DELETE CASCADE,
      discord_channel_id TEXT NOT NULL,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      message_count INT NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_status_daily (
      component_id TEXT NOT NULL,
      day_utc DATE NOT NULL,
      probe_total INT NOT NULL DEFAULT 0,
      probe_up INT NOT NULL DEFAULT 0,
      probe_degraded INT NOT NULL DEFAULT 0,
      latency_ms_sum BIGINT NOT NULL DEFAULT 0,
      latency_ms_max INT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (component_id, day_utc)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_status_latest (
      component_id TEXT PRIMARY KEY,
      probed_at TIMESTAMPTZ NOT NULL,
      ok BOOLEAN NOT NULL,
      degraded BOOLEAN NOT NULL DEFAULT FALSE,
      latency_ms INT
    );
  `);
  await runEchoSchemaMigrationOnce(
    pool,
    'everyone_role_default_permissions_v1',
    async () => {
      await pool.query(
        `UPDATE echo_roles SET permissions = $1::jsonb WHERE name = '@everyone'`,
        [everyonePermsJson],
      );
    },
  );
  await runEchoSchemaMigrationOnce(
    pool,
    'role_embed_links_backfill_v1',
    async () => {
      await pool.query(`
      UPDATE echo_roles
      SET permissions = permissions || '["EMBED_LINKS"]'::jsonb
      WHERE NOT (permissions @> '["EMBED_LINKS"]'::jsonb);
    `);
    },
  );
  await runEchoSchemaMigrationOnce(
    pool,
    'everyone_voice_reactions_backfill_v1',
    async () => {
      await pool.query(`
        UPDATE echo_roles
        SET permissions = permissions || '["ADD_REACTIONS"]'::jsonb
        WHERE name = '@everyone' AND NOT (permissions @> '["ADD_REACTIONS"]'::jsonb);
      `);
      await pool.query(`
        UPDATE echo_roles
        SET permissions = permissions || '["CONNECT"]'::jsonb
        WHERE name = '@everyone' AND NOT (permissions @> '["CONNECT"]'::jsonb);
      `);
      await pool.query(`
        UPDATE echo_roles
        SET permissions = permissions || '["STREAM"]'::jsonb
        WHERE name = '@everyone' AND NOT (permissions @> '["STREAM"]'::jsonb);
      `);
    },
  );
  await migrateEveryoneRoleHierarchyPositions(pool);
  await migrateEchoCategorySchema(pool);
  await migrateEchoChannelCategoryNullable(pool);
  await ensureEchoPermissionOverwriteTables(pool);
  await migrateEchoPermissionOverwriteRows(pool);
  await repairEchoVoiceChannelMigrationDamage(pool);
}

/** Per-target channel/category permission partials (everyone / role / member). */
async function ensureEchoPermissionOverwriteTables(
  pool: pg.Pool,
): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_channel_permission_overwrite_rows (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL REFERENCES echo_channels(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK (target_type IN ('everyone', 'role', 'member')),
      target_id TEXT NULL,
      partial JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_ch_ow_lookup
    ON echo_channel_permission_overwrite_rows (server_id, channel_id);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS echo_ch_ow_evr
    ON echo_channel_permission_overwrite_rows (server_id, channel_id)
    WHERE target_type = 'everyone';
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS echo_ch_ow_role
    ON echo_channel_permission_overwrite_rows (server_id, channel_id, target_id)
    WHERE target_type = 'role';
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS echo_ch_ow_mem
    ON echo_channel_permission_overwrite_rows (server_id, channel_id, target_id)
    WHERE target_type = 'member';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_category_permission_overwrite_rows (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES echo_categories(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK (target_type IN ('everyone', 'role', 'member')),
      target_id TEXT NULL,
      partial JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_cat_ow_lookup
    ON echo_category_permission_overwrite_rows (server_id, category_id);
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS echo_cat_ow_evr
    ON echo_category_permission_overwrite_rows (server_id, category_id)
    WHERE target_type = 'everyone';
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS echo_cat_ow_role
    ON echo_category_permission_overwrite_rows (server_id, category_id, target_id)
    WHERE target_type = 'role';
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS echo_cat_ow_mem
    ON echo_category_permission_overwrite_rows (server_id, category_id, target_id)
    WHERE target_type = 'member';
  `);
}

/** One-time: copy legacy JSONB blobs into everyone rows, then clear legacy columns. Idempotent. */
async function migrateEchoPermissionOverwriteRows(
  pool: pg.Pool,
): Promise<void> {
  const chRows = await pool.query(`
    SELECT ch.server_id, ch.id AS channel_id, ch.permission_overrides
    FROM echo_channels ch
    WHERE ch.permission_overrides IS NOT NULL
      AND jsonb_typeof(ch.permission_overrides) = 'object'
      AND NOT EXISTS (
        SELECT 1 FROM echo_channel_permission_overwrite_rows x WHERE x.channel_id = ch.id
      )
  `);
  for (const row of chRows.rows) {
    const normalized = normalizePermissionOverwritePartial(
      row.permission_overrides as Record<string, unknown>,
    );
    if (!normalized || Object.keys(normalized).length === 0) continue;
    await pool.query(
      `INSERT INTO echo_channel_permission_overwrite_rows (id, server_id, channel_id, target_type, target_id, partial)
       VALUES ($1, $2, $3, 'everyone', NULL, $4::jsonb)`,
      [
        nextEchoSnowflakeId(),
        String(row.server_id),
        String(row.channel_id),
        JSON.stringify(normalized),
      ],
    );
  }
  await pool.query(`
    UPDATE echo_channels SET permission_overrides = NULL
    WHERE permission_overrides IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM echo_channel_permission_overwrite_rows x WHERE x.channel_id = echo_channels.id
      )
  `);

  const catRows = await pool.query(`
    SELECT o.server_id, o.category_id, o.permission_overrides
    FROM echo_category_permission_overrides o
    WHERE o.permission_overrides IS NOT NULL
      AND jsonb_typeof(o.permission_overrides) = 'object'
      AND NOT EXISTS (
        SELECT 1 FROM echo_category_permission_overwrite_rows x WHERE x.category_id = o.category_id
      )
  `);
  for (const row of catRows.rows) {
    const normalized = normalizePermissionOverwritePartial(
      row.permission_overrides as Record<string, unknown>,
    );
    if (!normalized || Object.keys(normalized).length === 0) continue;
    await pool.query(
      `INSERT INTO echo_category_permission_overwrite_rows (id, server_id, category_id, target_type, target_id, partial)
       VALUES ($1, $2, $3, 'everyone', NULL, $4::jsonb)`,
      [
        nextEchoSnowflakeId(),
        String(row.server_id),
        String(row.category_id),
        JSON.stringify(normalized),
      ],
    );
  }
  await pool.query(`
    UPDATE echo_category_permission_overrides o SET permission_overrides = NULL
    WHERE o.permission_overrides IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM echo_category_permission_overwrite_rows x WHERE x.category_id = o.category_id
      )
  `);
}

/**
 * One-time evolution: string category_name -> echo_categories + category_id; overrides PK -> (server_id, category_id).
 * Idempotent.
 */
async function migrateEchoCategorySchema(pool: pg.Pool): Promise<void> {
  const chCol = await pool.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'echo_channels' AND column_name = 'category_name'
  `);
  const hasLegacyCategoryName = chCol.rows.length > 0;

  const pending = await pool.query(
    `SELECT 1 FROM echo_channels WHERE category_id IS NULL ${hasLegacyCategoryName ? '' : 'AND FALSE'} LIMIT 1`,
  );
  if (pending.rows.length > 0 && hasLegacyCategoryName) {
    const groups = await pool.query(
      `
      SELECT server_id,
        COALESCE(
          NULLIF(TRIM(category_name), ''),
          CASE WHEN type IN ('voice', 'stage') THEN 'Voice Channels' ELSE 'Text Channels' END
        ) AS norm_name,
        MIN(created_at) AS first_seen
      FROM echo_channels
      WHERE category_id IS NULL
      GROUP BY server_id,
        COALESCE(
          NULLIF(TRIM(category_name), ''),
          CASE WHEN type IN ('voice', 'stage') THEN 'Voice Channels' ELSE 'Text Channels' END
        )
      ORDER BY server_id, MIN(created_at) ASC
      `,
    );
    const nextPos = new Map<string, number>();
    for (const row of groups.rows) {
      const serverId = String(row.server_id);
      const normName = String(row.norm_name);
      const p = nextPos.get(serverId) ?? 0;
      nextPos.set(serverId, p + 1);
      const catId = nextEchoSnowflakeId();
      await pool.query(
        `INSERT INTO echo_categories (id, server_id, name, position) VALUES ($1, $2, $3, $4)`,
        [catId, serverId, normName, p],
      );
      await pool.query(
        `UPDATE echo_channels SET category_id = $1
         WHERE server_id = $2 AND category_id IS NULL
         AND COALESCE(
           NULLIF(TRIM(category_name), ''),
           CASE WHEN type IN ('voice', 'stage') THEN 'Voice Channels' ELSE 'Text Channels' END
         ) = $3`,
        [catId, serverId, normName],
      );
    }
  }

  if (hasLegacyCategoryName) {
    const nullCh = await pool.query(
      `SELECT DISTINCT server_id FROM echo_channels WHERE category_id IS NULL`,
    );
    for (const row of nullCh.rows) {
      const serverId = String(row.server_id);
      const pRow = await pool.query(
        `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM echo_categories WHERE server_id = $1`,
        [serverId],
      );
      const p = Number(pRow.rows[0]?.p ?? 0);
      const catId = nextEchoSnowflakeId();
      await pool.query(
        `INSERT INTO echo_categories (id, server_id, name, position) VALUES ($1, $2, $3, $4)`,
        [catId, serverId, 'Text Channels', p],
      );
      await pool.query(
        `UPDATE echo_channels SET category_id = $1 WHERE server_id = $2 AND category_id IS NULL`,
        [catId, serverId],
      );
    }
  }

  const ovCol = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'echo_category_permission_overrides' AND column_name = 'category_name'
  `);
  const overridesUseName = ovCol.rows.length > 0;

  if (overridesUseName) {
    await pool.query(`
      ALTER TABLE echo_category_permission_overrides
      ADD COLUMN IF NOT EXISTS category_id TEXT;
    `);
    const orphans = await pool.query(`
      SELECT DISTINCT o.server_id, o.category_name
      FROM echo_category_permission_overrides o
      WHERE o.category_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM echo_categories c
          WHERE c.server_id = o.server_id
            AND LOWER(TRIM(c.name)) = LOWER(TRIM(o.category_name))
        )
    `);
    const nextPos2 = new Map<string, number>();
    const maxPos = await pool.query(
      `SELECT server_id, COALESCE(MAX(position), -1) AS mx FROM echo_categories GROUP BY server_id`,
    );
    for (const r of maxPos.rows) {
      nextPos2.set(String(r.server_id), Number(r.mx) + 1);
    }
    for (const row of orphans.rows) {
      const serverId = String(row.server_id);
      const raw = row.category_name != null ? String(row.category_name) : '';
      const displayName = raw.trim() === '' ? 'Text Channels' : raw.trim();
      const p = nextPos2.get(serverId) ?? 0;
      nextPos2.set(serverId, p + 1);
      const catId = nextEchoSnowflakeId();
      await pool.query(
        `INSERT INTO echo_categories (id, server_id, name, position) VALUES ($1, $2, $3, $4)`,
        [catId, serverId, displayName, p],
      );
    }

    await pool.query(`
      UPDATE echo_category_permission_overrides o
      SET category_id = c.id
      FROM echo_categories c
      WHERE o.category_id IS NULL
        AND o.server_id = c.server_id
        AND LOWER(TRIM(COALESCE(NULLIF(TRIM(o.category_name), ''), 'Text Channels'))) = LOWER(TRIM(c.name))
    `);

    await pool.query(
      `DELETE FROM echo_category_permission_overrides WHERE category_id IS NULL`,
    );

    await pool.query(`
      ALTER TABLE echo_category_permission_overrides
      DROP CONSTRAINT IF EXISTS echo_category_permission_overrides_pkey
    `);
    await pool.query(`
      ALTER TABLE echo_category_permission_overrides
      DROP COLUMN IF EXISTS category_name
    `);
    await pool.query(
      `ALTER TABLE echo_category_permission_overrides ALTER COLUMN category_id SET NOT NULL`,
    );
    await pool.query(`
      ALTER TABLE echo_category_permission_overrides
      ADD PRIMARY KEY (server_id, category_id)
    `);
    await pool.query(
      `ALTER TABLE echo_category_permission_overrides DROP CONSTRAINT IF EXISTS echo_category_perm_cat_fk`,
    );
    await pool.query(`
      ALTER TABLE echo_category_permission_overrides
      ADD CONSTRAINT echo_category_perm_cat_fk
      FOREIGN KEY (category_id) REFERENCES echo_categories(id) ON DELETE CASCADE
    `);
  } else {
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE echo_category_permission_overrides
        ADD CONSTRAINT echo_category_perm_cat_fk
        FOREIGN KEY (category_id) REFERENCES echo_categories(id) ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);
  }

  if (hasLegacyCategoryName) {
    await pool.query(
      `ALTER TABLE echo_channels ALTER COLUMN category_id SET NOT NULL`,
    );
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE echo_channels
        ADD CONSTRAINT echo_channels_category_fk
        FOREIGN KEY (category_id) REFERENCES echo_categories(id) ON DELETE RESTRICT;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);
    await pool.query(
      `ALTER TABLE echo_channels DROP COLUMN IF EXISTS category_name`,
    );
  } else {
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE echo_channels
        ADD CONSTRAINT echo_channels_category_fk
        FOREIGN KEY (category_id) REFERENCES echo_categories(id) ON DELETE RESTRICT;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_upload_dedupe (
      sha256_hex CHAR(64) PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
      phash_hex CHAR(16) NOT NULL,
      byte_length BIGINT NOT NULL,
      public_url TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      uploader_id TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE echo_upload_dedupe ADD COLUMN uploader_id TEXT NOT NULL DEFAULT '';
    EXCEPTION WHEN duplicate_column THEN NULL; END $$
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_upload_dedupe_kind_created
    ON echo_upload_dedupe (kind, created_at DESC);
  `);

  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE echo_video_optimize_queue RENAME TO echo_video_hls_queue;
    EXCEPTION WHEN undefined_table THEN NULL;
             WHEN duplicate_table THEN NULL; END $$
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_video_hls_queue (
      id BIGSERIAL PRIMARY KEY,
      storage_key TEXT NOT NULL UNIQUE,
      public_url TEXT NOT NULL,
      source_content_type TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'done', 'failed')),
      attempts INT NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE echo_video_hls_queue
      ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_video_hls_pending
    ON echo_video_hls_queue (status, id)
    WHERE status = 'pending';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_video_playback (
      source_storage_key TEXT PRIMARY KEY,
      manifest_storage_key TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
      source_size BIGINT NOT NULL DEFAULT 0,
      source_etag TEXT,
      renditions JSONB,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_video_playback_status
    ON echo_video_playback (status, updated_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_discord_import_media_mirror_queue (
      message_id TEXT PRIMARY KEY REFERENCES echo_messages(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL REFERENCES echo_channels(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'done', 'failed')),
      attempts INT NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE echo_discord_import_media_mirror_queue
      ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_discord_import_media_mirror_pending
    ON echo_discord_import_media_mirror_queue (status, message_id)
    WHERE status = 'pending';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_upload_served_content_type (
      storage_key TEXT PRIMARY KEY,
      content_type TEXT NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_chat_upload_retention (
      storage_key TEXT PRIMARY KEY,
      uploader_id TEXT NULL,
      source_type TEXT NOT NULL CHECK (source_type IN ('user', 'webhook', 'import')),
      byte_length BIGINT NOT NULL,
      plan_snapshot TEXT NOT NULL CHECK (plan_snapshot IN ('free', 'plus', 'black')),
      permanent BOOLEAN NOT NULL DEFAULT false,
      permanent_revoked_at TIMESTAMPTZ NULL,
      timer_paused BOOLEAN NOT NULL DEFAULT false,
      abandon_ms BIGINT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NULL,
      expires_at TIMESTAMPTZ NULL,
      purge_status TEXT NOT NULL DEFAULT 'active'
        CHECK (purge_status IN ('active', 'purging', 'purged', 'failed')),
      purged_at TIMESTAMPTZ NULL,
      purge_error TEXT NULL,
      purge_attempts INT NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_chat_upload_retention_expires_active
    ON echo_chat_upload_retention (expires_at)
    WHERE purge_status = 'active' AND expires_at IS NOT NULL;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_chat_upload_retention_black_paused
    ON echo_chat_upload_retention (uploader_id)
    WHERE timer_paused = true AND purge_status = 'active';
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_chat_upload_retention_purge_claim
    ON echo_chat_upload_retention (purge_status, expires_at)
    WHERE purge_status IN ('active', 'failed');
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_discord_channel_bridges (
      channel_id TEXT PRIMARY KEY REFERENCES echo_channels(id) ON DELETE CASCADE,
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      discord_guild_id TEXT NULL,
      discord_channel_id TEXT NOT NULL,
      inbound_enabled BOOLEAN NOT NULL DEFAULT false,
      outbound_enabled BOOLEAN NOT NULL DEFAULT false,
      discord_webhook_url TEXT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    ALTER TABLE echo_discord_channel_bridges
      ADD COLUMN IF NOT EXISTS discord_guild_id TEXT NULL;
  `);
  await pool.query(`
    UPDATE echo_discord_channel_bridges b
    SET discord_guild_id = s.discord_guild_id
    FROM echo_discord_import_states s
    WHERE b.server_id = s.server_id
      AND (b.discord_guild_id IS NULL OR BTRIM(b.discord_guild_id) = '')
      AND s.discord_guild_id IS NOT NULL
      AND BTRIM(s.discord_guild_id) <> '';
  `);
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE echo_discord_channel_bridges
      ADD CONSTRAINT echo_discord_channel_bridges_active_pair_required
      CHECK (
        (inbound_enabled = false AND outbound_enabled = false)
        OR (
          NULLIF(BTRIM(discord_guild_id), '') IS NOT NULL
          AND NULLIF(BTRIM(discord_channel_id), '') IS NOT NULL
        )
      ) NOT VALID;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_discord_channel_bridges_server_idx
    ON echo_discord_channel_bridges(server_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_discord_channel_bridges_discord_ch_idx
    ON echo_discord_channel_bridges(discord_channel_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_discord_channel_bridges_discord_guild_idx
    ON echo_discord_channel_bridges(discord_guild_id);
  `);
  await pool.query(`
    WITH ranked AS (
      SELECT
        channel_id,
        ROW_NUMBER() OVER (
          PARTITION BY
            NULLIF(BTRIM(discord_guild_id), ''),
            NULLIF(BTRIM(discord_channel_id), '')
          ORDER BY updated_at DESC, channel_id DESC
        ) AS rn
      FROM echo_discord_channel_bridges
      WHERE (inbound_enabled = true OR outbound_enabled = true)
        AND NULLIF(BTRIM(discord_guild_id), '') IS NOT NULL
        AND NULLIF(BTRIM(discord_channel_id), '') IS NOT NULL
    )
    UPDATE echo_discord_channel_bridges b
    SET inbound_enabled = false,
        outbound_enabled = false,
        updated_at = NOW()
    FROM ranked r
    WHERE b.channel_id = r.channel_id
      AND r.rn > 1;
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS echo_discord_channel_bridges_active_pair_unique
    ON echo_discord_channel_bridges (
      NULLIF(BTRIM(discord_guild_id), ''),
      NULLIF(BTRIM(discord_channel_id), '')
    )
    WHERE (inbound_enabled = true OR outbound_enabled = true)
      AND NULLIF(BTRIM(discord_guild_id), '') IS NOT NULL
      AND NULLIF(BTRIM(discord_channel_id), '') IS NOT NULL;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_discord_bridge_ingested (
      discord_channel_id TEXT NOT NULL,
      discord_message_id TEXT NOT NULL,
      ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (discord_channel_id, discord_message_id)
    );
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS bridge_source TEXT NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS system_message BOOLEAN NOT NULL DEFAULT false;
  `);

  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS discord_voice_mirror_only BOOLEAN NOT NULL DEFAULT false;
  `);

  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS paper_comments_enabled BOOLEAN NOT NULL DEFAULT true;
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS paper_show_author_gutter BOOLEAN NOT NULL DEFAULT true;
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS paper_share_visibility TEXT NOT NULL DEFAULT 'server';
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD COLUMN IF NOT EXISTS paper_share_token TEXT NULL UNIQUE;
  `);
  await pool.query(`
    ALTER TABLE echo_channels DROP CONSTRAINT IF EXISTS echo_channels_paper_share_visibility_check;
  `);
  await pool.query(`
    ALTER TABLE echo_channels ADD CONSTRAINT echo_channels_paper_share_visibility_check
      CHECK (paper_share_visibility IN ('server', 'private', 'global'));
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_paper_documents (
      channel_id TEXT PRIMARY KEY REFERENCES echo_channels(id) ON DELETE CASCADE,
      content_json JSONB NOT NULL,
      content_schema_version INT NOT NULL DEFAULT 1,
      revision BIGINT NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by_user_id TEXT NULL REFERENCES auth_users(id) ON DELETE SET NULL
    );
  `);
  await pool.query(`
    ALTER TABLE echo_paper_documents DROP COLUMN IF EXISTS yjs_state;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_paper_comments (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES echo_channels(id) ON DELETE CASCADE,
      anchor_block_id TEXT NOT NULL,
      anchor_from INT NULL,
      anchor_to INT NULL,
      anchor_quote TEXT NOT NULL DEFAULT '',
      author_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      parent_comment_id TEXT NULL REFERENCES echo_paper_comments(id) ON DELETE CASCADE,
      resolved_at TIMESTAMPTZ NULL,
      resolved_by_user_id TEXT NULL REFERENCES auth_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_paper_comments_channel_anchor_idx
    ON echo_paper_comments (channel_id, anchor_block_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_discord_voice_mirror_category (
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES echo_categories(id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT false,
      discord_category_id TEXT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (server_id, category_id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_discord_voice_mirror_category_server_idx
    ON echo_discord_voice_mirror_category(server_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_discord_voice_mirror_voice_channel (
      channel_id TEXT PRIMARY KEY REFERENCES echo_channels(id) ON DELETE CASCADE,
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_discord_voice_mirror_vc_server_idx
    ON echo_discord_voice_mirror_voice_channel(server_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_discord_voice_mirror_map (
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      discord_channel_id TEXT NOT NULL,
      echo_channel_id TEXT NOT NULL REFERENCES echo_channels(id) ON DELETE CASCADE,
      spawned BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (server_id, discord_channel_id),
      UNIQUE (echo_channel_id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_discord_voice_mirror_map_server_idx
    ON echo_discord_voice_mirror_map(server_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_discord_voice_roster (
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      discord_channel_id TEXT NOT NULL,
      discord_user_id TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      global_name TEXT NULL,
      avatar TEXT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (server_id, discord_channel_id, discord_user_id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_discord_voice_roster_server_idx
    ON echo_discord_voice_roster(server_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_server_events (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      timezone_label TEXT NULL,
      channel_id TEXT NULL REFERENCES echo_channels(id) ON DELETE SET NULL,
      creator_user_id TEXT NULL REFERENCES auth_users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      max_attendees INT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT echo_server_events_status_chk
        CHECK (status IN ('scheduled', 'cancelled')),
      CONSTRAINT echo_server_events_time_chk CHECK (ends_at > starts_at)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_server_events_server_starts_idx
    ON echo_server_events(server_id, starts_at ASC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_server_events_upcoming_idx
    ON echo_server_events(server_id, starts_at)
    WHERE status = 'scheduled';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_server_event_rsvps (
      event_id TEXT NOT NULL REFERENCES echo_server_events(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (event_id, user_id),
      CONSTRAINT echo_server_event_rsvps_status_chk
        CHECK (status IN ('going', 'declined'))
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_server_event_rsvps_user_idx
    ON echo_server_event_rsvps(user_id);
  `);

  await pool.query(`
    ALTER TABLE echo_server_events
    ADD COLUMN IF NOT EXISTS custom_location TEXT NULL;
  `);

  await pool.query(`
    ALTER TABLE echo_server_events
    ADD COLUMN IF NOT EXISTS discord_scheduled_event_id TEXT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_server_banned_words_config (
      server_id TEXT PRIMARY KEY REFERENCES echo_servers(id) ON DELETE CASCADE,
      preset_level TEXT NOT NULL DEFAULT 'off',
      categories JSONB NOT NULL DEFAULT '{}'::jsonb,
      custom_words JSONB NOT NULL DEFAULT '[]'::jsonb,
      exempt_role_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_channel_webhooks (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL REFERENCES echo_channels(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'Webhook',
      avatar_url TEXT NULL,
      token_hash TEXT NOT NULL,
      created_by_user_id TEXT NULL REFERENCES auth_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ NULL
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_channel_webhooks_channel_idx
    ON echo_channel_webhooks(channel_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS echo_channel_webhooks_server_idx
    ON echo_channel_webhooks(server_id);
  `);

  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS source_webhook_id TEXT NULL
      REFERENCES echo_channel_webhooks(id) ON DELETE SET NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS webhook_username TEXT NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS webhook_avatar_url TEXT NULL;
  `);

  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS tts BOOLEAN NOT NULL DEFAULT false;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS message_flags INT NULL;
  `);
  await pool.query(`
    ALTER TABLE echo_messages ADD COLUMN IF NOT EXISTS components JSONB NULL;
  `);

  await pool.query(`
    ALTER TABLE echo_role_categories ADD COLUMN IF NOT EXISTS self_assignable_defaults BOOLEAN NOT NULL DEFAULT false;
  `);

  // ─── Self-assignable roles channel ─────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_server_self_roles_config (
      server_id TEXT PRIMARY KEY REFERENCES echo_servers(id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT false,
      panel_channel_id TEXT NULL,
      custom_categories JSONB NOT NULL DEFAULT '[]'
    );
  `);

  // ─── Ticket system ───────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_server_ticket_config (
      server_id TEXT PRIMARY KEY REFERENCES echo_servers(id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT false,
      panel_channel_id TEXT NULL,
      ticket_category_id TEXT NULL,
      handler_role_ids TEXT[] NOT NULL DEFAULT '{}',
      log_channel_id TEXT NULL,
      form_fields JSONB NOT NULL DEFAULT '[]',
      max_open_per_user INT NOT NULL DEFAULT 3,
      greeting_message TEXT NOT NULL DEFAULT '',
      require_category BOOLEAN NOT NULL DEFAULT false,
      ticket_categories JSONB NOT NULL DEFAULT '[]'
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS echo_tickets (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES echo_servers(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL,
      author_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      category TEXT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      assigned_to TEXT NULL REFERENCES auth_users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ NULL,
      closed_by TEXT NULL REFERENCES auth_users(id) ON DELETE SET NULL
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_echo_tickets_server_id ON echo_tickets(server_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_echo_tickets_author_id ON echo_tickets(author_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_echo_tickets_channel_id ON echo_tickets(channel_id);
  `);

  /** System user: author_id for all channel-webhook-delivered messages (login disabled). */
  await pool.query(`
    INSERT INTO auth_users (id, username, display_name, pfp, password_hash, is_guest)
    SELECT 'echo_internal_webhook_actor_v1',
           'echo_internal_webhook_actor_v1',
           'Webhook',
           '',
           NULL,
           false
    WHERE NOT EXISTS (
      SELECT 1 FROM auth_users WHERE id = 'echo_internal_webhook_actor_v1'
    );
  `);

  /** System user: author_id for bridge sync and other Echo system notices. */
  await pool.query(`
    INSERT INTO auth_users (id, username, display_name, pfp, password_hash, is_guest)
    SELECT 'echo_internal_system_actor_v1',
           'echo_internal_system_actor_v1',
           'Echo',
           '',
           NULL,
           false
    WHERE NOT EXISTS (
      SELECT 1 FROM auth_users WHERE id = 'echo_internal_system_actor_v1'
    );
  `);

  await migrateEchoGlobalRoleCategories(pool);
  await runEchoSchemaMigrationOnce(
    pool,
    'consolidate_seeded_global_roles_v1',
    async () => {
      const { nextEchoSnowflakeId } = await import('../domain/echoSnowflake');
      const { ensureGlobalRoleCategoryForServer } =
        await import('../domain/echoStore/roleCategoryGlobals');
      const servers = await pool.query<{ id: string }>(
        `SELECT id FROM echo_servers`,
      );
      for (const row of servers.rows) {
        const serverId = String(row.id);
        const globalId = await ensureGlobalRoleCategoryForServer(
          pool,
          serverId,
        );
        const seeded = await pool.query<{ id: string; name: string }>(
          `
          SELECT id, name FROM echo_roles
          WHERE server_id = $1 AND role_category_id = $2 AND name IN ('Admin', 'Moderator')
          `,
          [serverId, globalId],
        );
        if (seeded.rows.length === 0) continue;

        let allRole = await pool.query<{ id: string }>(
          `SELECT id FROM echo_roles WHERE server_id = $1 AND name = 'All' LIMIT 1`,
          [serverId],
        );
        let allRoleId = allRole.rows[0]?.id;
        if (!allRoleId) {
          allRoleId = nextEchoSnowflakeId();
          await pool.query(
            `
            INSERT INTO echo_roles (
              id, server_id, name, color, position, hoist, permissions,
              role_category_id, rank_in_category, role_scope, sync_with_category_defaults
            ) VALUES ($1, $2, 'All', '#5865F2', 1, true, $3::jsonb, $4, 0, 'global', false)
            `,
            [allRoleId, serverId, JSON.stringify(['ADMINISTRATOR']), globalId],
          );
        }

        const legacyIds = seeded.rows.map((r) => String(r.id));
        for (const legacyId of legacyIds) {
          await pool.query(
            `
            INSERT INTO echo_member_roles (server_id, user_id, role_id)
            SELECT server_id, user_id, $3
            FROM echo_member_roles
            WHERE server_id = $1 AND role_id = $2
            ON CONFLICT DO NOTHING
            `,
            [serverId, legacyId, allRoleId],
          );
        }
        await pool.query(
          `DELETE FROM echo_member_roles WHERE server_id = $1 AND role_id = ANY($2::text[])`,
          [serverId, legacyIds],
        );
        await pool.query(
          `DELETE FROM echo_roles WHERE server_id = $1 AND id = ANY($2::text[])`,
          [serverId, legacyIds],
        );
      }
    },
  );

  // Undo mistaken consolidate migration for legacy servers: restore Admin/Moderator,
  // remove the replacement "All" role. New servers (created after consolidate) keep
  // the single seeded "All" role.
  await runEchoSchemaMigrationOnce(
    pool,
    'repair_consolidate_global_roles_undo_v1',
    async () => {
      const consolidated = await pool.query<{ applied_at: Date }>(
        `SELECT applied_at FROM echo_schema_migrations WHERE id = $1 LIMIT 1`,
        ['consolidate_seeded_global_roles_v1'],
      );
      if (consolidated.rows.length === 0) return;
      const consolidateAppliedAt = consolidated.rows[0]!.applied_at;

      const { nextEchoSnowflakeId } = await import('../domain/echoSnowflake');
      const { ensureGlobalRoleCategoryForServer } =
        await import('../domain/echoStore/roleCategoryGlobals');

      const MODERATOR_PERMISSIONS = JSON.stringify([
        'KICK_MEMBERS',
        'BAN_MEMBERS',
        'MODERATE_MEMBERS',
        'MANAGE_MESSAGES',
      ]);
      const ADMIN_PERMISSIONS = JSON.stringify(['ADMINISTRATOR']);

      const servers = await pool.query<{ id: string }>(
        `
        SELECT id FROM echo_servers
        WHERE created_at < $1
        `,
        [consolidateAppliedAt],
      );

      for (const row of servers.rows) {
        const serverId = String(row.id);
        const allRole = await pool.query<{ id: string }>(
          `SELECT id FROM echo_roles WHERE server_id = $1 AND name = 'All' LIMIT 1`,
          [serverId],
        );
        if (!allRole.rows[0]) continue;
        const allRoleId = String(allRole.rows[0].id);

        const existing = await pool.query<{ name: string }>(
          `
          SELECT name FROM echo_roles
          WHERE server_id = $1 AND name IN ('Admin', 'Moderator')
          `,
          [serverId],
        );
        const names = new Set(existing.rows.map((r) => String(r.name)));
        if (names.has('Admin') && names.has('Moderator')) continue;

        const globalId = await ensureGlobalRoleCategoryForServer(
          pool,
          serverId,
        );

        let adminRoleId: string | null = null;
        if (!names.has('Admin')) {
          adminRoleId = nextEchoSnowflakeId();
          await pool.query(
            `
            INSERT INTO echo_roles (
              id, server_id, name, color, position, hoist, permissions,
              role_category_id, rank_in_category, role_scope, sync_with_category_defaults
            ) VALUES ($1, $2, 'Admin', '#e74c3c', 2, true, $3::jsonb, $4, 1, 'global', false)
            `,
            [adminRoleId, serverId, ADMIN_PERMISSIONS, globalId],
          );
        } else {
          const adminRow = await pool.query<{ id: string }>(
            `SELECT id FROM echo_roles WHERE server_id = $1 AND name = 'Admin' LIMIT 1`,
            [serverId],
          );
          adminRoleId = adminRow.rows[0] ? String(adminRow.rows[0].id) : null;
        }

        if (!names.has('Moderator')) {
          const modRoleId = nextEchoSnowflakeId();
          await pool.query(
            `
            INSERT INTO echo_roles (
              id, server_id, name, color, position, hoist, permissions,
              role_category_id, rank_in_category, role_scope, sync_with_category_defaults
            ) VALUES ($1, $2, 'Moderator', '#2ecc71', 1, true, $3::jsonb, $4, 0, 'global', false)
            `,
            [modRoleId, serverId, MODERATOR_PERMISSIONS, globalId],
          );
        }

        if (adminRoleId) {
          await pool.query(
            `
            INSERT INTO echo_member_roles (server_id, user_id, role_id)
            SELECT server_id, user_id, $3
            FROM echo_member_roles
            WHERE server_id = $1 AND role_id = $2
            ON CONFLICT DO NOTHING
            `,
            [serverId, allRoleId, adminRoleId],
          );
        }

        await pool.query(
          `DELETE FROM echo_member_roles WHERE server_id = $1 AND role_id = $2`,
          [serverId, allRoleId],
        );
        await pool.query(
          `DELETE FROM echo_roles WHERE server_id = $1 AND id = $2`,
          [serverId, allRoleId],
        );
      }
    },
  );
}

/** One pinned Global Roles category per server; backfill uncategorized roles. */
async function migrateEchoGlobalRoleCategories(pool: pg.Pool): Promise<void> {
  const {
    ensureGlobalRoleCategoryForServer,
    backfillUncategorizedRolesToGlobalCategory,
  } = await import('../domain/echoStore/roleCategoryGlobals');
  const servers = await pool.query<{ id: string }>(
    `SELECT id FROM echo_servers`,
  );
  for (const row of servers.rows) {
    const serverId = String(row.id);
    const globalId = await ensureGlobalRoleCategoryForServer(pool, serverId);
    await backfillUncategorizedRolesToGlobalCategory(pool, serverId, globalId);
  }
  await pool.query(`
    UPDATE echo_roles SET role_scope = 'category'
    WHERE role_scope IS NULL OR TRIM(role_scope) = '';
  `);
}

/**
 * Allow channels with no category (compact “uncategorized” / root channels).
 * FK still applies when category_id is non-null.
 */
async function migrateEchoChannelCategoryNullable(
  pool: pg.Pool,
): Promise<void> {
  await pool.query(
    `ALTER TABLE echo_channels DROP CONSTRAINT IF EXISTS echo_channels_category_fk`,
  );
  await pool.query(
    `ALTER TABLE echo_channels ALTER COLUMN category_id DROP NOT NULL`,
  );
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE echo_channels
      ADD CONSTRAINT echo_channels_category_fk
      FOREIGN KEY (category_id) REFERENCES echo_categories(id) ON DELETE RESTRICT;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$
  `);
}

export async function ensureEchoTables(pool: pg.Pool): Promise<void> {
  if (!echoTablesEnsureInflight) {
    echoTablesEnsureInflight = runEnsureEchoTables(pool).catch((err) => {
      echoTablesEnsureInflight = null;
      throw err;
    });
  }
  await echoTablesEnsureInflight;
}
