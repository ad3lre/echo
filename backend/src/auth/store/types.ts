import type {
  AuthUser,
  AuthRegisterBody,
  AuthUpgradeGuestBody,
} from '../types';

export type PasswordResetConsumeResult =
  | { ok: true; userId: string }
  | {
      ok: false;
      reason: 'invalid' | 'totp_required' | 'bad_totp' | 'weak_password';
    };

/**
 * Stored credentials; `email` duplicates `AuthUser.email` when set.
 * Memory store uses `_memVerifiedE164` / `_memPendingE164` for raw E.164; Postgres uses DB columns + mapUser masks.
 */
export type PasswordRecord = AuthUser & {
  passwordHash: string | null;
  /** Memory auth only; Postgres uses `auth_users.signup_ordinal`. Stripped in `publicUser()`. */
  signupOrdinal?: number;
  /** From DB row when column exists; used for login MFA branch. */
  totpEnabled?: boolean;
  _memVerifiedE164?: string;
  _memPendingE164?: string;
  _memTotpSecret?: string;
  _memPendingTotpSecret?: string;
};

export type RefreshTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  revokedAt?: string;
};

export type AuthProfilePatch = {
  email?: string;
  /** Raw input; normalized to E.164 in Postgres. Null/empty clears pending only. */
  phone?: string | null;
  username?: string;
  displayName?: string;
  pfp?: string;
  status?: AuthUser['status'];
  customStatus?: string;
  bio?: string;
  bannerImage?: string;
  bannerColor?: string;
  bannerRefractionEnabled?: boolean;
  bannerBlurEnabled?: boolean;
  bannerBlackoutEnabled?: boolean;
  /** Vertical crop anchor for banner cover image (0–100). */
  bannerPositionY?: number;
  /** Whether to show "last online" timestamp to other users. */
  showLastOnline?: boolean;
  /** IANA timezone id; empty string clears stored value. */
  timeZone?: string | null;
  locale?: string | null;
};

export interface UserStore {
  createUser(input: AuthRegisterBody): Promise<AuthUser>;
  getUserByUsername(username: string): Promise<PasswordRecord | null>;
  getUserById(id: string): Promise<AuthUser | null>;
  listUsers(): Promise<AuthUser[]>;
  verifyPassword(user: PasswordRecord, password: string): Promise<boolean>;
  updatePassword(userId: string, newPassword: string): Promise<void>;
  updateUserProfile(
    userId: string,
    patch: AuthProfilePatch,
  ): Promise<AuthUser | null>;
  createGuestUser(): Promise<AuthUser | null>;
  createOAuthUser(input: {
    username: string;
    email?: string;
    displayName?: string;
    emailVerifiedFromIdp: boolean;
  }): Promise<AuthUser>;
  upgradeGuestAccount(
    userId: string,
    input: AuthUpgradeGuestBody,
  ): Promise<AuthUser>;
  /** Suggested email for Discord-initiated guests; cleared on upgrade. */
  setGuestPendingEmail(userId: string, email: string | null): Promise<void>;
  incrementGuestMessageCount(userId: string): Promise<number | null>;
  ensureGuestDisplayAliasIfEmpty(user: AuthUser): Promise<AuthUser>;
  deleteUserAccount(userId: string): Promise<boolean>;
  findPasswordUserByEmail(email: string): Promise<PasswordRecord | null>;
}

/** Used by POST /auth/refresh to avoid wiping cookies on concurrent rotation races. */
export type RefreshTokenHashClass =
  | 'active'
  | 'revoked'
  | 'expired'
  | 'missing';

export interface SessionStore {
  storeRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: string,
  ): Promise<RefreshTokenRecord>;
  findActiveRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /** Whether a row exists for this hash and if it is still usable (not revoked / not past expires_at). */
  classifyRefreshTokenHash(tokenHash: string): Promise<RefreshTokenHashClass>;
  findRefreshTokenById(tokenId: string): Promise<RefreshTokenRecord | null>;
  rotateRefreshTokenAtomic(params: {
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
  >;
  listActiveRefreshTokensByUser(userId: string): Promise<RefreshTokenRecord[]>;
  revokeRefreshToken(tokenId: string): Promise<void>;
  revokeUserRefreshTokens(userId: string): Promise<void>;
}

export interface VerificationStore {
  createEmailVerificationToken(
    userId: string,
    purpose: 'signup',
    options?: { enforceResendCooldown?: boolean },
  ): Promise<{ plainToken: string }>;
  consumeEmailVerificationToken(
    plainToken: string,
  ): Promise<{ userId: string } | null>;
  issuePhoneOtpChallenge(
    userId: string,
    options?: { enforceResendCooldown?: boolean },
  ): Promise<{ plainCode: string; targetPhoneE164: string }>;
  verifyPhoneOtpAndConsume(userId: string, plainCode: string): Promise<boolean>;
  beginTotpEnrollment(
    userId: string,
  ): Promise<{ secretBase32: string; otpauthUrl: string }>;
  confirmTotpEnrollment(
    userId: string,
    code: string,
  ): Promise<{ recoveryCodes: string[] }>;
  disableTotp(
    userId: string,
    password: string,
    factor: { totpCode?: string; recoveryCode?: string },
  ): Promise<void>;
  verifyTotpForLogin(userId: string, code: string): Promise<boolean>;
  consumeRecoveryCode(userId: string, plaintext: string): Promise<boolean>;
  createPasswordResetToken(userId: string): Promise<{ plainToken: string }>;
  consumePasswordResetToken(
    plainToken: string,
    newPassword: string,
    options?: { totpCode?: string },
  ): Promise<PasswordResetConsumeResult>;
}

export interface AuditStore {
  recordLoginEvent(row: {
    userId: string | null;
    eventType: string;
    ipDigest?: string;
    uaDigest?: string;
  }): Promise<void>;
  pruneLoginEvents(olderThanDays: number): Promise<number>;
}

export interface WebAuthnStore {
  listWebAuthnCredentialsForUser(
    userId: string,
  ): Promise<{ id: string; credentialIdB64: string; createdAt: string }[]>;
  saveWebAuthnCredential(
    userId: string,
    cred: {
      credentialIdB64: string;
      publicKey: Buffer;
      counter: number;
      transports?: string[];
    },
  ): Promise<void>;
  findWebAuthnCredential(
    credentialIdB64: string,
  ): Promise<{ userId: string; publicKey: Buffer; counter: number } | null>;
  updateWebAuthnCredentialCounter(
    credentialIdB64: string,
    counter: number,
  ): Promise<void>;
  /** Removes a stored passkey row; returns true if a row was deleted. */
  revokeWebAuthnCredentialForUser(
    userId: string,
    credentialRowId: string,
  ): Promise<boolean>;
}

export interface AuthStore
  extends
    UserStore,
    SessionStore,
    VerificationStore,
    AuditStore,
    WebAuthnStore {
  /** @deprecated use the store directly */
  readonly store: AuthStore;
  /** @deprecated use getAuthStore() logic */
  readonly mode: 'postgres' | 'memory';
}
