import type { Pool } from 'pg';

/** Auth + refresh-token tables. Idempotent; must run before Echo DDL (FKs to auth_users). */
export async function ensureAuthTables(pool: Pool | null): Promise<void> {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      pfp TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'online',
      custom_status TEXT NOT NULL DEFAULT '',
      banner_image TEXT NOT NULL DEFAULT '',
      banner_color TEXT NOT NULL DEFAULT '',
      banner_refraction_enabled BOOLEAN NOT NULL DEFAULT false,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(
    `ALTER TABLE auth_users ALTER COLUMN status SET DEFAULT 'online';`,
  );
  await pool.query(
    `ALTER TABLE auth_users ALTER COLUMN password_hash DROP NOT NULL;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS custom_status TEXT NOT NULL DEFAULT '';`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS banner_image TEXT NOT NULL DEFAULT '';`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS banner_color TEXT NOT NULL DEFAULT '';`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS banner_refraction_enabled BOOLEAN NOT NULL DEFAULT false;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS banner_blur_enabled BOOLEAN NOT NULL DEFAULT false;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS banner_blackout_enabled BOOLEAN NOT NULL DEFAULT false;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS banner_position_y REAL NOT NULL DEFAULT 50;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS email TEXT;`,
  );
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS auth_users_email_lower_idx
    ON auth_users (LOWER(TRIM(email)))
    WHERE email IS NOT NULL AND TRIM(email) <> '';
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS auth_refresh_tokens_user_id_idx ON auth_refresh_tokens(user_id);
  `);
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT false;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS guest_minted_at TIMESTAMPTZ NULL;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS guest_suspended_until TIMESTAMPTZ NULL;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS guest_deleted_at TIMESTAMPTZ NULL;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS last_seen_ip TEXT NULL;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS guest_total_messages INT NOT NULL DEFAULT 0;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS guest_pending_email TEXT NULL;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ NULL;`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_email_verification_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      purpose TEXT NOT NULL DEFAULT 'signup',
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS auth_email_verification_tokens_user_purpose_active_idx
    ON auth_email_verification_tokens (user_id, purpose)
    WHERE consumed_at IS NULL;
  `);
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS phone_e164 TEXT NULL;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS pending_phone_e164 TEXT NULL;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ NULL;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS is_discord_shadow BOOLEAN NOT NULL DEFAULT false;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS echo_plan TEXT NOT NULL DEFAULT 'free';`,
  );
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'auth_users_echo_plan_chk'
      ) THEN
        ALTER TABLE auth_users
        ADD CONSTRAINT auth_users_echo_plan_chk
        CHECK (echo_plan IN ('free', 'plus', 'black'));
      END IF;
    END $$;
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS auth_users_phone_e164_idx
    ON auth_users (phone_e164)
    WHERE phone_e164 IS NOT NULL;
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS auth_users_pending_phone_e164_idx
    ON auth_users (pending_phone_e164)
    WHERE pending_phone_e164 IS NOT NULL;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_phone_otp_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      phone_e164 TEXT NOT NULL,
      code_hmac TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      attempt_count INT NOT NULL DEFAULT 0,
      max_attempts INT NOT NULL DEFAULT 5,
      consumed_at TIMESTAMPTZ NULL,
      invalidated_at TIMESTAMPTZ NULL,
      invalidation_reason TEXT NULL
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS auth_phone_otp_challenges_user_created_idx
    ON auth_phone_otp_challenges (user_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS auth_phone_otp_challenges_phone_created_idx
    ON auth_phone_otp_challenges (phone_e164, created_at DESC);
  `);
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS signup_ordinal INT NULL;`,
  );
  await pool.query(
    `CREATE SEQUENCE IF NOT EXISTS auth_full_account_signup_seq AS INTEGER START WITH 1 INCREMENT BY 1;`,
  );
  /**
   * One-time backfill: first registered (non-guest, non-shadow) accounts by creation time.
   * New accounts receive the next value from `auth_full_account_signup_seq` at signup.
   */
  await pool.query(`
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (
               ORDER BY created_at ASC NULLS LAST, id ASC
             ) AS rn
      FROM auth_users
      WHERE COALESCE(is_guest, false) = false
        AND COALESCE(is_discord_shadow, false) = false
    )
    UPDATE auth_users u
    SET signup_ordinal = ranked.rn
    FROM ranked
    WHERE ranked.id = u.id
      AND u.signup_ordinal IS NULL
  `);
  await pool.query(`
    SELECT setval(
      'auth_full_account_signup_seq',
      GREATEST(
        1,
        COALESCE((SELECT MAX(signup_ordinal) FROM auth_users), 0)
      )
    )
  `);
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS totp_secret_cipher TEXT NULL;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS totp_pending_secret_cipher TEXT NULL;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMPTZ NULL;`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_user_recovery_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      used_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS auth_user_recovery_codes_user_unused_idx
    ON auth_user_recovery_codes (user_id)
    WHERE used_at IS NULL;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_discord_user_links (
      user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
      discord_user_id TEXT NOT NULL,
      access_token_cipher TEXT NOT NULL,
      refresh_token_cipher TEXT NULL,
      token_expires_at TIMESTAMPTZ NULL,
      scope TEXT NOT NULL DEFAULT '',
      discord_normalized_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
      discord_raw_cache_jsonb JSONB NULL,
      merge_kind TEXT NOT NULL DEFAULT 'partial',
      merge_applied_at TIMESTAMPTZ NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT auth_discord_user_links_merge_kind_chk CHECK (merge_kind IN ('full', 'partial'))
    );
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS auth_discord_user_links_discord_user_id_idx
    ON auth_discord_user_links (discord_user_id);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_google_user_links (
      user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
      google_sub TEXT NOT NULL,
      access_token_cipher TEXT NOT NULL,
      refresh_token_cipher TEXT NULL,
      token_expires_at TIMESTAMPTZ NULL,
      scope TEXT NOT NULL DEFAULT '',
      google_normalized_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
      merge_kind TEXT NOT NULL DEFAULT 'partial',
      merge_applied_at TIMESTAMPTZ NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT auth_google_user_links_merge_kind_chk CHECK (merge_kind IN ('full', 'partial'))
    );
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS auth_google_user_links_google_sub_idx
    ON auth_google_user_links (google_sub);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS auth_password_reset_tokens_user_active_idx
    ON auth_password_reset_tokens (user_id)
    WHERE consumed_at IS NULL;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_login_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NULL REFERENCES auth_users(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      ip_digest TEXT NULL,
      ua_digest TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS auth_login_events_created_at_idx ON auth_login_events (created_at);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_hwid_account_registrations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      hwid_hash TEXT NOT NULL,
      ip TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT auth_hwid_reg_user_hwid_ip_unique UNIQUE (user_id, hwid_hash, ip)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS auth_hwid_reg_hwid_ip_idx
    ON auth_hwid_account_registrations (hwid_hash, ip);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_webauthn_credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      credential_id_b64 TEXT NOT NULL UNIQUE,
      public_key BYTEA NOT NULL,
      counter BIGINT NOT NULL DEFAULT 0,
      transports TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS auth_webauthn_credentials_user_id_idx ON auth_webauthn_credentials (user_id);
  `);
  await pool.query(
    `ALTER TABLE auth_webauthn_credentials ADD COLUMN IF NOT EXISTS label TEXT NOT NULL DEFAULT '';`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_desktop_oauth_handoffs (
      id TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS auth_desktop_oauth_handoffs_expires_idx
    ON auth_desktop_oauth_handoffs (expires_at)
    WHERE consumed_at IS NULL;
  `);
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS show_last_online BOOLEAN NOT NULL DEFAULT true;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS time_zone TEXT NULL;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS locale TEXT NULL;`,
  );
  await pool.query(
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS awarded_badges TEXT[] NOT NULL DEFAULT '{}';`,
  );
  await pool.query(`
    UPDATE auth_users
    SET awarded_badges = awarded_badges || ARRAY['bug_hunter']::TEXT[]
    WHERE username IN ('bb', 'lesbian', 'm4')
      AND NOT ('bug_hunter' = ANY(awarded_badges))
  `);
  await pool.query(`
    UPDATE auth_users
    SET awarded_badges = awarded_badges || ARRAY['og']::TEXT[]
    WHERE username IN ('m4', 'blawh')
      AND NOT ('og' = ANY(awarded_badges))
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_echo_plus_interest (
      user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
      tier TEXT NOT NULL DEFAULT 'any',
      billing_cycle TEXT NOT NULL DEFAULT 'monthly',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT auth_echo_plus_interest_tier_chk
        CHECK (tier IN ('plus', 'black', 'any')),
      CONSTRAINT auth_echo_plus_interest_billing_cycle_chk
        CHECK (billing_cycle IN ('monthly', 'yearly'))
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS auth_echo_plus_interest_created_idx
    ON auth_echo_plus_interest (created_at DESC);
  `);
  /**
   * One-time for existing deployments (run manually after deploy if you must not force re-verify):
   * UPDATE auth_users SET email_verified_at = created_at WHERE email_verified_at IS NULL AND email IS NOT NULL AND TRIM(email) <> '';
   */
}
