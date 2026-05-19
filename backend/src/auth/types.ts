export interface AuthUser {
  id: string;
  username: string;
  /** Present for registered accounts (not shown for guests without an email). */
  email?: string;
  /**
   * False for new Postgres accounts with an email until verification; true if there is no email to confirm or it was verified.
   * Mock auth store always reports true.
   */
  emailVerified: boolean;
  /** Verified E.164, masked (e.g. ******1234) when set. */
  phone?: string;
  /** Pending verification number, masked when set. */
  pendingPhone?: string;
  /**
   * True when there is no committed phone or `phone_verified_at` is set for `phone_e164`.
   * Changing phone keeps the previous verified line until the new pending number is confirmed.
   */
  phoneVerified: boolean;
  displayName: string;
  pfp: string;
  status: 'online' | 'idle' | 'do_not_disturb' | 'offline';
  customStatus?: string;
  /** Short profile bio; empty when unset. */
  bio?: string;
  bannerImage?: string;
  bannerColor?: string;
  bannerRefractionEnabled?: boolean;
  /** Profile banner frosted blur (same idea as server channel header). */
  bannerBlurEnabled?: boolean;
  /** Extra darkening overlay on profile banner. */
  bannerBlackoutEnabled?: boolean;
  /**
   * Vertical crop anchor for cover banners in percent (0 = top, 50 = center, 100 = bottom).
   * Used by both profile and server banners to allow “reposition” without re-uploading.
   */
  bannerPositionY?: number;
  createdAt: string;
  updatedAt?: string;
  /** Onboarding guest (Slack-style); upgrade clears this. */
  isGuest?: boolean;
  /**
   * When set, Discord OAuth suggested this email for the guest upgrade form (not a registered email yet).
   * Cleared on successful guest → full upgrade.
   */
  guestPendingEmail?: string;
  guestMintedAt?: string;
  guestSuspendedUntil?: string;
  guestDeletedAt?: string;
  guestTotalMessages?: number;
  /** Authenticator-app TOTP enabled (Postgres auth); omitted or false when disabled. */
  totpEnabled?: boolean;
  /** Echo: Placeholder user created for Discord message imports (unusable for login). */
  isDiscordShadow?: boolean;
  /** Subscription tier for Echo limits (Postgres `auth_users.echo_plan`). */
  echoPlan?: 'free' | 'plus' | 'black';
  /** When true, client shows billing history / subscription management (set when a paid plan exists). */
  hasActiveSubscription?: boolean;
  /**
   * Profile badges, e.g. `og` for the first {@link ../../shared/echoAccountBadges.ECHO_OG_BADGE_MAX_SIGNUP_ORDINAL} full accounts.
   * Omitted when the user has none.
   */
  badges?: import('../../../shared/echoAccountBadges').EchoPublicBadgeId[];
  /** Whether to show "last online" timestamp to other users. Defaults to true. */
  showLastOnline?: boolean;
}

/** Second step after password when `totpEnabled` (see login response union). */
export interface AuthLoginMfaBody {
  mfaToken: string;
  /** 6-digit TOTP from authenticator app. */
  code?: string;
  /** Single-use backup code (e.g. ABCD-EFGH-JKLM). */
  recoveryCode?: string;
}

export interface AuthRegisterBody {
  username: string;
  password: string;
  /** Stored normalized (trim + lowercase); required for new accounts. */
  email: string;
  displayName?: string;
  /**
   * Opaque client device identifier (e.g. stable UUID in localStorage).
   * Required when {@link import('../../config').config.authHwidAccountCapEnabled} HWID cap is enabled.
   */
  clientHwid?: string;
}

export interface AuthLoginBody {
  username: string;
  password: string;
}

export interface AuthRefreshBody {
  refreshToken: string;
}

export interface AuthLogoutBody {
  refreshToken?: string;
  allSessions?: boolean;
}

export interface AuthProfileUpdateBody {
  email?: string;
  /** E.164 pending phone (set via PATCH); omit to leave unchanged, empty string or null clears pending only. */
  phone?: string | null;
  /** Echo login handle; normalized server-side (see registration rules). Not available for guests or Discord shadow rows. */
  username?: string;
  displayName?: string;
  pfp?: string;
  status?: 'online' | 'idle' | 'do_not_disturb' | 'offline';
  customStatus?: string;
  bio?: string;
  bannerImage?: string;
  bannerColor?: string;
  bannerRefractionEnabled?: boolean;
  bannerBlurEnabled?: boolean;
  bannerBlackoutEnabled?: boolean;
  bannerPositionY?: number;
  /** Whether to show "last online" timestamp to other users. Omit to leave unchanged. */
  showLastOnline?: boolean;
}

export type AuthUpgradeGuestBody = {
  email: string;
  password: string;
  username?: string;
  displayName?: string;
  /** When set and valid, kept on the upgraded account; otherwise a default avatar is generated. */
  pfp?: string;
};
