import bcrypt from 'bcrypt';
import { randomBytes, randomInt } from 'crypto';
import type pg from 'pg';
import * as authEmail from '../../email';
import { config } from '../../../config';
import { assertEchoAuthLocale } from '../../../../../shared/echoLocale';
import { isPostgresUndefinedColumnError } from '../../../db/pgErrors';
import { maskE164, normalizeInputToE164 } from '../../phoneE164';
import { smsOtpHmacHex, smsOtpVerifyTimingSafe } from '../../smsOtpHmac';
import { hashRefreshToken } from '../../token';
import { generateDefaultAvatarPfp } from '../../defaultAvatarPfp';
import { randomGuestPlaceholderDisplayName } from '../../guestDisplayNames';
import {
  generateRecoveryCodePlain,
  hashRecoveryCode,
  normalizeRecoveryCodeInput,
  recoveryCodeHashEquals,
} from '../../recoveryCodes';
import { decryptTotpSecret, encryptTotpSecret } from '../../totpCrypto';
import {
  buildTotpKeyUri,
  generateTotpSecretBase32,
  verifyTotpCode,
} from '../../totpVerify';
import { checkAndMarkTotpUsed } from '../../totpReplayCache';
import { nextEchoSnowflakeId } from '../../../domain/echoSnowflake';
import type {
  AuthUser,
  AuthRegisterBody,
  AuthUpgradeGuestBody,
} from '../../types';
import {
  MIN_PASSWORD_LENGTH,
  validateDisplayName,
  validateRegistrationEmail,
  validateRegistrationUsername,
} from '../../accountPolicy';
import type {
  AuthStore,
  UserStore,
  SessionStore,
  RefreshTokenHashClass,
  VerificationStore,
  AuditStore,
  WebAuthnStore,
  PasswordRecord,
  AuthProfilePatch,
  RefreshTokenRecord,
  PasswordResetConsumeResult,
} from '../types';
import { validateEchoStoredBrandingUrl } from '../../../services/storedMediaUrl';
import { publicBadgesFromAccount } from '../../../../../shared/echoAccountBadges';
import { normalizeEchoPlanId } from '../../../../../shared/echoPlanLimits';
import { normalizeUsername, makeHash } from '../helpers';

export class PostgresAuthStore implements AuthStore {
  constructor(private pool: pg.Pool) {}

  get store(): AuthStore {
    return this;
  }
  get mode(): 'postgres' {
    return 'postgres';
  }

  private mapUser(row: any): AuthUser {
    const emailCell =
      row.email != null && String(row.email).trim() !== ''
        ? String(row.email).trim().toLowerCase()
        : '';
    const hasEmail = Boolean(emailCell);
    const committedPhone =
      row.phone_e164 != null && String(row.phone_e164).trim() !== ''
        ? String(row.phone_e164).trim()
        : '';
    const pendingPhoneCell =
      row.pending_phone_e164 != null &&
      String(row.pending_phone_e164).trim() !== ''
        ? String(row.pending_phone_e164).trim()
        : '';
    const u: AuthUser = {
      id: String(row.id),
      username: String(row.username),
      displayName: String(row.display_name ?? ''),
      pfp: String(row.pfp ?? ''),
      status: (row.status as AuthUser['status']) ?? 'offline',
      customStatus: String(row.custom_status ?? ''),
      bio: String(row.bio ?? ''),
      bannerImage: String(row.banner_image ?? ''),
      bannerColor: String(row.banner_color ?? ''),
      bannerRefractionEnabled: Boolean(row.banner_refraction_enabled ?? false),
      bannerBlurEnabled: Boolean(row.banner_blur_enabled ?? false),
      bannerBlackoutEnabled: Boolean(row.banner_blackout_enabled ?? false),
      bannerPositionY:
        row.banner_position_y != null &&
        Number.isFinite(Number(row.banner_position_y))
          ? Math.max(0, Math.min(100, Number(row.banner_position_y)))
          : 50,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: row.updated_at
        ? new Date(row.updated_at).toISOString()
        : undefined,
      emailVerified: !hasEmail || row.email_verified_at != null,
      phoneVerified: !committedPhone || row.phone_verified_at != null,
    };
    if (emailCell) u.email = emailCell;
    if (committedPhone) u.phone = maskE164(committedPhone);
    if (pendingPhoneCell) u.pendingPhone = maskE164(pendingPhoneCell);
    if (row.is_guest !== undefined && row.is_guest !== null) {
      u.isGuest = Boolean(row.is_guest);
    }
    if (
      row.guest_pending_email != null &&
      String(row.guest_pending_email).trim() !== ''
    ) {
      u.guestPendingEmail = String(row.guest_pending_email)
        .trim()
        .toLowerCase();
    }
    if (row.guest_minted_at)
      u.guestMintedAt = new Date(row.guest_minted_at).toISOString();
    if (row.guest_suspended_until)
      u.guestSuspendedUntil = new Date(row.guest_suspended_until).toISOString();
    if (row.guest_deleted_at)
      u.guestDeletedAt = new Date(row.guest_deleted_at).toISOString();
    if (
      row.guest_total_messages != null &&
      row.guest_total_messages !== undefined
    ) {
      u.guestTotalMessages = Number(row.guest_total_messages);
    }
    if (row.is_discord_shadow !== undefined && row.is_discord_shadow !== null) {
      u.isDiscordShadow = Boolean(row.is_discord_shadow);
    }
    if (row.echo_plan != null && String(row.echo_plan).trim() !== '') {
      const plan = normalizeEchoPlanId(row.echo_plan);
      u.echoPlan = plan;
      u.hasActiveSubscription = plan === 'plus' || plan === 'black';
    }
    u.totpEnabled = Boolean(row.totp_enabled);
    if (row.show_last_online !== undefined && row.show_last_online !== null) {
      u.showLastOnline = Boolean(row.show_last_online);
    }
    if (row.time_zone != null && String(row.time_zone).trim()) {
      u.timeZone = String(row.time_zone).trim().slice(0, 64);
    }
    if (row.locale != null && String(row.locale).trim()) {
      u.locale = String(row.locale).trim().slice(0, 16);
    }
    const ordRaw = row.signup_ordinal;
    const signupOrdinal =
      ordRaw != null && ordRaw !== '' ? Number(ordRaw) : Number.NaN;
    const badgeFlags = publicBadgesFromAccount(
      Number.isFinite(signupOrdinal) ? signupOrdinal : null,
      {
        isGuest: u.isGuest,
        isDiscordShadow: u.isDiscordShadow,
      },
      u.echoPlan,
    );
    if (badgeFlags.length) u.badges = badgeFlags;
    return u;
  }

  private async assignSignupOrdinalForEligibleUser(
    userId: string,
  ): Promise<void> {
    await this.pool.query(
      `
      UPDATE auth_users
      SET signup_ordinal = nextval('auth_full_account_signup_seq')
      WHERE id = $1
        AND signup_ordinal IS NULL
        AND COALESCE(is_guest, false) = false
        AND COALESCE(is_discord_shadow, false) = false
      `,
      [userId],
    );
  }

  // --- UserStore ---

  async createUser(input: AuthRegisterBody): Promise<AuthUser> {
    const usernameResult = validateRegistrationUsername(input.username);
    if (!usernameResult.ok) throw new Error('INVALID_USERNAME');
    const username = usernameResult.normalizedUsername;
    const emailResult = validateRegistrationEmail(input.email);
    if (!emailResult.ok) throw new Error(emailResult.code);
    const emailNorm = emailResult.normalizedEmail;
    const dupEmail = await this.pool.query(
      `SELECT 1 FROM auth_users WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
      [emailNorm],
    );
    if (dupEmail?.rows?.length) throw new Error('EMAIL_IN_USE');
    const displayNameResult = validateDisplayName(input.displayName, username);
    if (!displayNameResult.ok) throw new Error('INVALID_DISPLAY_NAME');
    const displayName = displayNameResult.displayName;
    const pfp = generateDefaultAvatarPfp(displayName);
    const passwordHash = await makeHash(input.password);
    const id = nextEchoSnowflakeId();
    try {
      await this.pool.query(
        `
        INSERT INTO auth_users (id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled, banner_blur_enabled, banner_blackout_enabled, password_hash, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        `,
        [
          id,
          username,
          emailNorm,
          displayName,
          pfp,
          'online',
          '',
          '',
          '',
          false,
          false,
          false,
          passwordHash,
        ],
      );
    } catch (e: any) {
      if (e?.code === '23505') {
        const row = await this.pool.query(
          `SELECT username FROM auth_users WHERE LOWER(TRIM(email)) = $1 OR username = $2 LIMIT 1`,
          [emailNorm, username],
        );
        const u = row?.rows?.[0];
        if (u && String(u.username) === username)
          throw new Error('USERNAME_TAKEN');
        throw new Error('EMAIL_IN_USE');
      }
      throw e;
    }
    await this.assignSignupOrdinalForEligibleUser(String(id));
    const created = await this.getUserById(String(id));
    if (!created) throw new Error('CREATE_FAILED');
    return created;
  }

  async createOAuthUser(input: {
    username: string;
    email?: string;
    displayName?: string;
    emailVerifiedFromIdp: boolean;
  }): Promise<AuthUser> {
    const usernameResult = validateRegistrationUsername(input.username);
    if (!usernameResult.ok) throw new Error('INVALID_USERNAME');
    const username = usernameResult.normalizedUsername;
    const emailResult = input.email
      ? validateRegistrationEmail(input.email)
      : null;
    if (emailResult && !emailResult.ok) {
      throw new Error(emailResult.code);
    }
    const emailNorm = emailResult?.normalizedEmail ?? null;
    if (emailNorm) {
      const dupEmail = await this.pool.query(
        `SELECT 1 FROM auth_users WHERE LOWER(TRIM(email)) = $1 LIMIT 1`,
        [emailNorm],
      );
      if (dupEmail?.rows?.length) throw new Error('EMAIL_IN_USE');
    }
    const displayNameResult = validateDisplayName(input.displayName, username);
    const displayName = displayNameResult.ok
      ? displayNameResult.displayName
      : username;
    const pfp = generateDefaultAvatarPfp(displayName);
    const id = nextEchoSnowflakeId();
    try {
      await this.pool.query(
        `
        INSERT INTO auth_users (
          id, username, email, display_name, pfp, status, custom_status,
          banner_image, banner_color, banner_refraction_enabled, banner_blur_enabled, banner_blackout_enabled,
          password_hash, email_verified_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL, $13, NOW())
        `,
        [
          id,
          username,
          emailNorm,
          displayName,
          pfp,
          'online',
          '',
          '',
          '',
          false,
          false,
          false,
          input.emailVerifiedFromIdp ? new Date().toISOString() : null,
        ],
      );
    } catch (e: any) {
      if (e?.code === '23505') {
        const row = await this.pool.query(
          `SELECT username FROM auth_users WHERE (email IS NOT NULL AND LOWER(TRIM(email)) = $1) OR username = $2 LIMIT 1`,
          [emailNorm || '---', username],
        );
        const u = row?.rows?.[0];
        if (u && String(u.username) === username)
          throw new Error('USERNAME_TAKEN');
        if (emailNorm) throw new Error('EMAIL_IN_USE');
      }
      throw e;
    }
    await this.assignSignupOrdinalForEligibleUser(String(id));
    const created = await this.getUserById(String(id));
    if (!created) throw new Error('CREATE_FAILED');
    return created;
  }

  async getUserByUsername(username: string): Promise<PasswordRecord | null> {
    const norm = normalizeUsername(username);
    const sqlWithEmail = `
      SELECT id, username, email, display_name, pfp, status, custom_status, bio, banner_image, banner_color, banner_refraction_enabled,
        banner_blur_enabled, banner_blackout_enabled, banner_position_y,
        password_hash, created_at, updated_at, email_verified_at,
        phone_e164, pending_phone_e164, phone_verified_at,
        COALESCE(is_guest, false) AS is_guest,
        guest_minted_at, guest_suspended_until, guest_deleted_at,
        COALESCE(guest_total_messages, 0) AS guest_total_messages,
        guest_pending_email,
        COALESCE(totp_enabled, false) AS totp_enabled,
        COALESCE(is_discord_shadow, false) AS is_discord_shadow,
        COALESCE(NULLIF(TRIM(echo_plan), ''), 'free') AS echo_plan,
        time_zone,
        signup_ordinal
      FROM auth_users WHERE username = $1`;
    const sqlLegacy = `SELECT id, username, display_name, pfp, status, custom_status, bio, banner_image, banner_color, banner_refraction_enabled, banner_blur_enabled, banner_blackout_enabled, banner_position_y, password_hash, created_at, updated_at FROM auth_users WHERE username = $1`;

    let row: { rows: unknown[] };
    try {
      row = await this.pool.query(sqlWithEmail, [norm]);
    } catch (e) {
      if (
        !isPostgresUndefinedColumnError(e) ||
        !/\bemail\b/i.test(String((e as Error).message))
      )
        throw e;
      row = await this.pool.query(sqlLegacy, [norm]);
    }

    const r = row?.rows?.[0] as Record<string, unknown> | undefined;
    if (!r) return null;
    if (r.is_discord_shadow) return null; // Discord shadows cannot log in
    const mapped = this.mapUser(r);
    return {
      ...mapped,
      passwordHash: r.password_hash != null ? String(r.password_hash) : null,
      totpEnabled: mapped.totpEnabled,
    };
  }

  async getUserById(id: string): Promise<AuthUser | null> {
    const row = await this.pool.query(
      `
      SELECT id, username, email, display_name, pfp, status, custom_status, bio, banner_image, banner_color, banner_refraction_enabled,
        banner_blur_enabled, banner_blackout_enabled, banner_position_y,
        created_at, updated_at, email_verified_at,
        phone_e164, pending_phone_e164, phone_verified_at,
        COALESCE(is_guest, false) AS is_guest,
        guest_minted_at, guest_suspended_until, guest_deleted_at,
        COALESCE(guest_total_messages, 0) AS guest_total_messages,
        guest_pending_email,
        COALESCE(totp_enabled, false) AS totp_enabled,
        COALESCE(is_discord_shadow, false) AS is_discord_shadow,
        COALESCE(NULLIF(TRIM(echo_plan), ''), 'free') AS echo_plan,
        time_zone,
        signup_ordinal
      FROM auth_users WHERE id = $1
      `,
      [id],
    );
    const r = row?.rows?.[0];
    if (!r) return null;
    return this.mapUser(r);
  }

  async listUsers(): Promise<AuthUser[]> {
    const row = await this.pool.query(
      `
      SELECT id, username, email, display_name, pfp, status, custom_status, bio, banner_image, banner_color, banner_refraction_enabled,
        banner_blur_enabled, banner_blackout_enabled, banner_position_y,
        created_at, updated_at, email_verified_at,
        phone_e164, pending_phone_e164, phone_verified_at,
        COALESCE(is_guest, false) AS is_guest,
        guest_minted_at, guest_suspended_until, guest_deleted_at,
        COALESCE(guest_total_messages, 0) AS guest_total_messages,
        guest_pending_email,
        COALESCE(totp_enabled, false) AS totp_enabled,
        COALESCE(is_discord_shadow, false) AS is_discord_shadow,
        COALESCE(NULLIF(TRIM(echo_plan), ''), 'free') AS echo_plan,
        time_zone,
        signup_ordinal
      FROM auth_users
      ORDER BY created_at DESC
      `,
    );
    return row.rows.map((entry) => this.mapUser(entry));
  }

  async verifyPassword(
    user: PasswordRecord,
    password: string,
  ): Promise<boolean> {
    if (!user.passwordHash) return false;
    return bcrypt.compare(password, user.passwordHash);
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    if (newPassword.length < MIN_PASSWORD_LENGTH)
      throw new Error('WEAK_PASSWORD');
    const passwordHash = await makeHash(newPassword);
    await this.pool.query(
      `UPDATE auth_users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
      [userId, passwordHash],
    );
  }

  async updateUserProfile(
    userId: string,
    patch: AuthProfilePatch,
  ): Promise<AuthUser | null> {
    const values: any[] = [userId];
    const sets: string[] = [];
    if (patch.displayName !== undefined) {
      const displayNameResult = validateDisplayName(patch.displayName, '');
      if (!displayNameResult.ok) throw new Error('INVALID_DISPLAY_NAME');
      values.push(displayNameResult.displayName);
      sets.push(`display_name = $${values.length}`);
    }
    if (patch.username !== undefined) {
      const usernameResult = validateRegistrationUsername(patch.username);
      if (!usernameResult.ok) throw new Error('INVALID_USERNAME');

      const flags = await this.pool.query<{
        is_guest: boolean;
        is_discord_shadow: boolean;
      }>(
        `SELECT COALESCE(is_guest,false) AS is_guest,
                COALESCE(is_discord_shadow,false) AS is_discord_shadow
         FROM auth_users WHERE id = $1`,
        [userId],
      );
      const fu = flags.rows[0];
      if (fu) {
        if (fu.is_guest) throw new Error('USERNAME_GUEST_LOCKED');
        if (fu.is_discord_shadow) throw new Error('USERNAME_SHADOW_LOCKED');

        const normalized = usernameResult.normalizedUsername;
        const dup = await this.pool.query(
          `SELECT 1 FROM auth_users WHERE username = $1 AND id <> $2 LIMIT 1`,
          [normalized, userId],
        );
        if (dup?.rows?.length) throw new Error('USERNAME_TAKEN');

        values.push(normalized);
        sets.push(`username = $${values.length}`);
      }
    }
    if (patch.pfp !== undefined) {
      values.push(patch.pfp);
      sets.push(`pfp = $${values.length}`);
    }
    if (patch.status !== undefined) {
      values.push(patch.status);
      sets.push(`status = $${values.length}`);
    }
    if (patch.customStatus !== undefined) {
      values.push(patch.customStatus);
      sets.push(`custom_status = $${values.length}`);
    }
    if (patch.bio !== undefined) {
      const t = String(patch.bio).trim().slice(0, 280);
      values.push(t);
      sets.push(`bio = $${values.length}`);
    }
    if (patch.bannerImage !== undefined) {
      values.push(patch.bannerImage);
      sets.push(`banner_image = $${values.length}`);
    }
    if (patch.bannerColor !== undefined) {
      values.push(patch.bannerColor);
      sets.push(`banner_color = $${values.length}`);
    }
    if (patch.bannerRefractionEnabled !== undefined) {
      values.push(patch.bannerRefractionEnabled);
      sets.push(`banner_refraction_enabled = $${values.length}`);
    }
    if (patch.bannerBlurEnabled !== undefined) {
      values.push(patch.bannerBlurEnabled);
      sets.push(`banner_blur_enabled = $${values.length}`);
    }
    if (patch.bannerBlackoutEnabled !== undefined) {
      values.push(patch.bannerBlackoutEnabled);
      sets.push(`banner_blackout_enabled = $${values.length}`);
    }
    if (patch.bannerPositionY !== undefined) {
      const n = Number(patch.bannerPositionY);
      if (!Number.isFinite(n) || n < 0 || n > 100)
        throw new Error('INVALID_BANNER_POSITION');
      values.push(n);
      sets.push(`banner_position_y = $${values.length}`);
    }
    if (patch.showLastOnline !== undefined) {
      values.push(Boolean(patch.showLastOnline));
      sets.push(`show_last_online = $${values.length}`);
    }
    if (patch.timeZone !== undefined) {
      if (patch.timeZone === null || String(patch.timeZone).trim() === '') {
        values.push(null);
        sets.push(`time_zone = $${values.length}`);
      } else {
        const tz = String(patch.timeZone).trim().slice(0, 64);
        try {
          Intl.DateTimeFormat(undefined, { timeZone: tz }).format();
        } catch {
          throw new Error('INVALID_TIME_ZONE');
        }
        values.push(tz);
        sets.push(`time_zone = $${values.length}`);
      }
    }
    if (patch.locale !== undefined) {
      if (patch.locale === null || String(patch.locale).trim() === '') {
        values.push(null);
        sets.push(`locale = $${values.length}`);
      } else {
        const loc = assertEchoAuthLocale(patch.locale);
        values.push(loc);
        sets.push(`locale = $${values.length}`);
      }
    }
    if (patch.email !== undefined) {
      const emailResult = validateRegistrationEmail(patch.email);
      if (!emailResult.ok) throw new Error(emailResult.code);
      const norm = emailResult.normalizedEmail;
      const dup = await this.pool.query(
        `SELECT 1 FROM auth_users WHERE LOWER(TRIM(email)) = $1 AND id <> $2 LIMIT 1`,
        [norm, userId],
      );
      if (dup?.rows?.length) throw new Error('EMAIL_IN_USE');
      values.push(norm);
      sets.push(`email = $${values.length}`);
      sets.push(`email_verified_at = NULL`);
    }
    if (patch.phone !== undefined) {
      if (patch.phone === null || String(patch.phone).trim() === '') {
        sets.push(`pending_phone_e164 = NULL`);
      } else {
        const e164 = normalizeInputToE164(String(patch.phone));
        if (!e164) throw new Error('INVALID_PHONE');
        const dupCommitted = await this.pool.query(
          `SELECT 1 FROM auth_users WHERE phone_e164 = $1 AND id <> $2 LIMIT 1`,
          [e164, userId],
        );
        if (dupCommitted?.rows?.length) throw new Error('PHONE_IN_USE');
        const dupPending = await this.pool.query(
          `SELECT 1 FROM auth_users WHERE pending_phone_e164 = $1 AND id <> $2 LIMIT 1`,
          [e164, userId],
        );
        if (dupPending?.rows?.length) throw new Error('PHONE_IN_USE');
        values.push(e164);
        sets.push(`pending_phone_e164 = $${values.length}`);
      }
    }
    if (sets.length > 0) {
      sets.push(`updated_at = NOW()`);
      await this.pool.query(
        `UPDATE auth_users SET ${sets.join(', ')} WHERE id = $1`,
        values,
      );
    }
    return this.getUserById(userId);
  }

  async createGuestUser(): Promise<AuthUser | null> {
    const id = nextEchoSnowflakeId();
    const username = `guest_${id}`;
    const alias = randomGuestPlaceholderDisplayName();
    const displayName = alias;
    const pfp = generateDefaultAvatarPfp(alias);
    const passwordHash = await makeHash(randomBytes(48).toString('hex'));
    try {
      await this.pool.query(
        `
        INSERT INTO auth_users (
          id, username, email, display_name, pfp, status, custom_status, banner_image, banner_color, banner_refraction_enabled,
          banner_blur_enabled, banner_blackout_enabled,
          password_hash, is_guest, guest_minted_at, updated_at
        )
        VALUES ($1, $2, NULL, $3, $4, 'online', '', '', '', false, false, false, $5, true, NOW(), NOW())
        `,
        [id, username, displayName, pfp, passwordHash],
      );
    } catch (e: any) {
      if (e?.code === '23505') return null;
      throw e;
    }
    return this.getUserById(id);
  }

  async ensureGuestDisplayAliasIfEmpty(user: AuthUser): Promise<AuthUser> {
    if (!user.isGuest || user.guestDeletedAt) return user;
    if (user.displayName?.trim()) return user;
    const alias = randomGuestPlaceholderDisplayName();
    const next = await this.updateUserProfile(user.id, {
      displayName: alias,
      pfp: generateDefaultAvatarPfp(alias),
    });
    return next ?? user;
  }

  async setGuestPendingEmail(
    userId: string,
    email: string | null,
  ): Promise<void> {
    let cell: string | null = null;
    if (email != null && String(email).trim() !== '') {
      const emailResult = validateRegistrationEmail(email);
      if (emailResult.ok) cell = emailResult.normalizedEmail;
    }
    await this.pool.query(
      `UPDATE auth_users SET guest_pending_email = $2, updated_at = NOW()
       WHERE id = $1 AND COALESCE(is_guest, false) = true`,
      [userId, cell],
    );
  }

  async upgradeGuestAccount(
    userId: string,
    input: AuthUpgradeGuestBody,
  ): Promise<AuthUser> {
    const emailResult = validateRegistrationEmail(input.email);
    if (!emailResult.ok) throw new Error(emailResult.code);
    const emailNorm = emailResult.normalizedEmail;
    if (input.password.length < MIN_PASSWORD_LENGTH)
      throw new Error('WEAK_PASSWORD');
    const cur = await this.getUserById(userId);
    if (!cur?.isGuest) throw new Error('NOT_GUEST');
    const fromEmail =
      emailNorm.split('@')[0]?.replace(/[^a-z0-9_]/gi, '_') ?? '';
    const rawUsername = (
      input.username?.trim() ||
      fromEmail ||
      `user_${userId.slice(-6)}`
    ).slice(0, 32);
    const usernameResult = validateRegistrationUsername(
      rawUsername.replace(/^_+|_+$/g, '') || `user_${userId.slice(-8)}`,
    );
    if (!usernameResult.ok) throw new Error('INVALID_USERNAME');
    const username = usernameResult.normalizedUsername;
    const dupEmail = await this.pool.query(
      `SELECT 1 FROM auth_users WHERE LOWER(TRIM(email)) = $1 AND id <> $2 LIMIT 1`,
      [emailNorm, userId],
    );
    if (dupEmail?.rows?.length) throw new Error('EMAIL_IN_USE');
    const dupUser = await this.pool.query(
      `SELECT 1 FROM auth_users WHERE username = $1 AND id <> $2 LIMIT 1`,
      [username, userId],
    );
    if (dupUser?.rows?.length) throw new Error('USERNAME_TAKEN');
    const displayNameResult = validateDisplayName(
      input.displayName,
      cur.displayName?.trim() ? cur.displayName.trim() : username,
    );
    if (!displayNameResult.ok) throw new Error('INVALID_DISPLAY_NAME');
    const displayName = displayNameResult.displayName;
    const passwordHash = await makeHash(input.password);
    const pfpIn = input.pfp?.trim() ?? '';
    let newPfp: string;
    if (pfpIn) {
      const v = validateEchoStoredBrandingUrl(pfpIn);
      if (!v.ok) throw new Error('INVALID_BODY');
      newPfp = v.value;
    } else {
      newPfp = generateDefaultAvatarPfp(displayName);
    }
    const r = await this.pool.query(
      `
      UPDATE auth_users SET
        email = $2,
        username = $3,
        display_name = $4,
        pfp = $5,
        password_hash = $6,
        is_guest = false,
        guest_suspended_until = NULL,
        guest_pending_email = NULL,
        email_verified_at = NULL,
        updated_at = NOW()
      WHERE id = $1 AND COALESCE(is_guest, false) = true
      `,
      [userId, emailNorm, username, displayName, newPfp, passwordHash],
    );
    if (r.rowCount === 0) throw new Error('UPGRADE_FAILED');
    await this.assignSignupOrdinalForEligibleUser(userId);
    const next = await this.getUserById(userId);
    if (!next || next.isGuest) throw new Error('UPGRADE_FAILED');
    return next;
  }

  async incrementGuestMessageCount(userId: string): Promise<number | null> {
    const row = await this.pool.query(
      `
      UPDATE auth_users SET guest_total_messages = guest_total_messages + 1, updated_at = NOW()
      WHERE id = $1 AND COALESCE(is_guest, false) = true
      RETURNING guest_total_messages
      `,
      [userId],
    );
    const r = row.rows?.[0];
    return r ? Number(r.guest_total_messages) : null;
  }

  async deleteUserAccount(userId: string): Promise<boolean> {
    await this.revokeUserRefreshTokens(userId);
    const r = await this.pool.query(`DELETE FROM auth_users WHERE id = $1`, [
      userId,
    ]);
    return (r.rowCount ?? 0) > 0;
  }

  async findPasswordUserByEmail(email: string): Promise<PasswordRecord | null> {
    const norm = authEmail.normalizeEmail(email);
    if (!norm || !authEmail.isValidEmailFormat(email)) return null;
    const row = await this.pool.query(
      `
      SELECT id, username, email, display_name, pfp, status, custom_status, bio, banner_image, banner_color, banner_refraction_enabled,
        banner_blur_enabled, banner_blackout_enabled, banner_position_y,
        password_hash, created_at, updated_at, email_verified_at,
        phone_e164, pending_phone_e164, phone_verified_at,
        COALESCE(is_guest, false) AS is_guest,
        guest_minted_at, guest_suspended_until, guest_deleted_at,
        COALESCE(guest_total_messages, 0) AS guest_total_messages,
        guest_pending_email,
        COALESCE(totp_enabled, false) AS totp_enabled,
        COALESCE(is_discord_shadow, false) AS is_discord_shadow,
        time_zone,
        signup_ordinal
      FROM auth_users WHERE LOWER(TRIM(email)) = $1 LIMIT 1
      `,
      [norm],
    );
    const r = row?.rows?.[0] as Record<string, unknown> | undefined;
    if (!r) return null;
    if (r.is_discord_shadow) return null; // Discord shadows cannot log in
    const mapped = this.mapUser(r);
    return {
      ...mapped,
      passwordHash: r.password_hash != null ? String(r.password_hash) : null,
      totpEnabled: mapped.totpEnabled,
    };
  }

  // --- SessionStore ---

  async storeRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: string,
  ): Promise<RefreshTokenRecord> {
    const id = nextEchoSnowflakeId();
    await this.pool.query(
      `
      INSERT INTO auth_refresh_tokens (id, user_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4)
      `,
      [id, userId, tokenHash, expiresAt],
    );
    return {
      id,
      userId,
      tokenHash,
      expiresAt,
      createdAt: new Date().toISOString(),
    };
  }

  async classifyRefreshTokenHash(
    tokenHash: string,
  ): Promise<RefreshTokenHashClass> {
    const row = await this.pool.query(
      `SELECT revoked_at, expires_at FROM auth_refresh_tokens WHERE token_hash = $1 LIMIT 1`,
      [tokenHash],
    );
    const r = row?.rows?.[0] as
      | { revoked_at: Date | null; expires_at: Date }
      | undefined;
    if (!r) return 'missing';
    if (r.revoked_at != null) return 'revoked';
    if (new Date(r.expires_at).getTime() <= Date.now()) return 'expired';
    return 'active';
  }

  async findActiveRefreshToken(
    tokenHash: string,
  ): Promise<RefreshTokenRecord | null> {
    const row = await this.pool.query(
      `
      SELECT id, user_id, token_hash, expires_at, revoked_at, created_at
      FROM auth_refresh_tokens
      WHERE token_hash = $1
      `,
      [tokenHash],
    );
    const r = row?.rows?.[0];
    if (!r) return null;
    if (r.revoked_at) return null;
    if (new Date(r.expires_at).getTime() <= Date.now()) return null;
    return {
      id: String(r.id),
      userId: String(r.user_id),
      tokenHash: String(r.token_hash),
      expiresAt: new Date(r.expires_at).toISOString(),
      createdAt: new Date(r.created_at).toISOString(),
      ...(r.revoked_at
        ? { revokedAt: new Date(r.revoked_at).toISOString() }
        : {}),
    };
  }

  async findRefreshTokenById(
    tokenId: string,
  ): Promise<RefreshTokenRecord | null> {
    const row = await this.pool.query(
      `
      SELECT id, user_id, token_hash, expires_at, revoked_at, created_at
      FROM auth_refresh_tokens
      WHERE id = $1
      `,
      [tokenId],
    );
    const r = row?.rows?.[0];
    if (!r) return null;
    if (r.revoked_at) return null;
    if (new Date(r.expires_at).getTime() <= Date.now()) return null;
    return {
      id: String(r.id),
      userId: String(r.user_id),
      tokenHash: String(r.token_hash),
      expiresAt: new Date(r.expires_at).toISOString(),
      createdAt: new Date(r.created_at).toISOString(),
    };
  }

  async rotateRefreshTokenAtomic(params: {
    tokenHash: string;
    nextTokenHash: string;
    nextExpiresAt: string;
  }): Promise<
    | {
        ok: true;
        previousTokenId: string;
        next: RefreshTokenRecord;
      }
    | {
        ok: false;
        reason: 'missing_or_expired' | 'already_redeemed';
      }
  > {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existingRes = await client.query(
        `
        SELECT id, user_id, expires_at, revoked_at
        FROM auth_refresh_tokens
        WHERE token_hash = $1
        LIMIT 1
        FOR UPDATE
        `,
        [params.tokenHash],
      );
      const existing = existingRes.rows[0] as
        | {
            id: string;
            user_id: string;
            expires_at: Date;
            revoked_at: Date | null;
          }
        | undefined;
      if (!existing) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'missing_or_expired' };
      }
      if (existing.revoked_at) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'already_redeemed' };
      }
      if (new Date(existing.expires_at).getTime() <= Date.now()) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'missing_or_expired' };
      }

      const revokeRes = await client.query(
        `UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`,
        [existing.id],
      );
      if ((revokeRes.rowCount ?? 0) < 1) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'already_redeemed' };
      }

      const nextId = nextEchoSnowflakeId();
      const createdAtIso = new Date().toISOString();
      await client.query(
        `
        INSERT INTO auth_refresh_tokens (id, user_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4)
        `,
        [nextId, existing.user_id, params.nextTokenHash, params.nextExpiresAt],
      );
      await client.query('COMMIT');
      return {
        ok: true,
        previousTokenId: String(existing.id),
        next: {
          id: String(nextId),
          userId: String(existing.user_id),
          tokenHash: params.nextTokenHash,
          expiresAt: params.nextExpiresAt,
          createdAt: createdAtIso,
        },
      };
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }
  }

  async listActiveRefreshTokensByUser(
    userId: string,
  ): Promise<RefreshTokenRecord[]> {
    const row = await this.pool.query(
      `
      SELECT id, user_id, token_hash, expires_at, revoked_at, created_at
      FROM auth_refresh_tokens
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId],
    );
    const now = Date.now();
    return (row?.rows ?? [])
      .filter(
        (r: any) => !r.revoked_at && new Date(r.expires_at).getTime() > now,
      )
      .map((r: any) => ({
        id: String(r.id),
        userId: String(r.user_id),
        tokenHash: String(r.token_hash),
        expiresAt: new Date(r.expires_at).toISOString(),
        createdAt: new Date(r.created_at).toISOString(),
      }));
  }

  async revokeRefreshToken(tokenId: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`,
      [tokenId],
    );
  }

  async revokeUserRefreshTokens(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
  }

  // --- VerificationStore ---

  async createEmailVerificationToken(
    userId: string,
    purpose: 'signup',
    options?: { enforceResendCooldown?: boolean },
  ): Promise<{ plainToken: string }> {
    if (purpose !== 'signup') throw new Error('UNSUPPORTED_PURPOSE');
    const cooldownMs = config.echoEmailVerificationResendCooldownSeconds * 1000;
    const ttlMs = config.echoEmailVerificationTokenHours * 60 * 60 * 1000;
    if (options?.enforceResendCooldown) {
      const recent = await this.pool.query(
        `
        SELECT created_at FROM auth_email_verification_tokens
        WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL
        ORDER BY created_at DESC LIMIT 1
        `,
        [userId, purpose],
      );
      const row = recent?.rows?.[0];
      if (row?.created_at) {
        const age = Date.now() - new Date(row.created_at).getTime();
        if (age < cooldownMs) throw new Error('VERIFICATION_EMAIL_COOLDOWN');
      }
    }
    await this.pool.query(
      `DELETE FROM auth_email_verification_tokens WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
      [userId, purpose],
    );
    const plainToken = randomBytes(32).toString('base64url');
    const tokenHash = hashRefreshToken(plainToken);
    const tokenId = nextEchoSnowflakeId();
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    await this.pool.query(
      `
      INSERT INTO auth_email_verification_tokens (id, user_id, token_hash, purpose, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [tokenId, userId, tokenHash, purpose, expiresAt],
    );
    return { plainToken };
  }

  async consumeEmailVerificationToken(
    plainToken: string,
  ): Promise<{ userId: string } | null> {
    const trimmed = plainToken?.trim();
    if (!trimmed) return null;
    const tokenHash = hashRefreshToken(trimmed);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const sel = await client.query(
        `
        SELECT id, user_id FROM auth_email_verification_tokens
        WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > NOW()
        FOR UPDATE
        `,
        [tokenHash],
      );
      const r = sel?.rows?.[0];
      if (!r) {
        await client.query('ROLLBACK');
        return null;
      }
      await client.query(
        `UPDATE auth_email_verification_tokens SET consumed_at = NOW() WHERE id = $1`,
        [r.id],
      );
      await client.query(
        `UPDATE auth_users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [r.user_id],
      );
      await client.query('COMMIT');
      return { userId: String(r.user_id) };
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }
  }

  async issuePhoneOtpChallenge(
    userId: string,
    options?: { enforceResendCooldown?: boolean },
  ): Promise<{ plainCode: string; targetPhoneE164: string }> {
    const row = await this.pool.query(
      `SELECT pending_phone_e164 FROM auth_users WHERE id = $1`,
      [userId],
    );
    const pending = row?.rows?.[0]?.pending_phone_e164;
    const target =
      pending != null && String(pending).trim() !== ''
        ? String(pending).trim()
        : '';
    if (!target) throw new Error('NO_PENDING_PHONE');

    const cooldownMs = config.echoSmsOtpResendCooldownSeconds * 1000;
    if (options?.enforceResendCooldown) {
      const last = await this.pool.query(
        `SELECT created_at FROM auth_phone_otp_challenges WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [userId],
      );
      const cr = last?.rows?.[0]?.created_at;
      if (cr && Date.now() - new Date(cr).getTime() < cooldownMs) {
        throw new Error('SMS_OTP_COOLDOWN');
      }
    }

    await this.pool.query(
      `
      UPDATE auth_phone_otp_challenges
      SET invalidated_at = NOW(), invalidation_reason = 'superseded'
      WHERE user_id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL
      `,
      [userId],
    );

    const len = config.echoSmsOtpLength;
    let plainCode = '';
    for (let i = 0; i < len; i++) plainCode += String(randomInt(0, 10));
    const codeHmac = smsOtpHmacHex(userId, target, plainCode);
    const ttlMs = config.echoSmsOtpTtlMinutes * 60 * 1000;
    const challengeId = nextEchoSnowflakeId();
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    const maxAttempts = config.echoSmsOtpMaxAttempts;
    await this.pool.query(
      `
      INSERT INTO auth_phone_otp_challenges (id, user_id, phone_e164, code_hmac, expires_at, max_attempts)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [challengeId, userId, target, codeHmac, expiresAt, maxAttempts],
    );
    return { plainCode, targetPhoneE164: target };
  }

  async verifyPhoneOtpAndConsume(
    userId: string,
    plainCode: string,
  ): Promise<boolean> {
    const digits = String(plainCode ?? '').replace(/\D/g, '');
    if (!digits || digits.length !== config.echoSmsOtpLength) return false;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const sel = await client.query(
        `
        SELECT id, phone_e164, code_hmac, attempt_count, max_attempts, expires_at
        FROM auth_phone_otp_challenges
        WHERE user_id = $1 AND consumed_at IS NULL AND invalidated_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
        `,
        [userId],
      );
      const ch = sel?.rows?.[0];
      if (!ch) {
        await client.query('ROLLBACK');
        return false;
      }
      if (new Date(ch.expires_at).getTime() <= Date.now()) {
        await client.query(
          `UPDATE auth_phone_otp_challenges SET invalidated_at = NOW(), invalidation_reason = 'expired' WHERE id = $1`,
          [ch.id],
        );
        await client.query('COMMIT');
        return false;
      }
      if (Number(ch.attempt_count) >= Number(ch.max_attempts)) {
        await client.query('ROLLBACK');
        return false;
      }

      const userRow = await client.query(
        `SELECT pending_phone_e164 FROM auth_users WHERE id = $1 FOR UPDATE`,
        [userId],
      );
      const pending = userRow?.rows?.[0]?.pending_phone_e164;
      const pendingStr =
        pending != null && String(pending).trim() !== ''
          ? String(pending).trim()
          : '';
      if (!pendingStr || pendingStr !== String(ch.phone_e164)) {
        await client.query(
          `UPDATE auth_phone_otp_challenges SET invalidated_at = NOW(), invalidation_reason = 'phone_mismatch' WHERE id = $1`,
          [ch.id],
        );
        await client.query('COMMIT');
        return false;
      }

      const ok = smsOtpVerifyTimingSafe(
        String(ch.code_hmac),
        userId,
        pendingStr,
        digits,
      );
      if (ok) {
        await client.query(
          `UPDATE auth_phone_otp_challenges SET consumed_at = NOW() WHERE id = $1`,
          [ch.id],
        );
        await client.query(
          `
          UPDATE auth_users SET
            phone_e164 = pending_phone_e164,
            phone_verified_at = NOW(),
            pending_phone_e164 = NULL,
            updated_at = NOW()
          WHERE id = $1
          `,
          [userId],
        );
        await client.query('COMMIT');
        return true;
      }

      const newAttempts = Number(ch.attempt_count) + 1;
      await client.query(
        `UPDATE auth_phone_otp_challenges SET attempt_count = $2 WHERE id = $1`,
        [ch.id, newAttempts],
      );
      if (newAttempts >= Number(ch.max_attempts)) {
        await client.query(
          `UPDATE auth_phone_otp_challenges SET invalidated_at = NOW(), invalidation_reason = 'max_attempts_exceeded' WHERE id = $1`,
          [ch.id],
        );
      }
      await client.query('COMMIT');
      return false;
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }
  }

  async beginTotpEnrollment(
    userId: string,
  ): Promise<{ secretBase32: string; otpauthUrl: string }> {
    const u = await this.getUserById(userId);
    if (!u || u.isGuest) throw new Error('TOTP_NOT_ALLOWED');
    const pr = await this.pool.query(
      `SELECT COALESCE(totp_enabled, false) AS totp_enabled FROM auth_users WHERE id = $1`,
      [userId],
    );
    const row = pr.rows[0];
    if (!row) throw new Error('NOT_FOUND');
    if (Boolean(row.totp_enabled)) throw new Error('TOTP_ALREADY_ENABLED');

    const secretBase32 = generateTotpSecretBase32();
    const cipher = encryptTotpSecret(secretBase32);
    await this.pool.query(
      `UPDATE auth_users SET totp_pending_secret_cipher = $2, updated_at = NOW() WHERE id = $1`,
      [userId, cipher],
    );
    const label = (u.email?.trim() || u.username).trim();
    const otpauthUrl = buildTotpKeyUri({
      secretBase32,
      accountLabel: label,
      issuer: config.echoTotpIssuer,
    });
    return { secretBase32, otpauthUrl };
  }

  async confirmTotpEnrollment(
    userId: string,
    code: string,
  ): Promise<{ recoveryCodes: string[] }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const sel = await client.query(
        `
        SELECT totp_pending_secret_cipher, COALESCE(totp_enabled, false) AS totp_enabled
        FROM auth_users WHERE id = $1 FOR UPDATE
        `,
        [userId],
      );
      const r = sel.rows[0];
      if (!r) {
        await client.query('ROLLBACK');
        throw new Error('NOT_FOUND');
      }
      if (Boolean(r.totp_enabled)) {
        await client.query('ROLLBACK');
        throw new Error('TOTP_ALREADY_ENABLED');
      }
      const pending = r.totp_pending_secret_cipher;
      if (!pending) {
        await client.query('ROLLBACK');
        throw new Error('NO_PENDING_TOTP');
      }
      const secret = decryptTotpSecret(String(pending));
      if (!verifyTotpCode(secret, code) || checkAndMarkTotpUsed(userId, code)) {
        await client.query('ROLLBACK');
        throw new Error('INVALID_TOTP');
      }

      const n = config.echo2faRecoveryCodeCount;
      const plainCodes: string[] = [];
      const hashes: string[] = [];
      const pepper = config.echo2faRecoveryPepper;
      for (let i = 0; i < n; i++) {
        const p = generateRecoveryCodePlain();
        plainCodes.push(p);
        hashes.push(hashRecoveryCode(pepper, normalizeRecoveryCodeInput(p)));
      }

      await client.query(
        `
        UPDATE auth_users SET
          totp_secret_cipher = totp_pending_secret_cipher,
          totp_pending_secret_cipher = NULL,
          totp_enabled = true,
          totp_enabled_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
        `,
        [userId],
      );
      await client.query(
        `DELETE FROM auth_user_recovery_codes WHERE user_id = $1`,
        [userId],
      );
      for (const h of hashes) {
        const id = nextEchoSnowflakeId();
        await client.query(
          `INSERT INTO auth_user_recovery_codes (id, user_id, code_hash) VALUES ($1, $2, $3)`,
          [id, userId, h],
        );
      }
      await client.query('COMMIT');
      return { recoveryCodes: plainCodes };
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }
  }

  async disableTotp(
    userId: string,
    password: string,
    factor: { totpCode?: string; recoveryCode?: string },
  ): Promise<void> {
    const totp = factor.totpCode?.trim();
    const rec = factor.recoveryCode?.trim();
    if ((!totp && !rec) || (Boolean(totp) && Boolean(rec))) {
      throw new Error('INVALID_FACTOR');
    }

    const row = await this.pool.query(
      `SELECT password_hash, COALESCE(totp_enabled, false) AS totp_enabled FROM auth_users WHERE id = $1`,
      [userId],
    );
    const u = row.rows[0];
    if (!u) throw new Error('NOT_FOUND');
    if (!Boolean(u.totp_enabled)) throw new Error('TOTP_NOT_ENABLED');
    const pwOk =
      u.password_hash != null
        ? await bcrypt.compare(password, String(u.password_hash))
        : false;
    if (!pwOk) throw new Error('INVALID_PASSWORD');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const sel = await client.query(
        `SELECT totp_secret_cipher FROM auth_users WHERE id = $1 FOR UPDATE`,
        [userId],
      );
      const secRow = sel.rows[0];
      const cipher = secRow?.totp_secret_cipher;

      if (totp) {
        if (!cipher) {
          await client.query('ROLLBACK');
          throw new Error('TOTP_STATE');
        }
        const secret = decryptTotpSecret(String(cipher));
        if (
          !verifyTotpCode(secret, totp) ||
          checkAndMarkTotpUsed(userId, totp)
        ) {
          await client.query('ROLLBACK');
          throw new Error('INVALID_TOTP');
        }
      } else {
        const norm = normalizeRecoveryCodeInput(rec!);
        const codes = await client.query(
          `SELECT id, code_hash FROM auth_user_recovery_codes WHERE user_id = $1 AND used_at IS NULL FOR UPDATE`,
          [userId],
        );
        let hit: { id: string; code_hash: string } | null = null;
        for (const rr of codes.rows) {
          if (
            recoveryCodeHashEquals(
              String(rr.code_hash),
              config.echo2faRecoveryPepper,
              norm,
            )
          ) {
            hit = rr;
            break;
          }
        }
        if (!hit) {
          await client.query('ROLLBACK');
          throw new Error('INVALID_RECOVERY_CODE');
        }
        await client.query(
          `UPDATE auth_user_recovery_codes SET used_at = NOW() WHERE id = $1`,
          [hit.id],
        );
      }

      await client.query(
        `
        UPDATE auth_users SET
          totp_enabled = false,
          totp_secret_cipher = NULL,
          totp_pending_secret_cipher = NULL,
          totp_enabled_at = NULL,
          updated_at = NOW()
        WHERE id = $1
        `,
        [userId],
      );
      await client.query(
        `DELETE FROM auth_user_recovery_codes WHERE user_id = $1`,
        [userId],
      );
      await client.query('COMMIT');
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }
  }

  async verifyTotpForLogin(userId: string, code: string): Promise<boolean> {
    const row = await this.pool.query(
      `
      SELECT totp_secret_cipher, COALESCE(totp_enabled, false) AS totp_enabled
      FROM auth_users WHERE id = $1
      `,
      [userId],
    );
    const r = row.rows[0];
    if (!r || !Boolean(r.totp_enabled) || !r.totp_secret_cipher) return false;
    try {
      const secret = decryptTotpSecret(String(r.totp_secret_cipher));
      const isValid = verifyTotpCode(secret, code);
      if (isValid) {
        if (checkAndMarkTotpUsed(userId, code)) return false; // Block replay
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async consumeRecoveryCode(
    userId: string,
    plaintext: string,
  ): Promise<boolean> {
    const norm = normalizeRecoveryCodeInput(plaintext);
    if (norm.length < 8) return false;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const rows = await client.query(
        `
        SELECT id, code_hash FROM auth_user_recovery_codes
        WHERE user_id = $1 AND used_at IS NULL
        ORDER BY created_at ASC
        FOR UPDATE
        `,
        [userId],
      );
      for (const rr of rows.rows) {
        if (
          recoveryCodeHashEquals(
            String(rr.code_hash),
            config.echo2faRecoveryPepper,
            norm,
          )
        ) {
          await client.query(
            `UPDATE auth_user_recovery_codes SET used_at = NOW() WHERE id = $1`,
            [rr.id],
          );
          await client.query('COMMIT');
          return true;
        }
      }
      await client.query('ROLLBACK');
      return false;
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }
  }

  async createPasswordResetToken(
    userId: string,
  ): Promise<{ plainToken: string }> {
    const plainToken = randomBytes(32).toString('base64url');
    const tokenHash = hashRefreshToken(plainToken);
    const id = nextEchoSnowflakeId();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await this.pool.query(
      `DELETE FROM auth_password_reset_tokens WHERE user_id = $1 AND consumed_at IS NULL`,
      [userId],
    );
    await this.pool.query(
      `INSERT INTO auth_password_reset_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
      [id, userId, tokenHash, expiresAt],
    );
    return { plainToken };
  }

  async consumePasswordResetToken(
    plainToken: string,
    newPassword: string,
    options?: { totpCode?: string },
  ): Promise<PasswordResetConsumeResult> {
    if (newPassword.length < MIN_PASSWORD_LENGTH)
      return { ok: false, reason: 'weak_password' };
    const tokenHash = hashRefreshToken(plainToken);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tok = await client.query(
        `
        SELECT t.id, t.user_id, t.expires_at, t.consumed_at
        FROM auth_password_reset_tokens t
        WHERE t.token_hash = $1
        FOR UPDATE
        `,
        [tokenHash],
      );
      const tr = tok.rows[0] as
        | {
            id: string;
            user_id: string;
            expires_at: string;
            consumed_at: string | null;
          }
        | undefined;
      if (
        !tr ||
        tr.consumed_at != null ||
        new Date(tr.expires_at).getTime() <= Date.now()
      ) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'invalid' };
      }
      const userId = String(tr.user_id);
      const urow = await client.query(
        `SELECT COALESCE(totp_enabled, false) AS totp_enabled, totp_secret_cipher FROM auth_users WHERE id = $1 FOR UPDATE`,
        [userId],
      );
      const u = urow.rows[0] as
        | { totp_enabled: boolean; totp_secret_cipher: string | null }
        | undefined;
      if (!u) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'invalid' };
      }
      if (Boolean(u.totp_enabled)) {
        const code = options?.totpCode?.trim();
        if (!code) {
          await client.query('ROLLBACK');
          return { ok: false, reason: 'totp_required' };
        }
        let okTotp = false;
        try {
          if (u.totp_secret_cipher) {
            const secret = decryptTotpSecret(String(u.totp_secret_cipher));
            okTotp = verifyTotpCode(secret, code);
            if (okTotp && checkAndMarkTotpUsed(userId, code)) {
              okTotp = false;
            }
          }
        } catch {
          okTotp = false;
        }
        if (!okTotp) {
          await client.query('ROLLBACK');
          return { ok: false, reason: 'bad_totp' };
        }
      }
      const passwordHash = await makeHash(newPassword);
      await client.query(
        `UPDATE auth_users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
        [userId, passwordHash],
      );
      await client.query(
        `UPDATE auth_password_reset_tokens SET consumed_at = NOW() WHERE id = $1`,
        [tr.id],
      );
      await client.query(
        `UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );
      await client.query('COMMIT');
      return { ok: true, userId };
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }
  }

  // --- AuditStore ---

  async recordLoginEvent(row: {
    userId: string | null;
    eventType: string;
    ipDigest?: string;
    uaDigest?: string;
  }): Promise<void> {
    const id = nextEchoSnowflakeId();
    await this.pool.query(
      `INSERT INTO auth_login_events (id, user_id, event_type, ip_digest, ua_digest) VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        row.userId,
        row.eventType,
        row.ipDigest ?? null,
        row.uaDigest ?? null,
      ],
    );
  }

  async pruneLoginEvents(olderThanDays: number): Promise<number> {
    const r = await this.pool.query(
      `DELETE FROM auth_login_events WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')`,
      [olderThanDays],
    );
    return r.rowCount ?? 0;
  }

  // --- WebAuthnStore ---

  async listWebAuthnCredentialsForUser(
    userId: string,
  ): Promise<{ id: string; credentialIdB64: string; createdAt: string }[]> {
    const r = await this.pool.query(
      `SELECT id, credential_id_b64, created_at FROM auth_webauthn_credentials WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId],
    );
    return (
      r.rows as {
        id: string;
        credential_id_b64: string;
        created_at: Date;
      }[]
    ).map((x) => ({
      id: String(x.id),
      credentialIdB64: String(x.credential_id_b64),
      createdAt: new Date(x.created_at).toISOString(),
    }));
  }

  async saveWebAuthnCredential(
    userId: string,
    cred: {
      credentialIdB64: string;
      publicKey: Buffer;
      counter: number;
      transports?: string[];
    },
  ): Promise<void> {
    const id = nextEchoSnowflakeId();
    const transports = cred.transports?.length
      ? cred.transports.join(',')
      : null;
    await this.pool.query(
      `
      INSERT INTO auth_webauthn_credentials (id, user_id, credential_id_b64, public_key, counter, transports)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        id,
        userId,
        cred.credentialIdB64,
        cred.publicKey,
        cred.counter,
        transports,
      ],
    );
  }

  async findWebAuthnCredential(
    credentialIdB64: string,
  ): Promise<{ userId: string; publicKey: Buffer; counter: number } | null> {
    const r = await this.pool.query(
      `SELECT user_id, public_key, counter FROM auth_webauthn_credentials WHERE credential_id_b64 = $1`,
      [credentialIdB64],
    );
    const row = r.rows[0] as
      | { user_id: string; public_key: Buffer; counter: string }
      | undefined;
    if (!row) return null;
    return {
      userId: String(row.user_id),
      publicKey: Buffer.isBuffer(row.public_key)
        ? row.public_key
        : Buffer.from(row.public_key),
      counter: Number(row.counter),
    };
  }

  async updateWebAuthnCredentialCounter(
    credentialIdB64: string,
    counter: number,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE auth_webauthn_credentials SET counter = $2 WHERE credential_id_b64 = $1`,
      [credentialIdB64, counter],
    );
  }

  async revokeWebAuthnCredentialForUser(
    userId: string,
    credentialRowId: string,
  ): Promise<boolean> {
    const r = await this.pool.query(
      `DELETE FROM auth_webauthn_credentials WHERE id = $1 AND user_id = $2`,
      [credentialRowId.trim(), userId],
    );
    return (r.rowCount ?? 0) > 0;
  }
}
