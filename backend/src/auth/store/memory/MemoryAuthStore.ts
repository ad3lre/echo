import bcrypt from 'bcrypt';
import { randomBytes, randomInt } from 'crypto';
import { config } from '../../../config';
import { validateEchoStoredBrandingUrl } from '../../../services/storedMediaUrl';
import { nextEchoSnowflakeId } from '../../../domain/echoSnowflake';
import { assertEchoAuthLocale } from '../../../../../shared/echoLocale';
import { normalizeEmail } from '../../email';
import { normalizeInputToE164 } from '../../phoneE164';
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
  PasswordRecord,
  AuthProfilePatch,
  RefreshTokenHashClass,
  RefreshTokenRecord,
  PasswordResetConsumeResult,
} from '../types';
import { normalizeUsername, makeHash, publicUser } from '../helpers';

export class MemoryAuthStore implements AuthStore {
  get store(): AuthStore {
    return this;
  }
  get mode(): 'memory' {
    return 'memory';
  }

  private users = new Map<string, PasswordRecord>();
  private refreshTokens = new Map<string, RefreshTokenRecord>();
  private emailVerificationTokens = new Map<
    string,
    { userId: string; purpose: string; expiresAt: string }
  >();
  private phoneOtpChallenges = new Map<
    string,
    {
      userId: string | null;
      phoneE164: string;
      codeHmac: string;
      expiresAt: string;
      attemptCount: number;
      maxAttempts: number;
    }
  >();
  private recoveryCodes = new Map<string, string[]>();
  private passwordResetTokens = new Map<
    string,
    { userId: string; expiresAt: string }
  >();
  private loginEvents: {
    userId: string | null;
    eventType: string;
    createdAt: number;
  }[] = [];
  private webauthnCredentials = new Map<
    string,
    {
      userId: string;
      publicKey: Buffer;
      counter: number;
      transports?: string[];
      createdAt: number;
    }
  >();

  private allocateMemorySignupOrdinal(): number {
    let max = 0;
    for (const u of this.users.values()) {
      if (u.isGuest || u.isDiscordShadow) continue;
      if (typeof u.signupOrdinal === 'number' && u.signupOrdinal > max) {
        max = u.signupOrdinal;
      }
    }
    return max + 1;
  }

  // --- UserStore ---

  async createUser(input: AuthRegisterBody): Promise<AuthUser> {
    const usernameResult = validateRegistrationUsername(input.username);
    if (!usernameResult.ok) throw new Error('INVALID_USERNAME');
    const username = usernameResult.normalizedUsername;
    const emailResult = validateRegistrationEmail(input.email);
    if (!emailResult.ok) throw new Error(emailResult.code);
    const emailNorm = emailResult.normalizedEmail;
    for (const u of this.users.values()) {
      if (u.username === username) throw new Error('USERNAME_TAKEN');
      if (u.email === emailNorm) throw new Error('EMAIL_IN_USE');
    }
    const id = nextEchoSnowflakeId();
    const displayNameResult = validateDisplayName(input.displayName, username);
    if (!displayNameResult.ok) throw new Error('INVALID_DISPLAY_NAME');
    const displayName = displayNameResult.displayName;
    const pfp = generateDefaultAvatarPfp(displayName);
    const passwordHash = await makeHash(input.password);
    const user: PasswordRecord = {
      id,
      username,
      email: emailNorm,
      displayName,
      pfp,
      status: 'online',
      customStatus: '',
      bio: '',
      bannerImage: '',
      bannerColor: '',
      bannerRefractionEnabled: false,
      bannerBlurEnabled: false,
      bannerBlackoutEnabled: false,
      bannerPositionY: 50,
      passwordHash,
      createdAt: new Date().toISOString(),
      emailVerified: false,
      phoneVerified: false,
      echoPlan: 'free',
      hasActiveSubscription: false,
      signupOrdinal: this.allocateMemorySignupOrdinal(),
    };
    this.users.set(id, user);
    return publicUser(user);
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
    for (const u of this.users.values()) {
      if (u.username === username) throw new Error('USERNAME_TAKEN');
      if (emailNorm && u.email === emailNorm) throw new Error('EMAIL_IN_USE');
    }
    const id = nextEchoSnowflakeId();
    const displayNameResult = validateDisplayName(input.displayName, username);
    const displayName = displayNameResult.ok
      ? displayNameResult.displayName
      : username;
    const pfp = generateDefaultAvatarPfp(displayName);
    const user: PasswordRecord = {
      id,
      username,
      email: emailNorm || undefined,
      displayName,
      pfp,
      status: 'online',
      customStatus: '',
      bio: '',
      bannerImage: '',
      bannerColor: '',
      bannerRefractionEnabled: false,
      bannerBlurEnabled: false,
      bannerBlackoutEnabled: false,
      bannerPositionY: 50,
      passwordHash: null,
      createdAt: new Date().toISOString(),
      emailVerified: input.emailVerifiedFromIdp,
      phoneVerified: false,
      echoPlan: 'free',
      hasActiveSubscription: false,
      signupOrdinal: this.allocateMemorySignupOrdinal(),
    };
    this.users.set(id, user);
    return publicUser(user);
  }

  async getUserByUsername(username: string): Promise<PasswordRecord | null> {
    const norm = normalizeUsername(username);
    for (const u of this.users.values()) {
      if (u.username === norm) return { ...u };
    }
    return null;
  }

  async getUserById(id: string): Promise<AuthUser | null> {
    const u = this.users.get(id);
    return u ? publicUser(u) : null;
  }

  async listUsers(): Promise<AuthUser[]> {
    return Array.from(this.users.values())
      .map((user) => publicUser(user))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
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
    const u = this.users.get(userId);
    if (!u) return;
    u.passwordHash = await makeHash(newPassword);
    u.updatedAt = new Date().toISOString();
  }

  async updateUserProfile(
    userId: string,
    patch: AuthProfilePatch,
  ): Promise<AuthUser | null> {
    const u = this.users.get(userId);
    if (!u) return null;
    if (patch.pfp !== undefined) u.pfp = patch.pfp;
    if (patch.status !== undefined) u.status = patch.status;
    if (patch.customStatus !== undefined) u.customStatus = patch.customStatus;
    if (patch.bio !== undefined) u.bio = String(patch.bio).trim().slice(0, 280);
    if (patch.bannerImage !== undefined) u.bannerImage = patch.bannerImage;
    if (patch.bannerColor !== undefined) u.bannerColor = patch.bannerColor;
    if (patch.bannerRefractionEnabled !== undefined)
      u.bannerRefractionEnabled = patch.bannerRefractionEnabled;
    if (patch.bannerBlurEnabled !== undefined)
      u.bannerBlurEnabled = patch.bannerBlurEnabled;
    if (patch.bannerBlackoutEnabled !== undefined)
      u.bannerBlackoutEnabled = patch.bannerBlackoutEnabled;
    if (patch.bannerPositionY !== undefined) {
      const n = Number(patch.bannerPositionY);
      if (!Number.isFinite(n) || n < 0 || n > 100)
        throw new Error('INVALID_BANNER_POSITION');
      u.bannerPositionY = n;
    }
    if (patch.email !== undefined) {
      const emailResult = validateRegistrationEmail(patch.email);
      if (!emailResult.ok) throw new Error(emailResult.code);
      const norm = emailResult.normalizedEmail;
      for (const other of this.users.values()) {
        if (other.id !== userId && other.email === norm)
          throw new Error('EMAIL_IN_USE');
      }
      u.email = norm;
      u.emailVerified = false;
    }
    if (patch.displayName !== undefined) {
      const displayNameResult = validateDisplayName(patch.displayName, '');
      if (!displayNameResult.ok) throw new Error('INVALID_DISPLAY_NAME');
      u.displayName = displayNameResult.displayName;
    }
    if (patch.username !== undefined) {
      const usernameResult = validateRegistrationUsername(patch.username);
      if (!usernameResult.ok) throw new Error('INVALID_USERNAME');
      if (u.isGuest) throw new Error('USERNAME_GUEST_LOCKED');
      const normalized = usernameResult.normalizedUsername;
      for (const other of this.users.values()) {
        if (other.id !== userId && other.username === normalized)
          throw new Error('USERNAME_TAKEN');
      }
      u.username = normalized;
    }
    if (patch.phone !== undefined) {
      if (patch.phone === null || String(patch.phone).trim() === '') {
        u._memPendingE164 = undefined;
      } else {
        const e164 = normalizeInputToE164(String(patch.phone));
        if (!e164) throw new Error('INVALID_PHONE');
        for (const other of this.users.values()) {
          if (
            other.id !== userId &&
            (other._memVerifiedE164 === e164 || other._memPendingE164 === e164)
          ) {
            throw new Error('PHONE_IN_USE');
          }
        }
        u._memPendingE164 = e164;
      }
    }
    if (patch.timeZone !== undefined) {
      if (patch.timeZone === null || String(patch.timeZone).trim() === '') {
        delete (u as { timeZone?: string | null }).timeZone;
      } else {
        const tz = String(patch.timeZone).trim().slice(0, 64);
        try {
          Intl.DateTimeFormat(undefined, { timeZone: tz }).format();
        } catch {
          throw new Error('INVALID_TIME_ZONE');
        }
        (u as { timeZone?: string }).timeZone = tz;
      }
    }
    if (patch.locale !== undefined) {
      if (patch.locale === null || String(patch.locale).trim() === '') {
        delete (u as { locale?: string | null }).locale;
      } else {
        (u as { locale?: string }).locale = assertEchoAuthLocale(patch.locale);
      }
    }
    u.updatedAt = new Date().toISOString();
    return publicUser(u);
  }

  async createGuestUser(): Promise<AuthUser | null> {
    const id = nextEchoSnowflakeId();
    const username = `guest_${id}`;
    const alias = randomGuestPlaceholderDisplayName();
    const displayName = alias;
    const pfp = generateDefaultAvatarPfp(alias);
    const passwordHash = await makeHash(randomBytes(48).toString('hex'));
    const user: PasswordRecord = {
      id,
      username,
      displayName,
      pfp,
      status: 'online',
      customStatus: '',
      bio: '',
      bannerImage: '',
      bannerColor: '',
      bannerRefractionEnabled: false,
      bannerBlurEnabled: false,
      bannerBlackoutEnabled: false,
      bannerPositionY: 50,
      passwordHash,
      isGuest: true,
      guestMintedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      emailVerified: true,
      phoneVerified: true,
      echoPlan: 'free',
      hasActiveSubscription: false,
    };
    this.users.set(id, user);
    return publicUser(user);
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

  async upgradeGuestAccount(
    userId: string,
    input: AuthUpgradeGuestBody,
  ): Promise<AuthUser> {
    const emailResult = validateRegistrationEmail(input.email);
    if (!emailResult.ok) throw new Error(emailResult.code);
    const emailNorm = emailResult.normalizedEmail;
    if (input.password.length < MIN_PASSWORD_LENGTH)
      throw new Error('WEAK_PASSWORD');
    const u = this.users.get(userId);
    if (!u?.isGuest) throw new Error('NOT_GUEST');
    for (const other of this.users.values()) {
      if (other.id !== userId && other.email === emailNorm)
        throw new Error('EMAIL_IN_USE');
    }
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
    for (const other of this.users.values()) {
      if (other.id !== userId && other.username === username)
        throw new Error('USERNAME_TAKEN');
    }
    const displayNameResult = validateDisplayName(
      input.displayName,
      u.displayName?.trim() ? u.displayName.trim() : username,
    );
    if (!displayNameResult.ok) throw new Error('INVALID_DISPLAY_NAME');
    u.email = emailNorm;
    u.username = username;
    u.displayName = displayNameResult.displayName;
    u.passwordHash = await makeHash(input.password);
    u.isGuest = false;
    u.guestPendingEmail = undefined;
    u.emailVerified = false;
    u.updatedAt = new Date().toISOString();
    const pfpIn = input.pfp?.trim() ?? '';
    if (pfpIn) {
      const v = validateEchoStoredBrandingUrl(pfpIn);
      if (!v.ok) throw new Error('INVALID_BODY');
      u.pfp = v.value;
    } else {
      u.pfp = generateDefaultAvatarPfp(u.displayName);
    }
    u.echoPlan = 'free';
    u.hasActiveSubscription = false;
    u.signupOrdinal = this.allocateMemorySignupOrdinal();
    return publicUser(u);
  }

  async setGuestPendingEmail(
    userId: string,
    email: string | null,
  ): Promise<void> {
    const u = this.users.get(userId);
    if (!u?.isGuest) return;
    if (email != null && String(email).trim() !== '') {
      const emailResult = validateRegistrationEmail(email);
      u.guestPendingEmail = emailResult.ok
        ? emailResult.normalizedEmail
        : undefined;
    } else {
      u.guestPendingEmail = undefined;
    }
    u.updatedAt = new Date().toISOString();
  }

  async incrementGuestMessageCount(userId: string): Promise<number | null> {
    const u = this.users.get(userId);
    if (!u?.isGuest) return null;
    u.guestTotalMessages = (u.guestTotalMessages || 0) + 1;
    u.updatedAt = new Date().toISOString();
    return u.guestTotalMessages;
  }

  async deleteUserAccount(userId: string): Promise<boolean> {
    await this.revokeUserRefreshTokens(userId);
    return this.users.delete(userId);
  }

  async findPasswordUserByEmail(email: string): Promise<PasswordRecord | null> {
    const norm = normalizeEmail(email);
    if (!norm) return null;
    for (const u of this.users.values()) {
      if (u.email === norm) return { ...u };
    }
    return null;
  }

  // --- SessionStore ---

  async storeRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: string,
  ): Promise<RefreshTokenRecord> {
    const id = nextEchoSnowflakeId();
    const record: RefreshTokenRecord = {
      id,
      userId,
      tokenHash,
      expiresAt,
      createdAt: new Date().toISOString(),
    };
    this.refreshTokens.set(tokenHash, record);
    return record;
  }

  async classifyRefreshTokenHash(
    tokenHash: string,
  ): Promise<RefreshTokenHashClass> {
    const r = this.refreshTokens.get(tokenHash);
    if (!r) return 'missing';
    if (r.revokedAt) return 'revoked';
    if (new Date(r.expiresAt).getTime() <= Date.now()) return 'expired';
    return 'active';
  }

  async findActiveRefreshToken(
    tokenHash: string,
  ): Promise<RefreshTokenRecord | null> {
    const r = this.refreshTokens.get(tokenHash);
    if (!r || r.revokedAt || new Date(r.expiresAt).getTime() <= Date.now())
      return null;
    return { ...r };
  }

  async findRefreshTokenById(
    tokenId: string,
  ): Promise<RefreshTokenRecord | null> {
    for (const r of this.refreshTokens.values()) {
      if (r.id === tokenId) {
        if (r.revokedAt || new Date(r.expiresAt).getTime() <= Date.now())
          return null;
        return { ...r };
      }
    }
    return null;
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
    | { ok: false; reason: 'missing_or_expired' | 'already_redeemed' }
  > {
    const existing = this.refreshTokens.get(params.tokenHash);
    if (!existing || new Date(existing.expiresAt).getTime() <= Date.now()) {
      return { ok: false, reason: 'missing_or_expired' };
    }
    if (existing.revokedAt) {
      return { ok: false, reason: 'already_redeemed' };
    }
    existing.revokedAt = new Date().toISOString();
    const next = await this.storeRefreshToken(
      existing.userId,
      params.nextTokenHash,
      params.nextExpiresAt,
    );
    return { ok: true, previousTokenId: existing.id, next };
  }

  async listActiveRefreshTokensByUser(
    userId: string,
  ): Promise<RefreshTokenRecord[]> {
    const now = Date.now();
    return Array.from(this.refreshTokens.values())
      .filter(
        (r) =>
          r.userId === userId &&
          !r.revokedAt &&
          new Date(r.expiresAt).getTime() > now,
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  async revokeRefreshToken(tokenId: string): Promise<void> {
    for (const r of this.refreshTokens.values()) {
      if (r.id === tokenId) {
        r.revokedAt = new Date().toISOString();
        break;
      }
    }
  }

  async revokeUserRefreshTokens(userId: string): Promise<void> {
    for (const r of this.refreshTokens.values()) {
      if (r.userId === userId) {
        r.revokedAt = new Date().toISOString();
      }
    }
  }

  // --- VerificationStore ---

  async createEmailVerificationToken(
    userId: string,
    purpose: 'signup',
    options?: { enforceResendCooldown?: boolean },
  ): Promise<{ plainToken: string }> {
    if (purpose !== 'signup') throw new Error('UNSUPPORTED_PURPOSE');
    const cooldownMs = config.echoEmailVerificationResendCooldownSeconds * 1000;
    if (options?.enforceResendCooldown) {
      for (const [hash, t] of this.emailVerificationTokens.entries()) {
        if (t.userId === userId && t.purpose === purpose) {
          const age =
            Date.now() -
            new Date(t.expiresAt).getTime() +
            config.echoEmailVerificationTokenHours * 3600000;
          if (age < cooldownMs) throw new Error('VERIFICATION_EMAIL_COOLDOWN');
        }
      }
    }
    for (const [hash, t] of this.emailVerificationTokens.entries()) {
      if (t.userId === userId && t.purpose === purpose)
        this.emailVerificationTokens.delete(hash);
    }
    const plainToken = randomBytes(32).toString('base64url');
    const tokenHash = hashRefreshToken(plainToken);
    const ttlMs = config.echoEmailVerificationTokenHours * 60 * 60 * 1000;
    this.emailVerificationTokens.set(tokenHash, {
      userId,
      purpose,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    });
    return { plainToken };
  }

  async consumeEmailVerificationToken(
    plainToken: string,
  ): Promise<{ userId: string } | null> {
    const hash = hashRefreshToken(plainToken);
    const t = this.emailVerificationTokens.get(hash);
    if (!t || new Date(t.expiresAt).getTime() <= Date.now()) return null;
    this.emailVerificationTokens.delete(hash);
    const u = this.users.get(t.userId);
    if (u) {
      u.emailVerified = true;
      u.updatedAt = new Date().toISOString();
    }
    return { userId: t.userId };
  }

  async issuePhoneOtpChallenge(
    userId: string,
    options?: { enforceResendCooldown?: boolean },
  ): Promise<{ plainCode: string; targetPhoneE164: string }> {
    const u = this.users.get(userId);
    const target = u?._memPendingE164;
    if (!target) throw new Error('NO_PENDING_PHONE');

    const cooldownMs = config.echoSmsOtpResendCooldownSeconds * 1000;
    if (options?.enforceResendCooldown) {
      for (const ch of this.phoneOtpChallenges.values()) {
        if (ch.userId === userId) {
          const age =
            Date.now() -
            new Date(ch.expiresAt).getTime() +
            config.echoSmsOtpTtlMinutes * 60000;
          if (age < cooldownMs) throw new Error('SMS_OTP_COOLDOWN');
        }
      }
    }

    const len = config.echoSmsOtpLength;
    let plainCode = '';
    for (let i = 0; i < len; i++) plainCode += String(randomInt(0, 10));
    const codeHmac = smsOtpHmacHex(userId, target, plainCode);
    const ttlMs = config.echoSmsOtpTtlMinutes * 60 * 1000;
    this.phoneOtpChallenges.set(userId, {
      userId,
      phoneE164: target,
      codeHmac,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      attemptCount: 0,
      maxAttempts: config.echoSmsOtpMaxAttempts,
    });
    return { plainCode, targetPhoneE164: target };
  }

  async verifyPhoneOtpAndConsume(
    userId: string,
    plainCode: string,
  ): Promise<boolean> {
    const ch = this.phoneOtpChallenges.get(userId);
    if (!ch) return false;
    if (new Date(ch.expiresAt).getTime() <= Date.now()) {
      this.phoneOtpChallenges.delete(userId);
      return false;
    }
    if (ch.attemptCount >= ch.maxAttempts) return false;

    const u = this.users.get(userId);
    if (!u || u._memPendingE164 !== ch.phoneE164) {
      this.phoneOtpChallenges.delete(userId);
      return false;
    }

    const ok = smsOtpVerifyTimingSafe(
      ch.codeHmac,
      userId,
      ch.phoneE164,
      plainCode,
    );
    if (ok) {
      this.phoneOtpChallenges.delete(userId);
      u._memVerifiedE164 = u._memPendingE164;
      u._memPendingE164 = undefined;
      u.phoneVerified = true;
      u.updatedAt = new Date().toISOString();
      return true;
    }
    ch.attemptCount++;
    if (ch.attemptCount >= ch.maxAttempts)
      this.phoneOtpChallenges.delete(userId);
    return false;
  }

  async beginTotpEnrollment(
    userId: string,
  ): Promise<{ secretBase32: string; otpauthUrl: string }> {
    const u = this.users.get(userId);
    if (!u || u.isGuest) throw new Error('TOTP_NOT_ALLOWED');
    if (u.totpEnabled) throw new Error('TOTP_ALREADY_ENABLED');
    const secretBase32 = generateTotpSecretBase32();
    u._memPendingTotpSecret = secretBase32;
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
    const u = this.users.get(userId);
    if (!u || u.totpEnabled || !u._memPendingTotpSecret)
      throw new Error('TOTP_STATE');
    if (
      !verifyTotpCode(u._memPendingTotpSecret, code) ||
      checkAndMarkTotpUsed(userId, code)
    )
      throw new Error('INVALID_TOTP');

    const n = config.echo2faRecoveryCodeCount;
    const plainCodes: string[] = [];
    const hashes: string[] = [];
    const pepper = config.echo2faRecoveryPepper;
    for (let i = 0; i < n; i++) {
      const p = generateRecoveryCodePlain();
      plainCodes.push(p);
      hashes.push(hashRecoveryCode(pepper, normalizeRecoveryCodeInput(p)));
    }
    u.totpEnabled = true;
    u._memTotpSecret = u._memPendingTotpSecret;
    u._memPendingTotpSecret = undefined;
    this.recoveryCodes.set(userId, hashes);
    u.updatedAt = new Date().toISOString();
    return { recoveryCodes: plainCodes };
  }

  async disableTotp(
    userId: string,
    password: string,
    factor: { totpCode?: string; recoveryCode?: string },
  ): Promise<void> {
    const u = this.users.get(userId);
    if (!u?.totpEnabled) throw new Error('TOTP_NOT_ENABLED');
    if (!u.passwordHash || !(await bcrypt.compare(password, u.passwordHash))) {
      throw new Error('INVALID_PASSWORD');
    }

    if (factor.totpCode) {
      if (
        !u._memTotpSecret ||
        !verifyTotpCode(u._memTotpSecret, factor.totpCode) ||
        checkAndMarkTotpUsed(userId, factor.totpCode)
      ) {
        throw new Error('INVALID_TOTP');
      }
    } else if (factor.recoveryCode) {
      const norm = normalizeRecoveryCodeInput(factor.recoveryCode);
      const hashes = this.recoveryCodes.get(userId) || [];
      const idx = hashes.findIndex((h) =>
        recoveryCodeHashEquals(h, config.echo2faRecoveryPepper, norm),
      );
      if (idx === -1) throw new Error('INVALID_RECOVERY_CODE');
      hashes.splice(idx, 1);
    } else {
      throw new Error('INVALID_FACTOR');
    }
    u.totpEnabled = false;
    u._memTotpSecret = undefined;
    this.recoveryCodes.delete(userId);
    u.updatedAt = new Date().toISOString();
  }

  async verifyTotpForLogin(userId: string, code: string): Promise<boolean> {
    const u = this.users.get(userId);
    if (!u?.totpEnabled || !u._memTotpSecret) return false;
    return (
      verifyTotpCode(u._memTotpSecret, code) &&
      !checkAndMarkTotpUsed(userId, code)
    );
  }

  async consumeRecoveryCode(
    userId: string,
    plaintext: string,
  ): Promise<boolean> {
    const norm = normalizeRecoveryCodeInput(plaintext);
    const hashes = this.recoveryCodes.get(userId) || [];
    const idx = hashes.findIndex((h) =>
      recoveryCodeHashEquals(h, config.echo2faRecoveryPepper, norm),
    );
    if (idx === -1) return false;
    hashes.splice(idx, 1);
    return true;
  }

  async createPasswordResetToken(
    userId: string,
  ): Promise<{ plainToken: string }> {
    const plainToken = randomBytes(32).toString('base64url');
    const hash = hashRefreshToken(plainToken);
    this.passwordResetTokens.set(hash, {
      userId,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    return { plainToken };
  }

  async consumePasswordResetToken(
    plainToken: string,
    newPassword: string,
    options?: { totpCode?: string },
  ): Promise<PasswordResetConsumeResult> {
    if (newPassword.length < MIN_PASSWORD_LENGTH)
      return { ok: false, reason: 'weak_password' };
    const hash = hashRefreshToken(plainToken);
    const t = this.passwordResetTokens.get(hash);
    if (!t || new Date(t.expiresAt).getTime() <= Date.now())
      return { ok: false, reason: 'invalid' };
    const u = this.users.get(t.userId);
    if (!u) return { ok: false, reason: 'invalid' };
    if (u.totpEnabled) {
      if (
        !options?.totpCode ||
        !u._memTotpSecret ||
        !verifyTotpCode(u._memTotpSecret, options.totpCode) ||
        checkAndMarkTotpUsed(u.id, options.totpCode)
      ) {
        return {
          ok: false,
          reason: options?.totpCode ? 'bad_totp' : 'totp_required',
        };
      }
    }
    u.passwordHash = await makeHash(newPassword);
    u.updatedAt = new Date().toISOString();
    this.passwordResetTokens.delete(hash);
    await this.revokeUserRefreshTokens(u.id);
    return { ok: true, userId: u.id };
  }

  // --- AuditStore ---

  async recordLoginEvent(row: {
    userId: string | null;
    eventType: string;
    ipDigest?: string;
    uaDigest?: string;
  }): Promise<void> {
    this.loginEvents.push({
      userId: row.userId,
      eventType: row.eventType,
      createdAt: Date.now(),
    });
  }

  async pruneLoginEvents(olderThanDays: number): Promise<number> {
    const cutoff = Date.now() - olderThanDays * 86400000;
    const initial = this.loginEvents.length;
    this.loginEvents = this.loginEvents.filter((e) => e.createdAt >= cutoff);
    return initial - this.loginEvents.length;
  }

  // --- WebAuthnStore ---

  async listWebAuthnCredentialsForUser(
    userId: string,
  ): Promise<{ id: string; credentialIdB64: string; createdAt: string }[]> {
    const out: { id: string; credentialIdB64: string; createdAt: string }[] =
      [];
    for (const [cid, c] of this.webauthnCredentials.entries()) {
      if (c.userId === userId)
        out.push({
          id: cid,
          credentialIdB64: cid,
          createdAt: new Date(c.createdAt).toISOString(),
        });
    }
    return out;
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
    this.webauthnCredentials.set(cred.credentialIdB64, {
      userId,
      publicKey: cred.publicKey,
      counter: cred.counter,
      transports: cred.transports,
      createdAt: Date.now(),
    });
  }

  async findWebAuthnCredential(
    credentialIdB64: string,
  ): Promise<{ userId: string; publicKey: Buffer; counter: number } | null> {
    const c = this.webauthnCredentials.get(credentialIdB64);
    return c ? { ...c } : null;
  }

  async updateWebAuthnCredentialCounter(
    credentialIdB64: string,
    counter: number,
  ): Promise<void> {
    const c = this.webauthnCredentials.get(credentialIdB64);
    if (c) c.counter = counter;
  }

  async revokeWebAuthnCredentialForUser(
    userId: string,
    credentialRowId: string,
  ): Promise<boolean> {
    const c = this.webauthnCredentials.get(credentialRowId.trim());
    if (!c || c.userId !== userId) return false;
    this.webauthnCredentials.delete(credentialRowId.trim());
    return true;
  }
}
