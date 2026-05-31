import { createHmac } from 'crypto';
import { config as dotenvConfig, parse as dotenvParse } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import {
  assertEchoProductionConfigGates,
  type EchoProductionConfigGateInput,
} from './config/productionGates';

/**
 * Find monorepo root (directory containing `backend/package.json`) when running from
 * backend/src, backend/dist/..., or nested paths.
 */
function resolveRepoRootFromDir(startDir: string): string | undefined {
  let dir: string = startDir;
  for (let i = 0; i < 12; i++) {
    const backendPkg = path.join(dir, 'backend', 'package.json');
    if (fs.existsSync(backendPkg)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * dotenv does not override existing `process.env` keys. An empty export (e.g. `export JWT_SECRET=`
 * in shell, or `Environment=JWT_SECRET=` in systemd) therefore blocks values from `.env`. Fill only
 * keys that are unset or whitespace-only from the parsed file so real secrets in `.env` still apply.
 */
function fillEmptyProcessEnvFromDotenvFile(envPath: string): void {
  if (!fs.existsSync(envPath)) return;
  try {
    const parsed = dotenvParse(fs.readFileSync(envPath));
    for (const key of Object.keys(parsed)) {
      if ((process.env[key] ?? '').trim() !== '') continue;
      const fromFile = (parsed[key] ?? '').trim();
      if (fromFile === '') continue;
      process.env[key] = parsed[key] as string;
    }
  } catch {
    // Ignore unreadable .env; primary dotenv load already ran.
  }
}

/**
 * `.env.lan` uses `override: true`; a stray `JWT_SECRET=` there clears the real value from `.env`.
 * If the key is blank after LAN load, re-read it from root then backend files only (no other keys).
 */
function restoreJwtSecretFromFilesIfBlankAfterLan(
  rootEnv: string,
  backendEnv: string,
): void {
  if ((process.env.JWT_SECRET ?? '').trim() !== '') return;
  for (const envPath of [rootEnv, backendEnv]) {
    if (!fs.existsSync(envPath)) continue;
    try {
      const parsed = dotenvParse(fs.readFileSync(envPath));
      const fromFile = (parsed.JWT_SECRET ?? '').trim();
      if (fromFile === '') continue;
      process.env.JWT_SECRET = parsed.JWT_SECRET as string;
      return;
    } catch {
      // try next path
    }
  }
}

/**
 * Load env in order: repo root `.env` → `backend/.env` (fills keys not set by root) → `.env.lan` (overrides all).
 * Use `backend/.env` for vars you do not want in root `.env`; duplicate keys always follow root (unless `.env.lan` overrides).
 */
const repoRoot = resolveRepoRootFromDir(__dirname);
/** When `1`, skip loading repo `.env` files so config gate tests are deterministic (see `productionConfigGates.test.ts`). */
if (repoRoot && process.env.ECHO_CONFIG_TEST_ISOLATION !== '1') {
  if (process.env.ECHO_DEBUG_ENV_LOAD === '1') {
    const v = (process.env.JWT_SECRET ?? '').trim();
    process.stderr.write(
      `[echo-config] pre-dotenv JWT_SECRET length=${v.length} ${v.length > 0 ? '(non-empty)' : '(empty)'}\n`,
    );
  }
  const rootEnv = path.join(repoRoot, '.env');
  const backendEnv = path.join(repoRoot, 'backend', '.env');
  if (fs.existsSync(rootEnv)) {
    dotenvConfig({ path: rootEnv });
    fillEmptyProcessEnvFromDotenvFile(rootEnv);
  }
  if (fs.existsSync(backendEnv)) {
    dotenvConfig({ path: backendEnv, override: false });
    fillEmptyProcessEnvFromDotenvFile(backendEnv);
  }
  const lanPath = path.join(repoRoot, '.env.lan');
  if (fs.existsSync(lanPath)) {
    dotenvConfig({ path: lanPath, override: true });
    restoreJwtSecretFromFilesIfBlankAfterLan(rootEnv, backendEnv);
  }
  if (process.env.ECHO_DEBUG_ENV_LOAD === '1') {
    const v = (process.env.JWT_SECRET ?? '').trim();
    process.stderr.write(
      `[echo-config] post-dotenv JWT_SECRET length=${v.length} ${v.length > 0 ? '(non-empty)' : '(empty)'}\n`,
    );
  }
}

/**
 * Some dev shells / IDE sandboxes export a default `DATABASE_URL` (e.g. compose-style `echo_dev`).
 * `dotenv` does not override existing `process.env` keys, so that value can mask the real URL in
 * repo `.env` and break Postgres auth. Prefer root `.env` when the process value is empty or one
 * of those known defaults. Opt out with `ECHO_SKIP_ROOT_ENV_DATABASE_URL_RECONCILE=1`.
 */
const SANDBOX_DEFAULT_DATABASE_URLS = new Set([
  'postgresql://echo:echo_dev@127.0.0.1:5432/echo',
  'postgresql://echo:echo_dev@localhost:5432/echo',
]);

function reconcileDatabaseUrlFromRootEnv(repo: string | undefined): void {
  if (!repo || process.env.ECHO_SKIP_ROOT_ENV_DATABASE_URL_RECONCILE === '1') {
    return;
  }
  if (process.env.ECHO_CONFIG_TEST_ISOLATION === '1') return;
  const rootEnv = path.join(repo, '.env');
  if (!fs.existsSync(rootEnv)) return;
  let parsed: Record<string, string>;
  try {
    parsed = dotenvParse(fs.readFileSync(rootEnv));
  } catch {
    return;
  }
  const fromFile = (parsed.DATABASE_URL ?? '').trim();
  if (!fromFile) return;
  const current = (process.env.DATABASE_URL ?? '').trim();
  const curNorm = current.replace(/\/$/, '');
  if (
    !current ||
    SANDBOX_DEFAULT_DATABASE_URLS.has(current) ||
    SANDBOX_DEFAULT_DATABASE_URLS.has(curNorm)
  ) {
    process.env.DATABASE_URL = fromFile;
  }
}

reconcileDatabaseUrlFromRootEnv(repoRoot);

/**
 * Default Discord user OAuth scopes when `DISCORD_OAUTH_SCOPES` is unset.
 * `openid` pairs with `sdk.social_layer` / `sdk.social_layer_presence` in Social SDK docs.
 * `identify.premium` appears in the Developer Portal → OAuth2 → URL Generator scope list (alongside `identify`).
 * Do not add `bot` / `rpc.*` here — those are different OAuth flows than user account linking.
 */
const DEFAULT_DISCORD_OAUTH_SCOPES =
  'connections email guilds identify identify.premium openid relationships.read sdk.social_layer sdk.social_layer_presence';

const DEFAULT_GOOGLE_OAUTH_SCOPES = 'openid email profile';
const DEFAULT_YOUTUBE_OAUTH_SCOPES =
  'openid email profile https://www.googleapis.com/auth/youtube.force-ssl';

/**
 * Defines the shape of the application's configuration.
 * Making properties readonly prevents accidental modification.
 */
interface AppConfig {
  readonly port: number;
  readonly host: string;
  readonly logLevel: string;
  readonly corsOrigin: string | string[] | true;
  /**
   * Origins (e.g. `https://tauri.localhost`) that may receive `SameSite=None` session cookies
   * for the Tauri desktop shell. Comma-separated in `ECHO_DESKTOP_ALLOWED_ORIGINS`; defaults
   * include Tauri’s dev origins when unset.
   */
  readonly echoDesktopAllowedOrigins: string[];
  /** Canonical backend persistence mode (single source of truth). */
  readonly backendStorageMode: BackendStorageMode;
  readonly databaseUrl: string | null;
  readonly natsUrl: string | null;
  /** @deprecated Prefer `backendStorageMode === 'memory'`. */
  readonly useMockDb: boolean;
  readonly giphyApiKey: string;
  /**
   * Serper.dev API key for `/api/v1/image-search` (composer Images tab).
   * https://serper.dev
   */
  readonly serperApiKey: string;
  /** Query used when the client opens image browse with an empty search box. */
  readonly serperDefaultQuery: string;
  /** Number of image results per Serper page (1–100). Default 20. */
  readonly serperImageNum: number;
  /** Max Serper page index (1-based). Default 4 = initial 20 + up to 3 scroll loads. */
  readonly serperImageMaxPage: number;
  /** In-process cache TTL for image search JSON (ms). Default 10 minutes. */
  readonly serperCacheTtlMs: number;
  /** Max cached queries (LRU). Default 200. */
  readonly serperCacheMaxEntries: number;
  /** Per-IP requests/minute to `/image-search` (before upstream; cache hits count). Default 10. */
  readonly serperRateLimitPerMinute: number;
  /**
   * Max Serper image API calls per IP per UTC day (cache misses only).
   * Default 180. Set to 0 to disable the daily cap.
   */
  readonly serperUpstreamMaxPerDayPerIp: number;
  /** L2 cache freshness window (days) before async refresh. Default 90. */
  readonly serperCacheRefreshDays: number;
  /** Max merged image rows stored per cache entry. Default 60. */
  readonly serperCacheMaxResults: number;
  /** Global Serper upstream calls per UTC day (0 = unlimited). Default 500. */
  readonly serperGlobalMaxPerDay: number;
  /** Global Serper upstream calls per UTC month (0 = unlimited). Default 10000. */
  readonly serperGlobalMaxPerMonth: number;
  /**
   * Stop async stale refresh after this many consecutive failures (0 = backoff only).
   * Default 0 (disabled).
   */
  readonly serperRefreshFailureMaxCount: number;
  /**
   * YouTube Data API v3 key for VC “Watch together” search (`GET …/youtube/search`).
   * When unset, search uses public Invidious-compatible instances (best-effort).
   */
  readonly youtubeDataApiKey: string;
  /**
   * Comma-separated Invidious base URLs (no path), e.g. `https://vid.puffyan.us`.
   * Used only when `youtubeDataApiKey` is empty.
   */
  readonly youtubeInvidiousHosts: string[];
  /**
   * VC “Watch together” daily (UTC) billed seconds cap per user (Redis).
   * Default 3 hours. Set `0` to disable the per-user cap.
   */
  readonly youtubeWatchTogetherUserBudgetSec: number;
  /**
   * Pool-wide daily (UTC) billed seconds cap across all users (Redis).
   * Default 300 hours. Set `0` to disable the global cap.
   */
  readonly youtubeWatchTogetherGlobalBudgetSec: number;
  /**
   * Seconds billed to the same daily pool for each `GET …/youtube/search|popular|related`.
   * Default 8. Set `0` to bill only `POST …/youtube/usage` heartbeats.
   */
  readonly youtubeWatchTogetherBrowseCostSec: number;
  readonly isProduction: boolean;
  readonly jwtSecret: string;
  /**
   * HMAC key for local upload token sign/verify (`LOCAL_UPLOAD_TOKEN_SECRET`).
   * Falls back to `jwtSecret` when the env var is absent so existing tokens remain valid.
   */
  readonly localUploadTokenSecret: string;
  /**
   * HMAC key for `echo_guest_uid` / `__Host-echo_guest_uid` binding cookie (independent of raw JWT_SECRET in prod).
   * Set `ECHO_GUEST_BINDING_SECRET`; when unset in dev, derived from JWT_SECRET.
   */
  readonly echoGuestBindingSecret: string;
  /**
   * When true with `NODE_ENV=production`, startup fails if `ECHO_GUEST_BINDING_SECRET` is unset/blank.
   * Defaults to **true** in production; set `ECHO_REQUIRE_GUEST_BINDING_SECRET_IN_PRODUCTION=false`
   * only for deliberate single-process / local smoke stacks (e.g. `npm run prod:serve`), which then
   * derives the binding HMAC key from `JWT_SECRET` like non-production (weaker than an independent secret).
   */
  readonly echoRequireGuestBindingSecretInProduction: boolean;
  readonly jwtExpiresIn: string;
  readonly bcryptSaltRounds: number;
  readonly refreshTokenTtlDays: number;
  readonly authRequireSocketToken: boolean;
  readonly enforceHttps: boolean;
  /** Honor `X-Forwarded-*` only when the API is behind a trusted reverse proxy that strips spoofed headers. */
  readonly trustProxy: boolean;
  /**
   * When true, Helmet omits `Content-Security-Policy` and `Strict-Transport-Security` so the edge
   * proxy can emit them once (avoids duplicate/conflicting headers on `/api/` when the edge adds
   * `add_header` at `server` scope). Most Caddy split-`handle` setups do not need this.
   */
  readonly echoEdgeSecurityHeaders: boolean;
  /**
   * When set, enables `POST /api/v1/system/deploy-countdown` so the VPS launcher can notify all
   * sockets before stopping the stack (`ECHO_DEPLOY_NOTIFY_SECRET`).
   */
  readonly echoDeployNotifySecret: string | null;
  /** S3-compatible uploads (R2/S3). All must be set for presigned PUT. */
  readonly s3UploadBucket: string | null;
  readonly s3UploadRegion: string | null;
  readonly s3UploadAccessKey: string | null;
  readonly s3UploadSecretKey: string | null;
  readonly s3UploadEndpoint: string | null;
  /**
   * Public **read** base URL for browser-visible object URLs (no trailing slash).
   * Presigned PUT still uses {@link s3UploadEndpoint}; set this when the API host is not publicly readable
   * (e.g. Cloudflare R2: `https://pub-<id>.r2.dev` from Settings → Public Development URL).
   */
  readonly s3UploadPublicBaseUrl: string | null;
  /**
   * When true and S3 uploads are configured, presign `publicUrl` and related URLs use same-origin
   * `GET /api/v1/echo/uploads/s3/...` (session cookie) instead of {@link s3UploadPublicBaseUrl}, so
   * `fetch`/canvas can read GIF bytes without R2 GET CORS. Adds API bandwidth vs direct R2 reads.
   */
  readonly echoS3PublicReadThroughApi: boolean;
  /**
   * Absolute base for resolved custom-emoji display URLs (defaults to {@link echoApiPublicUrl}).
   * Used with `/api/v1/echo/public/emojis/{id}`.
   */
  readonly echoEmojiPublicBaseUrl: string;
  /**
   * Direct object CDN host for published emojis (defaults to {@link s3UploadPublicBaseUrl}).
   */
  readonly echoEmojiCdnBaseUrl: string | null;
  /** When true, copy new emoji uploads to `echo/public-emojis/{id}.{ext}` and set `public_cdn_url`. */
  readonly echoEmojiPublishToCdn: boolean;
  /**
   * When S3 is not configured: store uploads on local disk (default `data/echo-local-uploads`).
   * Set `ECHO_LOCAL_UPLOADS=false` to disable and keep presign `503` until S3 is configured.
   */
  readonly echoLocalUploadDir: string | null;
  /**
   * Max raw body size for `PUT /uploads/local/put` (disk mode). Tier limits above this still use presigned
   * URLs, but the PUT handler rejects larger bodies — see `docs/plans/echo-plan-limits-status.md`.
   */
  readonly echoLocalUploadBodyMaxBytes: number;
  /**
   * Raw `ECHO_CSAM_IMAGE_SCAN_MODE`: `off` (default), `dry_run` (log only), `on` (enforce with configured scanners).
   * If `on` but no scanners are configured, the effective mode falls back to `dry_run` with a startup warning.
   */
  readonly echoCsamImageScanMode: 'off' | 'dry_run' | 'on';
  /** Resolved mode after validating scanner configuration. */
  readonly echoCsamImageScanEffective: 'off' | 'dry_run' | 'on';
  /**
   * Optional newline-separated SHA-256 hex list (`#` comments). For tests/auxiliary blocking only;
   * not a substitute for licensed perceptual-hash programs — see `backend/src/services/csamScan/legalPrerequisites.ts`.
   */
  readonly echoCsamSha256BlocklistPath: string | null;
  /**
   * JSON array of argv for an external scanner; include the literal `INPUT_PATH` where the temp file path goes.
   * Exit **0** = pass, **2** = policy match, other = scanner error (see `ECHO_CSAM_FAIL_CLOSED`).
   */
  readonly echoCsamExternalScanCmdArgv: string[] | null;
  readonly echoCsamExternalScanTimeoutMs: number;
  /** When true, scanner errors block the upload; when false, errors are logged and the upload is allowed (fail-open). */
  readonly echoCsamFailClosed: boolean;
  /**
   * Minimum wall-clock interval between blocklist file re-reads (mtime + periodic). `0` disables periodic reload (mtime only).
   */
  readonly echoCsamBlocklistReloadMinutes: number;
  /** When true, image `dedupe/register` recomputes SHA-256 of stored bytes and rejects on mismatch with the client. */
  readonly echoVerifyImageSha256OnRegister: boolean;
  /**
   * When true, `message_failed` FORBIDDEN includes a `diagnostics` object (user, roles, perms, overrides).
   * Default on when not production; set `ECHO_MESSAGE_FAILED_DIAGNOSTICS_TO_CLIENT=false` to disable in dev.
   */
  readonly echoMessageFailedDiagnosticsToClient: boolean;
  /**
   * Enables session diagnostics artifact writing under `.diagnostics/sessions`.
   * Default false to avoid background diagnostics I/O overhead unless actively debugging.
   */
  readonly echoSessionDiagnostics: boolean;
  /**
   * When true, GET /channels/:id/messages runs extra debug COUNT queries before listing.
   * Default false — enable with `ECHO_MESSAGES_LIST_DEBUG_STATS=1` when investigating history gaps.
   */
  readonly echoMessagesListDebugStats: boolean;
  /** Mark presence offline when `updated_at` is older than this many minutes (sweep job). */
  readonly presenceStaleAfterMinutes: number;
  /** Interval for presence stale sweep (ms). 0 disables. */
  readonly presenceSweepIntervalMs: number;
  /**
   * Interval for the LiveKit-truth voice roster reconciliation job (ms). 0 disables.
   * Ensures `echo_voice_participants` cannot drift from LiveKit reality when a webhook
   * is missed or a client crashes. A boot-time reconcile always runs regardless.
   */
  readonly echoVoiceReconcileIntervalMs: number;
  /**
   * `embedded`: HLS drain runs inside the API process (default, local dev).
   * `standalone`: API only enqueues + pg_notify; run `npm run worker:video-hls` separately.
   */
  readonly echoVideoHlsWorker: 'embedded' | 'standalone';
  /**
   * Poll interval for background chat video re-encode after upload (ms). 0 disables.
   * Requires `ffmpeg` on the API or worker host (or `FFMPEG_PATH`).
   */
  readonly echoVideoOptimizeIntervalMs: number;
  /** Max chat video duration (seconds) for HLS transcode. */
  readonly echoVideoHlsMaxDurationS: number;
  /** Max source bytes for HLS transcode. */
  readonly echoVideoHlsMaxInputBytes: number;
  /** ffmpeg thread cap per transcode job. */
  readonly echoFfmpegThreads: number;
  /** Per-job ffmpeg timeout (ms). */
  readonly echoVideoHlsTimeoutMs: number;
  /** Max transcode attempts before marking playback failed. */
  readonly echoVideoHlsMaxAttempts: number;
  /**
   * Poll interval for background mirroring of Discord CDN URLs on imported/synced messages (ms). 0 disables.
   * Requires local upload dir or S3 upload configuration.
   */
  readonly echoDiscordImportMediaMirrorIntervalMs: number;
  /** Max mirror jobs processed per drain tick (interval + post-enqueue kick). */
  readonly echoDiscordImportMediaMirrorBatchSize: number;
  /** Debounce (ms) before running a drain after enqueueing mirror work. */
  readonly echoDiscordImportMediaMirrorKickDebounceMs: number;
  /**
   * Poll interval for chat upload abandonment purge (ms). 0 disables.
   * Deletes S3/local objects past `echo_chat_upload_retention.expires_at`.
   */
  readonly echoChatUploadRetentionIntervalMs: number;
  /** Max rows claimed per chat upload retention purge batch. */
  readonly echoChatUploadRetentionBatchSize: number;
  /** Interval for public status page probes (ms). 0 disables. Default 5 minutes. */
  readonly echoStatusProbeIntervalMs: number;
  /** HTTP(S) URL probed for the web app component (static asset). */
  readonly echoStatusWebProbeUrl: string;
  /** Per-probe timeout for status checks (ms). */
  readonly echoStatusProbeTimeoutMs: number;
  /** Days of UTC daily buckets exposed on GET /api/v1/status. */
  readonly echoStatusHistoryDays: number;
  /** Max chat messages per user per channel per minute (socket). */
  readonly echoSocketMsgPerMinute: number;
  /** Burst: max messages per user per channel within burst window. */
  readonly echoSocketBurstMax: number;
  readonly echoSocketBurstWindowMs: number;
  /** Max inbound socket packets per second per connection (flood guard). */
  readonly echoSocketMaxEventsPerSecond: number;
  /** Client message UUID idempotency window (minutes); older duplicates get `IDEMPOTENCY_EXPIRED`. */
  readonly echoMessageIdempotencyMinutes: number;
  /** Snowflake worker id 0–31 (ADR 002). Must be unique per writer process per datacenter. */
  readonly snowflakeWorkerId: number;
  /** Snowflake datacenter id 0–31 (default 1). */
  readonly snowflakeDatacenterId: number;
  /**
   * After snowflake cutover is stable: stop creating and drop legacy `(channel_id, created_at)` message indexes.
   * Set `ECHO_DROP_LEGACY_MESSAGE_TIMELINE_INDEXES=true` only when no queries need them.
   */
  readonly echoDropLegacyMessageTimelineIndexes: boolean;
  /**
   * Optional replacement partial index for author-scoped scans: `(channel_id, author_id, id)` when legacy author+created_at index is dropped.
   */
  readonly echoCreateMessageAuthorIdIndex: boolean;
  /** Fixed Discord export folder used by the staged Echo import flow. */
  readonly discordImportSourceDir: string;
  /** Directory scanned for `*_{guildId}` export bundles from the Discord export bot. */
  readonly discordExportCollectionsRoot: string;
  /**
   * Max new Discord import pipelines per user per UTC day (counts first-time metadata import per server).
   * 0 disables. Non-production defaults to 0; production defaults to 3 unless `ECHO_DISCORD_IMPORT_MAX_PER_USER_PER_DAY` is set.
   */
  readonly discordImportMaxMetadataStartsPerUserPerDay: number;
  /** Permission bits for OAuth2 bot install URLs (default `8` = Administrator). */
  readonly discordBotInvitePermissionBits: string;
  /** Optional `redirect_uri` for bot install (register in Discord Developer Portal). */
  readonly discordBotInviteRedirectUri: string;
  /** Secret for `POST /api/v1/hooks/discord-bot/export-ready` (Discord export bot). Empty disables the hook. */
  readonly echoDiscordBotWebhookSecret: string;
  /** Same token as the export bot; used to see if the bot is already in a guild before opening the install URL. */
  readonly discordBotToken: string;
  /**
   * Snowflake id of the official Echo community server. When unset, {@link echoOfficialServerVanity}
   * is used to resolve the server (default vanity `echo`).
   */
  readonly echoOfficialServerId: string;
  /** Vanity slug for the official server when {@link echoOfficialServerId} is unset. */
  readonly echoOfficialServerVanity: string;
  /** Top N directory servers (by members) to sample guest auto-joins from. */
  readonly guestDirectoryPoolSize: number;
  /** How many servers a new guest joins from the pool. */
  readonly guestServerSampleCount: number;
  /** Onboarding: max channel messages while `is_guest` before `GUEST_LIMIT` (socket sends). */
  readonly guestMaxTotalMessages: number;
  /** Max new guest mints per IP per rolling hour (cookie resume does not count). */
  readonly guestMintMaxPerIpPerHour: number;
  /** After this many mints from an IP in 24h, require Turnstile (if secret configured). 0 = never. */
  readonly guestMintCaptchaAfterN: number;
  /** Cloudflare Turnstile secret; empty disables verification (captcha never required). */
  readonly turnstileSecretKey: string;
  /** Site key returned to clients when CAPTCHA_REQUIRED (widget). */
  readonly turnstileSiteKey: string;
  /** Failed captcha attempts before temporary mint block. */
  readonly guestCaptchaFailBlockThreshold: number;
  /** How long to block guest mints from IP after too many failed captchas (ms). */
  readonly guestCaptchaFailBlockDurationMs: number;
  /** After socket message rate-limit hit for a guest, block sends for this IP+guest pair (ms). */
  readonly guestAbuseComboBlockMs: number;
  /**
   * When true and {@link authHwidPepper} is non-empty, password registration and new guest mints
   * must include `clientHwid`; at most {@link authHwidMaxAccountsPerHwidIp} distinct accounts per
   * (peppered HWID profile, client IP).
   */
  readonly authHwidAccountCapEnabled: boolean;
  /** Secret mixed into SHA-256 of client HWID before persistence (never expose to clients). */
  readonly authHwidPepper: string;
  /** Max distinct user accounts per (HWID profile, IP) when the cap is active. */
  readonly authHwidMaxAccountsPerHwidIp: number;
  /** Public base URL of the API (verification links in email). Default http://localhost:3000. */
  readonly echoApiPublicUrl: string;
  /**
   * Optional extra pepper for SHA-256 of channel webhook URL tokens at rest.
   * When empty, hashing falls back to {@link jwtSecret}.
   */
  readonly echoChannelWebhookTokenPepper: string;
  /** SPA origin for redirects after email verification (default first CORS origin or localhost:8080). */
  readonly echoAppPublicUrl: string;
  /**
   * Absolute URL for the logo image in HTML transactional mail. When unset,
   * defaults to `{echoAppPublicUrl}/icons/pwa-192.png` if the app URL is HTTP(S).
   */
  readonly echoEmailLogoUrl: string | null;
  /** Optional SMTP host; when unset, outbound email is skipped and links are logged instead. */
  readonly echoSmtpHost: string | null;
  readonly echoSmtpPort: number;
  readonly echoSmtpSecure: boolean;
  readonly echoSmtpUser: string | null;
  readonly echoSmtpPassword: string | null;
  /** From header for transactional mail (e.g. Echo <auth@chat-echo.com>). */
  readonly echoEmailFrom: string;
  /** From header for in-app bug report notifications (separate from auth mail). */
  readonly echoBugReportEmailFrom: string;
  /** Inbox that receives support-form submissions from the marketing site (default public support address). */
  readonly echoSupportEmail: string;
  readonly echoEmailVerificationTokenHours: number;
  readonly echoEmailVerificationResendCooldownSeconds: number;
  /** Telnyx API key; empty = SMS log-only (no outbound). */
  readonly echoTelnyxApiKey: string | null;
  /** E.164 sender number for Telnyx Messages API. */
  readonly echoTelnyxFromNumber: string | null;
  readonly echoSmsOtpTtlMinutes: number;
  readonly echoSmsOtpLength: number;
  readonly echoSmsOtpResendCooldownSeconds: number;
  readonly echoSmsOtpMaxAttempts: number;
  /** HMAC pepper for OTP storage; required in production when Telnyx key is set. */
  readonly echoSmsOtpPepper: string;
  readonly echoSmsSendPerIpPerHour: number;
  readonly echoSmsSendPerUserPerDay: number;
  readonly echoSmsSendPerPhonePerDay: number;
  /** Default region for parsing national-format numbers (ISO 3166-1 alpha-2). */
  readonly echoSmsDefaultRegion: string;
  /** Raw env for 32-byte AES key (hex 64 chars or base64); empty uses dev-derived key when not production. */
  readonly echo2faEncryptionKey: string | null;
  /** HMAC input for recovery code hashes; falls back to SMS pepper or dev default. */
  readonly echo2faRecoveryPepper: string;
  readonly echoTotpIssuer: string;
  /** JWT lifetime for MFA pending token after password (e.g. 5m). */
  readonly echoMfaPendingJwtExpiresIn: string;
  readonly echo2faRecoveryCodeCount: number;
  readonly echoMfaLoginMaxPerIpPer15Min: number;
  /** Discord user OAuth (optional). All three required to enable linking; secret must never be exposed to clients. */
  readonly discordOauthClientId: string;
  readonly discordOauthClientSecret: string;
  readonly discordOauthRedirectUri: string;
  /** Space-separated OAuth2 scopes (`DISCORD_OAUTH_SCOPES` or built-in default). */
  readonly discordOauthScopes: string;
  /** Google user OAuth (optional). */
  readonly googleOauthClientId: string;
  readonly googleOauthClientSecret: string;
  readonly googleOauthRedirectUri: string;
  readonly googleOauthScopes: string;
  /** YouTube channel link OAuth (reuses Google OAuth client; separate redirect + scopes). */
  readonly youtubeOauthRedirectUri: string;
  readonly youtubeOauthScopes: string;
  /**
   * AES-256 key for Discord access/refresh tokens (64 hex or base32-byte base64).
   * Prefer dedicated key so rotation is independent of ECHO_2FA_ENCRYPTION_KEY.
   */
  readonly echoDiscordTokenEncryptionKey: string | null;
  /** ioredis URL for server-side sessions (Option A). Empty = in-memory sessions (single process). */
  readonly redisUrl: string | null;
  /**
   * When true, `requireAuth` accepts `Authorization: Bearer` access JWT in addition to `echo_sid` cookie session.
   * **Off by default.** Bearer tokens cannot be revoked before expiry (unlike cookie sessions),
   * so enable only for API clients / tooling that need it (`AUTH_LEGACY_BEARER=true`).
   */
  readonly authLegacyBearer: boolean;
  /** Delete `auth_login_events` older than this many days (retention job). */
  readonly echoLoginEventsRetentionDays: number;
  /** How often to run login event pruning (ms). 0 disables. */
  readonly echoLoginEventsRetentionIntervalMs: number;
  /** Soft-deleted messages kept in DB this many days before physical purge. */
  readonly echoMessageDeletedComplianceRetentionDays: number;
  /** How often to run message auto-delete + compliance purge (ms). 0 disables. */
  readonly echoMessageAutoDeleteRetentionIntervalMs: number;
  /** WebAuthn RP ID (hostname of the first-party app). */
  readonly echoWebAuthnRpId: string;
  /** WebAuthn allowed origin (SPA `origin`). */
  readonly echoWebAuthnOrigin: string;
  /**
   * When true, `POST /api/v1/auth/guest` may mint or resume guest sessions.
   * **Off by default.** Set `ECHO_GUEST_ACCOUNTS_ENABLED=1` to enable.
   */
  readonly guestAccountsEnabled: boolean;
  /**
   * Auth user ids allowed to list Echo+ pre-launch interest signups
   * (`GET /api/v1/auth/echo-plus-interest/list`). Comma-separated in
   * `ECHO_PLUS_INTEREST_ADMIN_USER_IDS`.
   */
  readonly echoPlusInterestAdminUserIds: readonly string[];
  /**
   * When non-empty, `GET /api/v1/metrics` requires `Authorization: Bearer <token>`.
   * Required in `NODE_ENV=production` (startup fails if unset). Prefer also restricting scrape at the reverse proxy.
   */
  readonly echoMetricsScrapeToken: string | null;
  /**
   * When true, `GET /api/v1/agent/network-diagnostics` is served (Bearer token auth).
   * Off by default; intended for operator/automation access to the in-memory auth/upload
   * diagnostics ring buffer.
   */
  readonly echoAgentNetworkDiagnosticsEnabled: boolean;
  /** Bearer token for `GET /api/v1/agent/network-diagnostics` when enabled (`ECHO_AGENT_NETWORK_DIAG_TOKEN`). */
  readonly echoAgentNetworkDiagnosticsToken: string | null;
  /**
   * When true, `GET /api/v1/health` omits fields useful for recon (`backendStorageMode`, `useMockDb`).
   * Defaults to true in production.
   */
  readonly echoHealthRedact: boolean;
  /**
   * When true with `NODE_ENV=production`, startup fails if `REDIS_URL` is unset
   * (sessions would be in-process only). Defaults to **true** in production; set
   * `ECHO_REQUIRE_REDIS_IN_PRODUCTION=false` only for deliberate single-process deployments.
   */
  readonly echoRequireRedisInProduction: boolean;
  /**
   * When true with `NODE_ENV=production`, startup fails if `ECHO_METRICS_SCRAPE_TOKEN` is unset.
   * Defaults to **true** in production; set `ECHO_REQUIRE_METRICS_SCRAPE_TOKEN_IN_PRODUCTION=false`
   * only for deliberate single-process / local smoke stacks (e.g. `npm run prod:serve`).
   */
  readonly echoRequireMetricsScrapeTokenInProduction: boolean;
  /**
   * When true with `NODE_ENV=production`, startup fails unless HTTPS media URLs and/or an
   * allowlist is configured. Defaults to **true** in production; set
   * `ECHO_REQUIRE_MEDIA_URL_HARDENING_IN_PRODUCTION=false` only for deliberate single-process /
   * local smoke stacks (e.g. `npm run prod:serve`).
   */
  readonly echoRequireMediaUrlHardeningInProduction: boolean;
  /** When true, message/branding media URL validation rejects non-HTTPS URLs (except data: where allowed). */
  readonly echoMediaUrlRequireHttps: boolean;
  /** When non-empty, HTTP(S) media URLs must match one of these hosts (or a subdomain). */
  readonly echoMediaUrlAllowedHosts: readonly string[];
  /** True when all required LiveKit env vars are present (key, secret, public URL). */
  readonly liveKitEnabled: boolean;
  /** Room composite RTMP egress to YouTube (requires LiveKit Egress service). */
  readonly liveKitEgressEnabled: boolean;
  /**
   * Layer 2 voice intelligence (sidecar) is **paused** by default.
   * When false, Echo will not forward webhook events to any sidecar even if a forward URL is present.
   */
  readonly voiceSidecarEnabled: boolean;
  /**
   * Optional Layer 2 sidecar webhook forward URL.
   * When set, the LiveKit webhook receiver forwards the verified webhook envelope as JSON.
   *
   * Example: http://127.0.0.1:3050/ingest/livekit-webhook
   */
  readonly voiceSidecarForwardUrl: string | null;
  /** LiveKit API key for token minting and webhook verification. */
  readonly liveKitApiKey: string;
  /** LiveKit API secret for token minting and webhook verification. */
  readonly liveKitApiSecret: string;
  /** Browser-reachable LiveKit WebSocket URL (e.g. ws://127.0.0.1:7880). */
  readonly liveKitPublicUrl: string;
  /**
   * Lifetime of minted LiveKit join tokens in seconds.
   * Keep short because tokens are bearer credentials and can appear in client-side traces/HAR.
   */
  readonly liveKitJoinTokenTtlSec: number;
  /**
   * When true, LiveKit `active_speakers_changed` webhooks may emit `voice_active_speakers` workspace events.
   * Default false: clients use LiveKit `ActiveSpeakersChanged` only (lower latency, less server fan-out).
   */
  readonly liveKitEmitActiveSpeakersWebhook: boolean;
  /**
   * When true, emit `[Echo:VC:TRACE]` structured logs for voice REST, LiveKit adapter, and webhooks.
   * Default: on in non-production (set `ECHO_VC_VERBOSE_LOG=false` to silence); in production off unless `true`.
   */
  readonly echoVcVerboseLogging: boolean;
}

/**
 * Parses CORS_ORIGIN: single value or comma-separated list.
 * Default `true` reflects the request origin (non-production only). Auth uses `credentials: 'include'` — do not use `*`.
 * In `NODE_ENV=production`, startup fails unless `CORS_ORIGIN` is a non-empty explicit list (see production checks below).
 * Include every UI origin (e.g. Vite `http://localhost:8080` and preview `http://localhost:4173`) when not using the default.
 */
function parseCorsOrigin(): string | string[] | true {
  const raw = process.env.CORS_ORIGIN;
  if (raw === undefined || raw === '*' || raw === '') return true;
  const origins = raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const first = origins[0];
  return origins.length === 1 && first !== undefined ? first : origins;
}

/** Tauri desktop WebView origins; used for CORS merge + `SameSite=None` session cookies. */
function parseEchoDesktopAllowedOrigins(): string[] {
  const raw = process.env.ECHO_DESKTOP_ALLOWED_ORIGINS?.trim();
  if (raw) {
    return raw
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }
  /** Tauri 2 packaged WebViews often use `https://tauri.localhost`; dev may use `http://…`. */
  return [
    'http://tauri.localhost',
    'https://tauri.localhost',
    'tauri://localhost',
  ];
}

function mergeCorsWithDesktop(
  base: string | string[] | true,
  desktop: string[],
): string | string[] | true {
  if (base === true) return true;
  const set = new Set<string>();
  if (typeof base === 'string') set.add(base);
  else for (const o of base) set.add(o);
  for (const o of desktop) set.add(o);
  const merged = [...set];
  return merged.length === 1 && merged[0] !== undefined ? merged[0] : merged;
}

/** Default SPA URL for post-verify redirects when ECHO_APP_PUBLIC_URL is unset. */
function defaultEchoAppPublicUrl(): string {
  const cors = parseCorsOrigin();
  if (typeof cors === 'string' && cors.startsWith('http')) return cors;
  if (Array.isArray(cors) && cors[0]?.startsWith('http')) return cors[0];
  return 'http://localhost:8080';
}

function resolvedEchoAppPublicUrl(): string {
  return process.env.ECHO_APP_PUBLIC_URL?.trim() || defaultEchoAppPublicUrl();
}

/**
 * Discord matches `redirect_uri` to the portal list exactly (encoding/decoding aside).
 * Strip trailing slashes on the path — a common mistake is registering without `/` but
 * setting `.env` with one (or vice versa).
 */
function normalizeDiscordOauthRedirectUri(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  try {
    const u = new URL(t);
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.href;
  } catch {
    return t;
  }
}

function parseBoolean(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined) return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function envS3UploadConfigured(): boolean {
  return !!(
    process.env.ECHO_S3_BUCKET?.trim() &&
    process.env.ECHO_S3_REGION?.trim() &&
    process.env.ECHO_S3_ACCESS_KEY?.trim() &&
    process.env.ECHO_S3_SECRET_KEY?.trim()
  );
}

/** Disk-backed uploads when S3 env is unset; see `echoLocalUploadDir` on `config`. */
function resolveEchoLocalUploadDir(): string | null {
  if (process.env.ECHO_LOCAL_UPLOADS?.trim().toLowerCase() === 'false') {
    return null;
  }
  if (envS3UploadConfigured()) return null;
  const raw = process.env.ECHO_LOCAL_UPLOAD_DIR?.trim();
  if (raw) return path.resolve(raw);
  const backendRoot = repoRoot ? path.join(repoRoot, 'backend') : process.cwd();
  return path.join(backendRoot, 'data', 'echo-local-uploads');
}

export type BackendStorageMode = 'memory' | 'postgres';

function configStderr(message: string): void {
  process.stderr.write(`${message}\n`);
}

function exitBadConfig(message: string): never {
  configStderr(`[echo-config] ${message}`);
  process.exit(1);
}

function normalizeEnvValue(raw: string | undefined): string {
  return (raw ?? '').trim();
}

const MIN_PRODUCTION_SECRET_LENGTH = 32;
const KNOWN_WEAK_PRODUCTION_SECRETS = new Set([
  'dev-insecure-secret',
  'echo-dev-local-discord-bot-webhook',
  'change-me',
  'changeme',
  'password',
  'secret',
  'test',
]);

function isStrongProductionSecret(raw: string | null | undefined): boolean {
  const value = normalizeEnvValue(raw ?? undefined);
  if (value.length < MIN_PRODUCTION_SECRET_LENGTH) return false;
  if (/^(.)\1+$/.test(value)) return false;
  return !KNOWN_WEAK_PRODUCTION_SECRETS.has(value.toLowerCase());
}

function requireStrongProductionSecret(
  label: string,
  raw: string | null | undefined,
): void {
  if (isStrongProductionSecret(raw)) return;
  configStderr(
    `${label} must be set to a strong random value in production (at least ${MIN_PRODUCTION_SECRET_LENGTH} characters, not a built-in default, and not a repeated character).`,
  );
  if (label === 'JWT_SECRET') {
    const value = normalizeEnvValue(raw ?? undefined);
    const len = value.length;
    const rootEnvPath = repoRoot ? path.join(repoRoot, '.env') : null;
    const backendEnvPath = repoRoot
      ? path.join(repoRoot, 'backend', '.env')
      : null;
    const lanPath = repoRoot ? path.join(repoRoot, '.env.lan') : null;
    const hasLan = Boolean(lanPath && fs.existsSync(lanPath));
    const shortHint =
      len > 0 && len < MIN_PRODUCTION_SECRET_LENGTH
        ? ` Value is too short (${len} chars after trim; need at least ${MIN_PRODUCTION_SECRET_LENGTH}). Regenerate, e.g. node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))".`
        : len === 0
          ? ' Value is empty after trim — check .env for stray quotes/whitespace, blank lines in .env.lan, or an empty export in systemd/PM2.'
          : '';
    configStderr(
      `[echo-config] ${label} check: repoRoot=${repoRoot ?? '(not found — .env files skipped)'}, cwd=${process.cwd()}, normalized length=${len}, root .env exists=${Boolean(rootEnvPath && fs.existsSync(rootEnvPath))}, backend .env exists=${Boolean(backendEnvPath && fs.existsSync(backendEnvPath))}, .env.lan exists=${hasLan}.${shortHint}`,
    );
  }
  process.exit(1);
}

function resolveBackendStorageMode(isProduction: boolean): {
  backendStorageMode: BackendStorageMode;
  databaseUrl: string | null;
} {
  const storageRaw = normalizeEnvValue(
    process.env.ECHO_BACKEND_STORAGE,
  ).toLowerCase();
  const dbUrlRaw = normalizeEnvValue(process.env.DATABASE_URL);
  const useMockDbRaw = normalizeEnvValue(process.env.USE_MOCK_DB);
  const authStoreRaw = normalizeEnvValue(
    process.env.ECHO_AUTH_STORE,
  ).toLowerCase();

  const hasDbUrl = dbUrlRaw.length > 0;
  const hasUseMockDb = useMockDbRaw.length > 0;
  const hasAuthStore = authStoreRaw.length > 0;

  if (hasAuthStore) {
    // Time-bomb: don't allow the auth store to be selected independently.
    exitBadConfig(
      'ECHO_AUTH_STORE is deprecated and must not be used. Set ECHO_BACKEND_STORAGE=memory|postgres and remove ECHO_AUTH_STORE.',
    );
  }

  if (storageRaw.length === 0) {
    if (isProduction) {
      exitBadConfig(
        'ECHO_BACKEND_STORAGE is required in production (set to postgres).',
      );
    }
    if (hasDbUrl) {
      exitBadConfig(
        'DATABASE_URL is set but ECHO_BACKEND_STORAGE is not. Refusing to guess. Set ECHO_BACKEND_STORAGE=postgres (or remove DATABASE_URL).',
      );
    }
    // Dev-only: allow an explicit legacy mock toggle to continue working, but only for memory mode.
    if (hasUseMockDb && useMockDbRaw.toLowerCase() === 'false') {
      exitBadConfig(
        'USE_MOCK_DB=false without ECHO_BACKEND_STORAGE is ambiguous and no longer supported. Set ECHO_BACKEND_STORAGE=postgres and DATABASE_URL.',
      );
    }
    if (hasUseMockDb && useMockDbRaw.toLowerCase() !== 'false') {
      configStderr(
        '[echo-config] ECHO_BACKEND_STORAGE is not set; using legacy USE_MOCK_DB to run in memory mode. Set ECHO_BACKEND_STORAGE=memory to be explicit.',
      );
    } else {
      configStderr(
        '[echo-config] ECHO_BACKEND_STORAGE is not set; defaulting backend storage to memory (dev-only). Set ECHO_BACKEND_STORAGE=memory|postgres to be explicit.',
      );
    }
    return { backendStorageMode: 'memory', databaseUrl: null };
  }

  if (storageRaw !== 'memory' && storageRaw !== 'postgres') {
    exitBadConfig(
      `Invalid ECHO_BACKEND_STORAGE=${JSON.stringify(storageRaw)} (expected "memory" or "postgres").`,
    );
  }

  if (storageRaw === 'postgres') {
    if (!hasDbUrl) {
      exitBadConfig('ECHO_BACKEND_STORAGE=postgres requires DATABASE_URL.');
    }
    if (hasUseMockDb && useMockDbRaw.toLowerCase() !== 'false') {
      exitBadConfig(
        'ECHO_BACKEND_STORAGE=postgres conflicts with USE_MOCK_DB=true.',
      );
    }
    return { backendStorageMode: 'postgres', databaseUrl: dbUrlRaw };
  }

  // memory mode
  if (hasDbUrl) {
    exitBadConfig(
      'ECHO_BACKEND_STORAGE=memory conflicts with DATABASE_URL. Remove DATABASE_URL or set ECHO_BACKEND_STORAGE=postgres.',
    );
  }
  if (hasUseMockDb && useMockDbRaw.toLowerCase() === 'false') {
    exitBadConfig(
      'ECHO_BACKEND_STORAGE=memory conflicts with USE_MOCK_DB=false.',
    );
  }
  return { backendStorageMode: 'memory', databaseUrl: null };
}

/**
 * Centralized configuration object for the application.
 * It's populated from environment variables with sensible defaults.
 */
const isProduction = process.env.NODE_ENV === 'production';
const storage = resolveBackendStorageMode(isProduction);
const echoDesktopAllowedOrigins = parseEchoDesktopAllowedOrigins();

/**
 * Local-only default for `POST/GET …/hooks/discord-bot/*` auth. Must match
 * `scripts/dev-discord-bot.mjs` when that script injects env. Never used when
 * `NODE_ENV=production` (set a real `ECHO_DISCORD_BOT_WEBHOOK_SECRET` in prod).
 */
const DEV_DISCORD_BOT_WEBHOOK_SECRET = 'echo-dev-local-discord-bot-webhook';

function resolveEchoGuestBindingSecret(
  prod: boolean,
  jwtSecret: string,
  requireExplicitSecretInProd: boolean,
): string {
  const raw = process.env.ECHO_GUEST_BINDING_SECRET?.trim() ?? '';
  if (raw) return raw;
  if (!prod || !requireExplicitSecretInProd) {
    return createHmac('sha256', jwtSecret)
      .update('echo_guest_binding_derived_v1')
      .digest('hex');
  }
  return '';
}

const resolvedJwtSecret = process.env.JWT_SECRET ?? 'dev-insecure-secret';
const echoRequireGuestBindingSecretInProduction = parseBoolean(
  process.env.ECHO_REQUIRE_GUEST_BINDING_SECRET_IN_PRODUCTION,
  isProduction,
);

/** Parses `ECHO_VIDEO_HLS_WORKER` (`embedded` default, `standalone` for external worker). */
export function parseEchoVideoHlsWorker(
  raw: string | undefined,
): 'embedded' | 'standalone' {
  const v = (raw ?? 'embedded').trim().toLowerCase();
  if (v === 'standalone') return 'standalone';
  if (v === 'embedded' || v === '') return 'embedded';
  throw new Error(
    `Invalid ECHO_VIDEO_HLS_WORKER="${raw}" (expected embedded or standalone)`,
  );
}

function parseEchoCsamImageScanMode(): 'off' | 'dry_run' | 'on' {
  const raw = process.env.ECHO_CSAM_IMAGE_SCAN_MODE?.trim().toLowerCase() ?? '';
  if (raw === 'on' || raw === 'dry_run') return raw;
  return 'off';
}

function parseEchoCsamExternalScanCmdArgv(): string[] | null {
  const raw = process.env.ECHO_CSAM_EXTERNAL_SCAN_CMD?.trim();
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) return null;
    return v.map((s) => String(s));
  } catch {
    return null;
  }
}

const echoCsamImageScanModeResolved = parseEchoCsamImageScanMode();
const echoCsamSha256BlocklistPathResolved =
  process.env.ECHO_CSAM_SHA256_BLOCKLIST_PATH?.trim() || null;
const echoCsamExternalScanCmdArgvResolved = parseEchoCsamExternalScanCmdArgv();
const echoCsamHasConfiguredScanners = Boolean(
  (echoCsamSha256BlocklistPathResolved &&
    echoCsamSha256BlocklistPathResolved.length > 0) ||
  (echoCsamExternalScanCmdArgvResolved &&
    echoCsamExternalScanCmdArgvResolved.length > 0),
);
let echoCsamImageScanEffectiveResolved: 'off' | 'dry_run' | 'on' =
  echoCsamImageScanModeResolved;
if (echoCsamImageScanModeResolved === 'on' && !echoCsamHasConfiguredScanners) {
  echoCsamImageScanEffectiveResolved = 'dry_run';
  if (process.env.ECHO_CONFIG_TEST_ISOLATION !== '1') {
    console.warn(
      '[echo-config] ECHO_CSAM_IMAGE_SCAN_MODE=on requires ECHO_CSAM_SHA256_BLOCKLIST_PATH and/or ECHO_CSAM_EXTERNAL_SCAN_CMD (JSON argv); falling back to dry_run until scanners are configured.',
    );
  }
}

export const config: AppConfig = {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  host: process.env.HOST ?? '0.0.0.0',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  corsOrigin: mergeCorsWithDesktop(
    parseCorsOrigin(),
    echoDesktopAllowedOrigins,
  ),
  echoDesktopAllowedOrigins,
  backendStorageMode: storage.backendStorageMode,
  databaseUrl: storage.databaseUrl,
  natsUrl: process.env.NATS_URL ?? null,
  useMockDb: storage.backendStorageMode === 'memory',
  giphyApiKey: process.env.GIPHY_API_KEY ?? '',
  serperApiKey: process.env.SERPER_API_KEY?.trim() ?? '',
  serperDefaultQuery: process.env.SERPER_DEFAULT_QUERY?.trim() || 'photography',
  serperImageNum: (() => {
    const raw = process.env.SERPER_IMAGE_NUM?.trim();
    const n = raw ? Number(raw) : NaN;
    if (!Number.isFinite(n)) return 20;
    return Math.min(100, Math.max(1, Math.floor(n)));
  })(),
  serperImageMaxPage: (() => {
    const raw = process.env.SERPER_IMAGE_MAX_PAGE?.trim();
    const n = raw ? Number(raw) : NaN;
    if (!Number.isFinite(n)) return 4;
    return Math.min(10, Math.max(1, Math.floor(n)));
  })(),
  serperCacheTtlMs: (() => {
    const raw = process.env.SERPER_CACHE_TTL_MS?.trim();
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= 5_000 ? Math.floor(n) : 600_000;
  })(),
  serperCacheMaxEntries: (() => {
    const raw = process.env.SERPER_CACHE_MAX_ENTRIES?.trim();
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= 16 ? Math.floor(n) : 200;
  })(),
  serperRateLimitPerMinute: (() => {
    const raw = process.env.SERPER_RATE_LIMIT_PER_MINUTE?.trim();
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 10;
  })(),
  serperUpstreamMaxPerDayPerIp: (() => {
    const raw = process.env.SERPER_UPSTREAM_MAX_PER_DAY_PER_IP?.trim();
    const n = raw ? Number(raw) : NaN;
    if (raw === '0') return 0;
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 180;
  })(),
  serperCacheRefreshDays: (() => {
    const raw = process.env.SERPER_CACHE_REFRESH_DAYS?.trim();
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 90;
  })(),
  serperCacheMaxResults: (() => {
    const raw = process.env.SERPER_CACHE_MAX_RESULTS?.trim();
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= 8 ? Math.floor(n) : 60;
  })(),
  serperGlobalMaxPerDay: (() => {
    const raw = process.env.SERPER_GLOBAL_MAX_PER_DAY?.trim();
    const n = raw ? Number(raw) : NaN;
    if (raw === '0') return 0;
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 500;
  })(),
  serperGlobalMaxPerMonth: (() => {
    const raw = process.env.SERPER_GLOBAL_MAX_PER_MONTH?.trim();
    const n = raw ? Number(raw) : NaN;
    if (raw === '0') return 0;
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 10_000;
  })(),
  serperRefreshFailureMaxCount: (() => {
    const raw = process.env.SERPER_REFRESH_FAILURE_MAX_COUNT?.trim();
    const n = raw ? Number(raw) : NaN;
    if (raw === '0') return 0;
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 0;
  })(),
  youtubeDataApiKey: process.env.YOUTUBE_DATA_API_KEY?.trim() ?? '',
  youtubeInvidiousHosts: (() => {
    const raw = process.env.YOUTUBE_INVIDIOUS_HOSTS?.trim();
    if (raw)
      return raw
        .split(',')
        .map((s) => s.trim().replace(/\/$/, ''))
        .filter(Boolean);
    return [
      'https://vid.puffyan.us',
      'https://inv.tux.pizza',
      'https://inv.nadeko.net',
    ];
  })(),
  youtubeWatchTogetherUserBudgetSec: (() => {
    const raw = process.env.YOUTUBE_WATCH_TOGETHER_USER_BUDGET_SEC?.trim();
    const n = raw ? Number(raw) : NaN;
    if (raw === '0') return 0;
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 3 * 3600;
  })(),
  youtubeWatchTogetherGlobalBudgetSec: (() => {
    const raw = process.env.YOUTUBE_WATCH_TOGETHER_GLOBAL_BUDGET_SEC?.trim();
    const n = raw ? Number(raw) : NaN;
    if (raw === '0') return 0;
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 300 * 3600;
  })(),
  youtubeWatchTogetherBrowseCostSec: (() => {
    const raw = process.env.YOUTUBE_WATCH_TOGETHER_BROWSE_COST_SEC?.trim();
    const n = raw ? Number(raw) : NaN;
    if (raw === '0') return 0;
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 8;
  })(),
  isProduction,
  jwtSecret: resolvedJwtSecret,
  localUploadTokenSecret:
    process.env.LOCAL_UPLOAD_TOKEN_SECRET?.trim() || resolvedJwtSecret,
  echoGuestBindingSecret: resolveEchoGuestBindingSecret(
    isProduction,
    resolvedJwtSecret,
    echoRequireGuestBindingSecretInProduction,
  ),
  echoRequireGuestBindingSecretInProduction,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  bcryptSaltRounds: (() => {
    const n = process.env.BCRYPT_SALT_ROUNDS
      ? parseInt(process.env.BCRYPT_SALT_ROUNDS, 10)
      : 10;
    return Number.isFinite(n) && n >= 1 && n <= 20 ? n : 10;
  })(),
  refreshTokenTtlDays: (() => {
    const n = process.env.REFRESH_TOKEN_TTL_DAYS
      ? parseInt(process.env.REFRESH_TOKEN_TTL_DAYS, 10)
      : 30;
    return Number.isFinite(n) && n >= 1 && n <= 365 ? n : 30;
  })(),
  authRequireSocketToken: parseBoolean(
    process.env.AUTH_REQUIRE_SOCKET_TOKEN,
    isProduction || storage.backendStorageMode === 'postgres',
  ),
  enforceHttps: parseBoolean(process.env.ENFORCE_HTTPS, isProduction),
  trustProxy: parseBoolean(process.env.ECHO_TRUST_PROXY, false),
  echoEdgeSecurityHeaders: parseBoolean(
    process.env.ECHO_EDGE_SECURITY_HEADERS,
    false,
  ),
  echoDeployNotifySecret: (() => {
    const raw = process.env.ECHO_DEPLOY_NOTIFY_SECRET?.trim() ?? '';
    return raw.length > 0 ? raw : null;
  })(),
  s3UploadBucket: process.env.ECHO_S3_BUCKET?.trim() || null,
  s3UploadRegion: process.env.ECHO_S3_REGION?.trim() || null,
  s3UploadAccessKey: process.env.ECHO_S3_ACCESS_KEY?.trim() || null,
  s3UploadSecretKey: process.env.ECHO_S3_SECRET_KEY?.trim() || null,
  s3UploadEndpoint: process.env.ECHO_S3_ENDPOINT?.trim() || null,
  s3UploadPublicBaseUrl: process.env.ECHO_S3_PUBLIC_BASE_URL?.trim() || null,
  echoS3PublicReadThroughApi: parseBoolean(
    process.env.ECHO_S3_PUBLIC_READ_THROUGH_API,
    false,
  ),
  echoEmojiPublicBaseUrl: (() => {
    const raw = process.env.ECHO_EMOJI_PUBLIC_BASE_URL?.trim();
    if (raw) return raw.replace(/\/$/, '');
    return (
      process.env.ECHO_API_PUBLIC_URL?.trim() || 'http://localhost:3000'
    ).replace(/\/$/, '');
  })(),
  echoEmojiCdnBaseUrl: (() => {
    const raw = process.env.ECHO_EMOJI_CDN_BASE_URL?.trim();
    if (raw) return raw.replace(/\/$/, '');
    return (
      process.env.ECHO_S3_PUBLIC_BASE_URL?.trim()?.replace(/\/$/, '') || null
    );
  })(),
  echoEmojiPublishToCdn: parseBoolean(
    process.env.ECHO_EMOJI_PUBLISH_TO_CDN,
    false,
  ),
  echoLocalUploadDir: resolveEchoLocalUploadDir(),
  echoLocalUploadBodyMaxBytes: (() => {
    const raw = process.env.ECHO_LOCAL_UPLOAD_MAX_BYTES;
    if (raw === undefined || raw === '') return 256 * 1024 * 1024;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) &&
      n >= 1 * 1024 * 1024 &&
      n <= 8 * 1024 * 1024 * 1024
      ? n
      : 256 * 1024 * 1024;
  })(),
  echoCsamImageScanMode: echoCsamImageScanModeResolved,
  echoCsamImageScanEffective: echoCsamImageScanEffectiveResolved,
  echoCsamSha256BlocklistPath: echoCsamSha256BlocklistPathResolved,
  echoCsamExternalScanCmdArgv: echoCsamExternalScanCmdArgvResolved,
  echoCsamExternalScanTimeoutMs: (() => {
    const raw = process.env.ECHO_CSAM_EXTERNAL_SCAN_TIMEOUT_MS?.trim();
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n >= 1000 && n <= 900_000 ? n : 120_000;
  })(),
  echoCsamFailClosed: parseBoolean(process.env.ECHO_CSAM_FAIL_CLOSED, false),
  echoCsamBlocklistReloadMinutes: (() => {
    const raw = process.env.ECHO_CSAM_BLOCKLIST_RELOAD_MINUTES?.trim();
    if (raw === undefined || raw === '') return 60;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 && n <= 24 * 60 ? n : 60;
  })(),
  echoVerifyImageSha256OnRegister: parseBoolean(
    process.env.ECHO_VERIFY_IMAGE_SHA256_ON_REGISTER,
    true,
  ),
  echoMessageFailedDiagnosticsToClient:
    !isProduction &&
    storage.backendStorageMode === 'memory' &&
    parseBoolean(process.env.ECHO_MESSAGE_FAILED_DIAGNOSTICS_TO_CLIENT, true),
  echoSessionDiagnostics: parseBoolean(
    process.env.ECHO_SESSION_DIAGNOSTICS,
    false,
  ),
  echoMessagesListDebugStats: parseBoolean(
    process.env.ECHO_MESSAGES_LIST_DEBUG_STATS,
    false,
  ),
  presenceStaleAfterMinutes: (() => {
    const raw = process.env.ECHO_PRESENCE_STALE_MINUTES;
    if (raw === undefined) return 5;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : 5;
  })(),
  presenceSweepIntervalMs: (() => {
    const raw = process.env.ECHO_PRESENCE_SWEEP_MS;
    if (raw === undefined) return 60000;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 60000;
  })(),
  echoVoiceReconcileIntervalMs: (() => {
    const raw = process.env.ECHO_VOICE_RECONCILE_INTERVAL_MS;
    if (raw === undefined || raw === '') return 30_000;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 30_000;
  })(),
  echoVideoHlsWorker: parseEchoVideoHlsWorker(
    process.env.ECHO_VIDEO_HLS_WORKER,
  ),
  echoVideoOptimizeIntervalMs: (() => {
    const raw = process.env.ECHO_VIDEO_OPTIMIZE_MS;
    if (raw === undefined) return 15000;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 15000;
  })(),
  echoVideoHlsMaxDurationS: (() => {
    const raw = process.env.ECHO_VIDEO_HLS_MAX_DURATION_S;
    if (raw === undefined) return 600;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : 600;
  })(),
  echoVideoHlsMaxInputBytes: (() => {
    const raw = process.env.ECHO_VIDEO_HLS_MAX_INPUT_BYTES;
    const fallback = 120 * 1024 * 1024;
    if (raw === undefined || raw === '') return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : fallback;
  })(),
  echoFfmpegThreads: (() => {
    const raw = process.env.ECHO_FFMPEG_THREADS;
    if (raw === undefined) return 2;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : 2;
  })(),
  echoVideoHlsTimeoutMs: (() => {
    const raw = process.env.ECHO_VIDEO_HLS_TIMEOUT_MS;
    if (raw === undefined) return 900_000;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : 900_000;
  })(),
  echoVideoHlsMaxAttempts: (() => {
    const raw = process.env.ECHO_VIDEO_HLS_MAX_ATTEMPTS;
    if (raw === undefined) return 3;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : 3;
  })(),
  echoDiscordImportMediaMirrorIntervalMs: (() => {
    const raw = process.env.ECHO_DISCORD_IMPORT_MEDIA_MIRROR_MS;
    if (raw === undefined) return 2000;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 2000;
  })(),
  echoDiscordImportMediaMirrorBatchSize: (() => {
    const raw = process.env.ECHO_DISCORD_IMPORT_MEDIA_MIRROR_BATCH_SIZE;
    if (raw === undefined) return 6;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : 6;
  })(),
  echoDiscordImportMediaMirrorKickDebounceMs: (() => {
    const raw = process.env.ECHO_DISCORD_IMPORT_MEDIA_MIRROR_KICK_DEBOUNCE_MS;
    if (raw === undefined) return 50;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 50;
  })(),
  echoChatUploadRetentionIntervalMs: (() => {
    const raw = process.env.ECHO_CHAT_UPLOAD_RETENTION_INTERVAL_MS;
    if (raw === undefined || raw === '') return 60 * 60 * 1000;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 60 * 60 * 1000;
  })(),
  echoChatUploadRetentionBatchSize: (() => {
    const raw = process.env.ECHO_CHAT_UPLOAD_RETENTION_BATCH_SIZE;
    if (raw === undefined || raw === '') return 200;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 && n <= 500 ? n : 200;
  })(),
  echoStatusProbeIntervalMs: (() => {
    const raw = process.env.ECHO_STATUS_PROBE_INTERVAL_MS;
    if (raw === undefined || raw === '') return 300_000;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 300_000;
  })(),
  echoStatusWebProbeUrl: (() => {
    const raw = process.env.ECHO_STATUS_WEB_PROBE_URL?.trim();
    if (raw) return raw;
    return 'https://chat-echo.com/favicon.svg';
  })(),
  echoStatusProbeTimeoutMs: (() => {
    const raw = process.env.ECHO_STATUS_PROBE_TIMEOUT_MS;
    if (raw === undefined || raw === '') return 12_000;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1000 ? n : 12_000;
  })(),
  echoStatusHistoryDays: (() => {
    const raw = process.env.ECHO_STATUS_HISTORY_DAYS;
    if (raw === undefined || raw === '') return 90;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 7 && n <= 366 ? n : 90;
  })(),
  echoSocketMsgPerMinute: (() => {
    const raw = process.env.ECHO_SOCKET_MSG_PER_MINUTE;
    if (raw === undefined) return 60;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : 60;
  })(),
  echoSocketBurstMax: (() => {
    const raw = process.env.ECHO_SOCKET_BURST_MAX;
    if (raw === undefined) return 20;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : 20;
  })(),
  echoSocketBurstWindowMs: (() => {
    const raw = process.env.ECHO_SOCKET_BURST_WINDOW_MS;
    if (raw === undefined) return 2000;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 100 ? n : 2000;
  })(),
  echoSocketMaxEventsPerSecond: (() => {
    const raw = process.env.ECHO_SOCKET_MAX_EVENTS_PER_SEC;
    if (raw === undefined) return 80;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : 80;
  })(),
  echoMessageIdempotencyMinutes: (() => {
    const raw = process.env.ECHO_MESSAGE_IDEMPOTENCY_MINUTES;
    if (raw === undefined) return 10;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : 10;
  })(),
  snowflakeWorkerId: (() => {
    const raw = process.env.SNOWFLAKE_WORKER_ID;
    if (raw === undefined || raw === '') return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 && n <= 31 ? n : 0;
  })(),
  snowflakeDatacenterId: (() => {
    const raw = process.env.SNOWFLAKE_DATACENTER_ID;
    if (raw === undefined || raw === '') return 1;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 && n <= 31 ? n : 1;
  })(),
  echoDropLegacyMessageTimelineIndexes: parseBoolean(
    process.env.ECHO_DROP_LEGACY_MESSAGE_TIMELINE_INDEXES,
    false,
  ),
  echoCreateMessageAuthorIdIndex: parseBoolean(
    process.env.ECHO_CREATE_MESSAGE_AUTHOR_ID_INDEX,
    false,
  ),
  discordImportSourceDir:
    process.env.ECHO_DISCORD_IMPORT_SOURCE_DIR?.trim() ||
    path.resolve(__dirname, '../../bot/exports/MTI_1347559142100832298'),
  discordExportCollectionsRoot:
    process.env.ECHO_DISCORD_EXPORTS_ROOT?.trim() ||
    path.resolve(__dirname, '../../bot/exports'),
  discordImportMaxMetadataStartsPerUserPerDay: (() => {
    const raw = process.env.ECHO_DISCORD_IMPORT_MAX_PER_USER_PER_DAY;
    if (raw === undefined || raw === '') {
      return isProduction ? 3 : 0;
    }
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return isProduction ? 3 : 0;
    return n;
  })(),
  discordBotInvitePermissionBits:
    process.env.DISCORD_BOT_INVITE_PERMISSIONS?.trim() || '8',
  discordBotInviteRedirectUri:
    process.env.DISCORD_BOT_INVITE_REDIRECT_URI?.trim() || '',
  echoDiscordBotWebhookSecret: (() => {
    const raw = process.env.ECHO_DISCORD_BOT_WEBHOOK_SECRET?.trim() ?? '';
    if (raw) return raw;
    if (!isProduction) return DEV_DISCORD_BOT_WEBHOOK_SECRET;
    return '';
  })(),
  discordBotToken: process.env.DISCORD_BOT_TOKEN?.trim() || '',
  echoOfficialServerId: process.env.ECHO_OFFICIAL_SERVER_ID?.trim() || '',
  echoOfficialServerVanity: (() => {
    const raw = process.env.ECHO_OFFICIAL_SERVER_VANITY?.trim();
    if (raw === undefined || raw === '') return 'echo';
    return raw.toLowerCase();
  })(),
  guestDirectoryPoolSize: (() => {
    const raw = process.env.ECHO_GUEST_DIRECTORY_POOL_SIZE;
    if (raw === undefined) return 15;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 3 ? Math.min(n, 50) : 15;
  })(),
  guestServerSampleCount: (() => {
    const raw = process.env.ECHO_GUEST_SERVER_SAMPLE_COUNT;
    if (raw === undefined) return 3;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 10) : 3;
  })(),
  guestMaxTotalMessages: (() => {
    const raw = process.env.ECHO_GUEST_MAX_TOTAL_MESSAGES;
    if (raw === undefined) return 300;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 10 ? n : 300;
  })(),
  guestMintMaxPerIpPerHour: (() => {
    const raw = process.env.ECHO_GUEST_MINT_MAX_PER_IP_HOUR;
    if (raw === undefined) return 12;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 200) : 12;
  })(),
  guestMintCaptchaAfterN: (() => {
    const raw = process.env.ECHO_GUEST_MINT_CAPTCHA_AFTER_N;
    if (raw === undefined) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? Math.min(n, 500) : 0;
  })(),
  turnstileSecretKey: process.env.ECHO_TURNSTILE_SECRET_KEY?.trim() ?? '',
  turnstileSiteKey: process.env.ECHO_TURNSTILE_SITE_KEY?.trim() ?? '',
  guestCaptchaFailBlockThreshold: (() => {
    const raw = process.env.ECHO_GUEST_CAPTCHA_FAIL_BLOCK_THRESHOLD;
    if (raw === undefined) return 5;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 50) : 5;
  })(),
  guestCaptchaFailBlockDurationMs: (() => {
    const raw = process.env.ECHO_GUEST_CAPTCHA_FAIL_BLOCK_HOURS;
    if (raw === undefined) return 24 * 60 * 60 * 1000;
    const h = parseFloat(raw);
    return Number.isFinite(h) && h > 0
      ? Math.round(h * 60 * 60 * 1000)
      : 24 * 60 * 60 * 1000;
  })(),
  guestAbuseComboBlockMs: (() => {
    const raw = process.env.ECHO_GUEST_ABUSE_COMBO_BLOCK_MINUTES;
    if (raw === undefined) return 30 * 60 * 1000;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1
      ? Math.min(n, 24 * 60) * 60 * 1000
      : 30 * 60 * 1000;
  })(),
  authHwidAccountCapEnabled: parseBoolean(
    process.env.ECHO_AUTH_HWID_ACCOUNT_CAP,
    false,
  ),
  authHwidPepper: process.env.ECHO_AUTH_HWID_PEPPER?.trim() ?? '',
  authHwidMaxAccountsPerHwidIp: (() => {
    const raw = process.env.ECHO_AUTH_HWID_MAX_ACCOUNTS_PER_KEY_IP;
    if (raw === undefined || raw === '') return 3;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 50) : 3;
  })(),
  echoApiPublicUrl:
    process.env.ECHO_API_PUBLIC_URL?.trim() || 'http://localhost:3000',
  echoChannelWebhookTokenPepper:
    process.env.ECHO_CHANNEL_WEBHOOK_TOKEN_PEPPER?.trim() ?? '',
  echoAppPublicUrl: resolvedEchoAppPublicUrl(),
  echoEmailLogoUrl: (() => {
    const raw = process.env.ECHO_EMAIL_LOGO_URL?.trim();
    if (raw) return raw;
    const base = resolvedEchoAppPublicUrl().replace(/\/$/, '');
    if (!base.toLowerCase().startsWith('http')) return null;
    return `${base}/icons/pwa-192.png`;
  })(),
  echoSmtpHost: process.env.ECHO_SMTP_HOST?.trim() || null,
  echoSmtpPort: (() => {
    const raw = process.env.ECHO_SMTP_PORT;
    if (raw === undefined || raw === '') return 587;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 && n <= 65535 ? n : 587;
  })(),
  echoSmtpSecure: parseBoolean(process.env.ECHO_SMTP_SECURE, false),
  echoSmtpUser: process.env.ECHO_SMTP_USER?.trim() || null,
  echoSmtpPassword: process.env.ECHO_SMTP_PASSWORD ?? null,
  echoEmailFrom:
    process.env.ECHO_EMAIL_FROM?.trim() || 'Echo <noreply@localhost>',
  echoBugReportEmailFrom:
    process.env.ECHO_BUG_REPORT_EMAIL_FROM?.trim() ||
    'Echo Bugs <bugs@chat-echo.com>',
  echoSupportEmail:
    process.env.ECHO_SUPPORT_EMAIL?.trim() || 'support@app-echo.net',
  echoEmailVerificationTokenHours: (() => {
    const raw = process.env.ECHO_EMAIL_VERIFICATION_TOKEN_HOURS;
    if (raw === undefined || raw === '') return 48;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 && n <= 720 ? n : 48;
  })(),
  echoEmailVerificationResendCooldownSeconds: (() => {
    const raw = process.env.ECHO_EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS;
    if (raw === undefined || raw === '') return 60;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 10 && n <= 3600 ? n : 60;
  })(),
  echoTelnyxApiKey: process.env.ECHO_TELNYX_API_KEY?.trim() || null,
  echoTelnyxFromNumber: process.env.ECHO_TELNYX_FROM_NUMBER?.trim() || null,
  echoSmsOtpTtlMinutes: (() => {
    const raw = process.env.ECHO_SMS_OTP_TTL_MINUTES;
    if (raw === undefined || raw === '') return 10;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 && n <= 60 ? n : 10;
  })(),
  echoSmsOtpLength: (() => {
    const raw = process.env.ECHO_SMS_OTP_LENGTH;
    if (raw === undefined || raw === '') return 6;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 4 && n <= 8 ? n : 6;
  })(),
  echoSmsOtpResendCooldownSeconds: (() => {
    const raw = process.env.ECHO_SMS_OTP_RESEND_COOLDOWN_SECONDS;
    if (raw === undefined || raw === '') return 60;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 10 && n <= 3600 ? n : 60;
  })(),
  echoSmsOtpMaxAttempts: (() => {
    const raw = process.env.ECHO_SMS_OTP_MAX_ATTEMPTS;
    if (raw === undefined || raw === '') return 5;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 3 && n <= 20 ? n : 5;
  })(),
  echoSmsOtpPepper: process.env.ECHO_SMS_OTP_PEPPER ?? '',
  echoSmsSendPerIpPerHour: (() => {
    const raw = process.env.ECHO_SMS_SEND_PER_IP_PER_HOUR;
    if (raw === undefined || raw === '') return 20;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 && n <= 500 ? n : 20;
  })(),
  echoSmsSendPerUserPerDay: (() => {
    const raw = process.env.ECHO_SMS_SEND_PER_USER_PER_DAY;
    if (raw === undefined || raw === '') return 15;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 && n <= 200 ? n : 15;
  })(),
  echoSmsSendPerPhonePerDay: (() => {
    const raw = process.env.ECHO_SMS_SEND_PER_PHONE_PER_DAY;
    if (raw === undefined || raw === '') return 8;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 && n <= 100 ? n : 8;
  })(),
  echoSmsDefaultRegion:
    process.env.ECHO_SMS_DEFAULT_REGION?.trim().toUpperCase() || 'US',
  echo2faEncryptionKey: process.env.ECHO_2FA_ENCRYPTION_KEY?.trim() || null,
  echo2faRecoveryPepper:
    process.env.ECHO_2FA_RECOVERY_PEPPER?.trim() ||
    process.env.ECHO_SMS_OTP_PEPPER?.trim() ||
    'dev-echo-2fa-recovery-pepper',
  echoTotpIssuer: process.env.ECHO_TOTP_ISSUER?.trim() || 'Echo',
  echoMfaPendingJwtExpiresIn:
    process.env.ECHO_MFA_PENDING_JWT_EXPIRES_IN?.trim() || '5m',
  echo2faRecoveryCodeCount: (() => {
    const raw = process.env.ECHO_2FA_RECOVERY_CODE_COUNT;
    if (raw === undefined || raw === '') return 10;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 5 && n <= 20 ? n : 10;
  })(),
  echoMfaLoginMaxPerIpPer15Min: (() => {
    const raw = process.env.ECHO_MFA_LOGIN_MAX_PER_IP_PER_15MIN;
    if (raw === undefined || raw === '') return 60;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 10 && n <= 500 ? n : 60;
  })(),
  discordOauthClientId: process.env.DISCORD_OAUTH_CLIENT_ID?.trim() ?? '',
  discordOauthClientSecret:
    process.env.DISCORD_OAUTH_CLIENT_SECRET?.trim() ?? '',
  discordOauthRedirectUri: normalizeDiscordOauthRedirectUri(
    process.env.DISCORD_OAUTH_REDIRECT_URI ?? '',
  ),
  discordOauthScopes:
    process.env.DISCORD_OAUTH_SCOPES?.trim() || DEFAULT_DISCORD_OAUTH_SCOPES,
  googleOauthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? '',
  googleOauthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? '',
  googleOauthRedirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() ?? '',
  googleOauthScopes:
    process.env.GOOGLE_OAUTH_SCOPES?.trim() || DEFAULT_GOOGLE_OAUTH_SCOPES,
  youtubeOauthRedirectUri: process.env.YOUTUBE_OAUTH_REDIRECT_URI?.trim() ?? '',
  youtubeOauthScopes:
    process.env.YOUTUBE_OAUTH_SCOPES?.trim() || DEFAULT_YOUTUBE_OAUTH_SCOPES,
  echoDiscordTokenEncryptionKey:
    process.env.ECHO_DISCORD_TOKEN_ENCRYPTION_KEY?.trim() || null,
  redisUrl: process.env.REDIS_URL?.trim() || null,
  authLegacyBearer: parseBoolean(process.env.AUTH_LEGACY_BEARER, false),
  echoLoginEventsRetentionDays: (() => {
    const raw = process.env.ECHO_LOGIN_EVENTS_RETENTION_DAYS;
    if (raw === undefined || raw === '') return 90;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 7 && n <= 730 ? n : 90;
  })(),
  echoLoginEventsRetentionIntervalMs: (() => {
    const raw = process.env.ECHO_LOGIN_EVENTS_RETENTION_INTERVAL_MS;
    if (raw === undefined || raw === '') return 24 * 60 * 60 * 1000;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 60_000 ? n : 24 * 60 * 60 * 1000;
  })(),
  echoMessageDeletedComplianceRetentionDays: (() => {
    const raw = process.env.ECHO_MESSAGE_DELETED_COMPLIANCE_RETENTION_DAYS;
    if (raw === undefined || raw === '') return 14;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 && n <= 90 ? n : 14;
  })(),
  echoMessageAutoDeleteRetentionIntervalMs: (() => {
    const raw = process.env.ECHO_MESSAGE_AUTO_DELETE_RETENTION_INTERVAL_MS;
    if (raw === undefined || raw === '') return 60 * 60 * 1000;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 60_000 ? n : 60 * 60 * 1000;
  })(),
  echoWebAuthnRpId: (() => {
    try {
      return new URL(resolvedEchoAppPublicUrl()).hostname;
    } catch {
      return 'localhost';
    }
  })(),
  echoWebAuthnOrigin: (() => {
    try {
      return new URL(resolvedEchoAppPublicUrl()).origin;
    } catch {
      return 'http://localhost:8080';
    }
  })(),
  guestAccountsEnabled: parseBoolean(
    process.env.ECHO_GUEST_ACCOUNTS_ENABLED,
    false,
  ),
  echoPlusInterestAdminUserIds: (
    process.env.ECHO_PLUS_INTEREST_ADMIN_USER_IDS ?? ''
  )
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
  echoMetricsScrapeToken: process.env.ECHO_METRICS_SCRAPE_TOKEN?.trim() || null,
  echoAgentNetworkDiagnosticsEnabled: parseBoolean(
    process.env.ECHO_AGENT_NETWORK_DIAG_ENABLED,
    false,
  ),
  echoAgentNetworkDiagnosticsToken:
    process.env.ECHO_AGENT_NETWORK_DIAG_TOKEN?.trim() || null,
  echoHealthRedact: parseBoolean(
    process.env.ECHO_HEALTH_REDACT,
    isProduction || storage.backendStorageMode === 'postgres',
  ),
  echoRequireRedisInProduction: parseBoolean(
    process.env.ECHO_REQUIRE_REDIS_IN_PRODUCTION,
    isProduction,
  ),
  echoRequireMetricsScrapeTokenInProduction: parseBoolean(
    process.env.ECHO_REQUIRE_METRICS_SCRAPE_TOKEN_IN_PRODUCTION,
    isProduction || storage.backendStorageMode === 'postgres',
  ),
  echoRequireMediaUrlHardeningInProduction: parseBoolean(
    process.env.ECHO_REQUIRE_MEDIA_URL_HARDENING_IN_PRODUCTION,
    isProduction,
  ),
  echoMediaUrlRequireHttps: parseBoolean(
    process.env.ECHO_MEDIA_URL_REQUIRE_HTTPS,
    false,
  ),
  echoMediaUrlAllowedHosts: (() => {
    const raw = process.env.ECHO_MEDIA_URL_ALLOWED_HOSTS?.trim() ?? '';
    if (!raw.length) return [];
    return Object.freeze(
      raw
        .split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean),
    );
  })(),
  liveKitApiKey: process.env.LIVEKIT_API_KEY?.trim() ?? '',
  liveKitApiSecret: process.env.LIVEKIT_API_SECRET?.trim() ?? '',
  liveKitPublicUrl: process.env.LIVEKIT_PUBLIC_URL?.trim() ?? '',
  liveKitJoinTokenTtlSec: (() => {
    const raw = process.env.LIVEKIT_JOIN_TOKEN_TTL_SEC;
    if (raw === undefined || raw === '') return 120;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 60 && n <= 3600 ? n : 120;
  })(),
  liveKitEnabled: !!(
    process.env.LIVEKIT_API_KEY?.trim() &&
    process.env.LIVEKIT_API_SECRET?.trim() &&
    process.env.LIVEKIT_PUBLIC_URL?.trim()
  ),
  liveKitEgressEnabled: (() => {
    const liveKitOn = !!(
      process.env.LIVEKIT_API_KEY?.trim() &&
      process.env.LIVEKIT_API_SECRET?.trim() &&
      process.env.LIVEKIT_PUBLIC_URL?.trim()
    );
    return parseBoolean(process.env.LIVEKIT_EGRESS_ENABLED, liveKitOn);
  })(),
  voiceSidecarEnabled: parseBoolean(process.env.VOICE_SIDECAR_ENABLED, false),
  voiceSidecarForwardUrl: process.env.VOICE_SIDECAR_FORWARD_URL?.trim() || null,
  liveKitEmitActiveSpeakersWebhook:
    process.env.LIVEKIT_EMIT_ACTIVE_SPEAKERS_WEBHOOK?.trim().toLowerCase() ===
    'true',
  echoVcVerboseLogging: (() => {
    const raw = process.env.ECHO_VC_VERBOSE_LOG?.trim().toLowerCase();
    if (raw === 'true' || raw === '1' || raw === 'yes') return true;
    if (raw === 'false' || raw === '0' || raw === 'no') return false;
    return process.env.NODE_ENV !== 'production';
  })(),
};

// It's a good practice to validate critical configuration variables
// to prevent the application from starting in a misconfigured state.
if (isNaN(config.port)) {
  configStderr(
    `Invalid PORT specified: ${process.env.PORT}. It must be a number.`,
  );
  process.exit(1);
}

if (
  isNaN(config.bcryptSaltRounds) ||
  config.bcryptSaltRounds < 4 ||
  config.bcryptSaltRounds > 15
) {
  configStderr(
    `Invalid BCRYPT_SALT_ROUNDS specified: ${process.env.BCRYPT_SALT_ROUNDS}. Use an integer between 4 and 15.`,
  );
  process.exit(1);
}

if (isNaN(config.refreshTokenTtlDays) || config.refreshTokenTtlDays < 1) {
  configStderr(
    `Invalid REFRESH_TOKEN_TTL_DAYS specified: ${process.env.REFRESH_TOKEN_TTL_DAYS}. Use an integer >= 1.`,
  );
  process.exit(1);
}

if (
  config.snowflakeWorkerId < 0 ||
  config.snowflakeWorkerId > 31 ||
  config.snowflakeDatacenterId < 0 ||
  config.snowflakeDatacenterId > 31
) {
  configStderr(
    'Invalid SNOWFLAKE_WORKER_ID or SNOWFLAKE_DATACENTER_ID: each must be an integer 0–31.',
  );
  process.exit(1);
}

if (config.isProduction) {
  const productionGateInput: EchoProductionConfigGateInput = {
    isProduction: config.isProduction,
    backendStorageMode: config.backendStorageMode,
    jwtSecret: config.jwtSecret,
    echoRequireGuestBindingSecretInProduction:
      config.echoRequireGuestBindingSecretInProduction,
    echoGuestBindingSecret: config.echoGuestBindingSecret,
    databaseUrl: config.databaseUrl,
    echoTelnyxApiKey: config.echoTelnyxApiKey,
    echoSmsOtpPepper: config.echoSmsOtpPepper,
    echo2faEncryptionKey: config.echo2faEncryptionKey,
    authLegacyBearer: config.authLegacyBearer,
    echoRequireRedisInProduction: config.echoRequireRedisInProduction,
    redisUrl: config.redisUrl,
    echoLocalUploadDir: config.echoLocalUploadDir,
    localUploadTokenSecret: config.localUploadTokenSecret,
    echoDiscordBotWebhookSecret: config.echoDiscordBotWebhookSecret,
    echoRequireMetricsScrapeTokenInProduction:
      config.echoRequireMetricsScrapeTokenInProduction,
    echoMetricsScrapeToken: config.echoMetricsScrapeToken,
    echoAgentNetworkDiagnosticsEnabled:
      config.echoAgentNetworkDiagnosticsEnabled,
    echoAgentNetworkDiagnosticsToken: config.echoAgentNetworkDiagnosticsToken,
    echoRequireMediaUrlHardeningInProduction:
      config.echoRequireMediaUrlHardeningInProduction,
    echoMediaUrlRequireHttps: config.echoMediaUrlRequireHttps,
    echoMediaUrlAllowedHosts: config.echoMediaUrlAllowedHosts,
    liveKitEnabled: config.liveKitEnabled,
    liveKitPublicUrl: config.liveKitPublicUrl,
    voiceSidecarEnabled: config.voiceSidecarEnabled,
  };
  assertEchoProductionConfigGates(productionGateInput, {
    configStderr,
    exitProcess: (code) => process.exit(code),
    requireStrongProductionSecret,
    isStrongProductionSecret,
    normalizeEnvValue,
    minProductionSecretLength: MIN_PRODUCTION_SECRET_LENGTH,
    devDiscordBotWebhookSecret: DEV_DISCORD_BOT_WEBHOOK_SECRET,
  });
}

if (
  !config.isProduction &&
  config.backendStorageMode === 'postgres' &&
  !isStrongProductionSecret(config.jwtSecret)
) {
  configStderr(
    `JWT_SECRET must be a strong random value when ECHO_BACKEND_STORAGE=postgres outside pure in-memory dev (at least ${MIN_PRODUCTION_SECRET_LENGTH} characters; built-in defaults like dev-insecure-secret are not permitted).`,
  );
  process.exit(1);
}

function collectConfiguredOrigins(
  corsOrigin: typeof config.corsOrigin,
): Set<string> {
  if (corsOrigin === true) return new Set();
  if (typeof corsOrigin === 'string') return new Set([corsOrigin]);
  return new Set(corsOrigin);
}

function validateDeployPublicUrlOrigins(): void {
  const allowed = collectConfiguredOrigins(config.corsOrigin);
  if (allowed.size === 0) return;
  const urls = [
    ['ECHO_APP_PUBLIC_URL', config.echoAppPublicUrl],
    ['ECHO_API_PUBLIC_URL', config.echoApiPublicUrl],
  ] as const;
  for (const [label, raw] of urls) {
    const trimmed = normalizeEnvValue(raw);
    if (!trimmed) {
      exitBadConfig(`${label} must be set to a valid absolute URL.`);
    }
    let origin: string;
    try {
      origin = new URL(trimmed).origin;
    } catch {
      exitBadConfig(`${label} must be a valid absolute URL.`);
      return;
    }
    if (!allowed.has(origin)) {
      exitBadConfig(
        `${label} origin ${origin} must be included in CORS_ORIGIN allowlist to prevent open-redirect style OAuth and email flows.`,
      );
    }
  }
}

if (config.isProduction || config.backendStorageMode === 'postgres') {
  validateDeployPublicUrlOrigins();
}

if (config.isProduction && !config.trustProxy) {
  configStderr(
    'ECHO_TRUST_PROXY must be true in production when the API sits behind a reverse proxy so rate limits and audit digests use the real client IP.',
  );
  process.exit(1);
}
