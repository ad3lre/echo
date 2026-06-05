import { access, readFile, stat } from 'node:fs/promises';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import type pg from 'pg';
import { config } from '../config';
import {
  createEchoCategory,
  createEchoChannel,
  createEchoRole,
  copyEchoChannelPermissionOverwrites,
  getMergedRolePermissions,
  listEchoRolesForServer,
  patchEchoChannel,
  replaceEchoCategoryPermissionOverwrites,
  replaceEchoChannelPermissionOverwrites,
  replaceEchoServerRoleOrder,
  replaceDiscordImportedEmojiPack,
  replaceDiscordImportedStickerPack,
  updateEchoRole,
  updateEchoServerPreferences,
  type EchoPermissionOverwriteRowInput,
  type UpdateEchoRoleResult,
} from '../domain/echoStore';
import type {
  DiscordRoleImportIssue,
  DiscordRoleImportIssueCode,
} from '../../../shared/types/discordImport';
import { nextEchoSnowflakeId } from '../domain/echoSnowflake';
import { DISCORD_ECHO_PERMISSION_STRINGS } from '../../../shared/discordEchoPermissions';
import { countEchoMessagesForServerChannels } from '../domain/echoMessagesDal';
import {
  ensureEchoUserForDiscordMember,
  mergeDiscordImportUserMapBatch,
} from '../domain/discordImportUsers';
import { syncDiscordImportedRoleAssignments } from '../domain/discordImportParity';
import {
  assertDiscordImportMetadataQuota,
  recordDiscordImportMetadataStarted,
} from './discordImportQuota';
import { writeLocalEchoUploadFile } from './localUploadDisk';
import {
  buildEchoUploadPublicUrlForStorageKey,
  createEchoS3UploadClient,
  getEchoS3UploadBucket,
  isEchoS3UploadConfigured,
} from './s3UploadPresign';
import { resolveEchoUploadStorageKey } from './echoUploadResolveDest';

type JsonObject = Record<string, unknown>;

/**
 * Raw Discord channel shape from export JSON.
 * Properties may appear as API snake_case or Discord.js camelCase.
 */
type DiscordRawChannel = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  parent_id?: unknown;
  parentId?: unknown;
  position?: unknown;
  rawPosition?: unknown;
  available_tags?: unknown;
  availableTags?: unknown;
  rate_limit_per_user?: unknown;
  user_limit?: unknown;
  bitrate?: unknown;
  nsfw?: unknown;
  [key: string]: unknown;
};

/**
 * Raw Discord forum post / thread shape from export JSON.
 * Properties may appear as API snake_case or Discord.js camelCase.
 */
type DiscordRawForumPost = {
  id?: unknown;
  name?: unknown;
  parent_id?: unknown;
  parentId?: unknown;
  applied_tags?: unknown;
  appliedTags?: unknown;
  thread_metadata?: unknown;
  threadMetadata?: unknown;
  pinned?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  [key: string]: unknown;
};

type DiscordImportStep = 'metadata' | 'roles' | 'members' | 'channels';

const DISCORD_ROLE_IMPORT_ISSUE_CODES = new Set<string>([
  'skipped_managed',
  'skipped_invalid_body',
  'truncated_role_limit',
  'permission_denied',
  'everyone_update_failed',
  'role_order_failed',
  'unexpected_create_result',
  'mapped_role_update_failed',
  'renamed_duplicate',
]);

/**
 * Thrown when Discord role import cannot complete; carries structured issues for the import UI.
 */
export class DiscordImportRolesError extends Error {
  readonly roleImportIssues: DiscordRoleImportIssue[];

  constructor(message: string, roleImportIssues: DiscordRoleImportIssue[]) {
    super(message);
    this.name = 'DiscordImportRolesError';
    this.roleImportIssues = roleImportIssues;
  }
}

type DiscordImportStateRow = {
  server_id: string;
  source_dir: string;
  discord_guild_id?: string | null;
  metadata_imported_at: Date | string | null;
  roles_imported_at: Date | string | null;
  channels_imported_at: Date | string | null;
  role_id_map: unknown;
  category_id_map: unknown;
  channel_id_map: unknown;
  discord_to_echo_user_map?: unknown;
  members_imported_at?: Date | string | null;
  warnings: unknown;
  last_error: string;
  role_import_issues?: unknown;
  updated_at: Date | string | null;
};

export type DiscordImportStateDto = {
  serverId: string;
  sourceLabel: string;
  sourceDir: string;
  metadataImported: boolean;
  rolesImported: boolean;
  membersImported: boolean;
  channelsImported: boolean;
  metadataImportedAt: string | null;
  rolesImportedAt: string | null;
  membersImportedAt: string | null;
  channelsImportedAt: string | null;
  roleCount: number;
  categoryCount: number;
  channelCount: number;
  /** Discord channel id → Echo channel id (empty until channels import completes). */
  channelIdMap: Record<string, string>;
  /** Discord user id → Echo user id (shadow or linked) for this import; updated during member + message import. */
  discordToEchoUserMap: Record<string, string>;
  userMapEntryCount: number;
  warnings: string[];
  lastError: string;
  roleImportIssues: DiscordRoleImportIssue[];
  updatedAt: string | null;
  nextStep: DiscordImportStep | null;
  completedSteps: number;
  preview: DiscordImportPreviewDto | null;
  previewError: string;
};

export type DiscordImportStepResult = {
  state: DiscordImportStateDto;
  nextChannelId?: string;
};

export type DiscordImportPreviewBucketDto = {
  key: string;
  label: string;
  channelNames: string[];
  totalChannels: number;
};

export type DiscordImportPreviewDto = {
  guildName: string;
  roleCount: number;
  categoryCount: number;
  channelCount: number;
  unsupportedChannelCount: number;
  uncategorizedChannelCount: number;
  orphanedChannelCount: number;
  sampleBuckets: DiscordImportPreviewBucketDto[];
  warnings: string[];
};

type LoadedBundle = {
  sourceDir: string;
  manifest: JsonObject;
  guild: JsonObject;
  roles: JsonObject[];
  channels: DiscordRawChannel[];
  /** Text / announcement channel threads (see exporter `channel_threads.json`). */
  channelThreads: DiscordRawChannel[];
  forumPosts: DiscordRawForumPost[];
  emojis: JsonObject[];
  overwrites: JsonObject[];
  assetManifest: JsonObject | null;
  warnings: string[];
};

type ImportMapping = Record<string, string>;

type NormalizedDiscordCategory = {
  discordId: string;
  name: string;
  position: number;
};

type NormalizedDiscordChannel = {
  discordId: string;
  kind: 'text' | 'voice' | 'stage' | 'forum' | 'unsupported';
  name: string;
  parentDiscordId: string | null;
  position: number;
  /** Echo `icon_key` when imported from a Discord-only channel kind (e.g. stage). */
  iconKey?: string;
  slowmodeSeconds?: number;
  userLimit?: number;
  bitrateBps?: number;
  nsfw?: boolean;
  forumAvailableTags?: unknown;
};

type NormalizedDiscordForumPost = {
  discordId: string;
  parentForumDiscordId: string;
  title: string;
  appliedTagIds: string[];
  pinned: boolean;
  locked: boolean;
  archivedAt: Date | null;
  createdAt: Date | null;
};

const DISCORD_PERMISSION_BIT_POSITIONS = DISCORD_ECHO_PERMISSION_STRINGS.map(
  (_: string, index: number) => (index < 47 ? index : index + 2),
);

const DISCORD_PERMISSION_BIT_TO_NAME = DISCORD_ECHO_PERMISSION_STRINGS.map(
  (name: string, index: number) => ({
    name,
    bit: 1n << BigInt(DISCORD_PERMISSION_BIT_POSITIONS[index]!),
  }),
);

const THREAD_PERMISSION_NAMES = new Set([
  'MANAGE_THREADS',
  'CREATE_PUBLIC_THREADS',
  'CREATE_PRIVATE_THREADS',
  'SEND_MESSAGES_IN_THREADS',
]);

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonObject;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function parseRoleImportIssues(raw: unknown): DiscordRoleImportIssue[] {
  if (!Array.isArray(raw)) return [];
  const out: DiscordRoleImportIssue[] = [];
  for (const entry of raw) {
    const o = asObject(entry);
    if (!o) continue;
    const codeRaw = o.code;
    const detail =
      typeof o.detail === 'string' && o.detail.trim() ? o.detail.trim() : '';
    if (
      typeof codeRaw !== 'string' ||
      !DISCORD_ROLE_IMPORT_ISSUE_CODES.has(codeRaw)
    )
      continue;
    if (!detail) continue;
    const code = codeRaw as DiscordRoleImportIssueCode;
    const discordRoleId =
      typeof o.discordRoleId === 'string' && o.discordRoleId.trim()
        ? o.discordRoleId.trim()
        : undefined;
    const roleName =
      typeof o.roleName === 'string' && o.roleName.trim()
        ? o.roleName.trim()
        : undefined;
    out.push({ code, discordRoleId, roleName, detail });
  }
  return out;
}

function describeUpdateEveryoneFailure(result: UpdateEchoRoleResult): string {
  switch (result) {
    case 'forbidden':
      return 'Missing permission to edit @everyone (need Manage Roles and a role above @everyone).';
    case 'not_found':
      return 'The @everyone role row was not found in Echo.';
    case 'invalid_body':
      return 'Discord @everyone fields could not be applied in Echo (invalid colors or permissions).';
    default:
      return 'Could not update @everyone.';
  }
}

function describeRoleOrderFailure(result: UpdateEchoRoleResult): string {
  switch (result) {
    case 'forbidden':
      return 'Missing permission to reorder roles (need Manage Roles and a role above those being reordered).';
    case 'invalid_body':
      return 'Computed role order was not a valid permutation of this server’s roles.';
    default:
      return 'Could not persist role order.';
  }
}

function safeParseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  const d = new Date(t);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

function normalizeDiscordForumAvailableTags(
  raw: unknown,
):
  | Array<{ id: string; name: string; emoji?: string; moderated?: boolean }>
  | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: Array<{
    id: string;
    name: string;
    emoji?: string;
    moderated?: boolean;
  }> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const o = entry as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!id || !name) continue;
    const emoji =
      typeof o.emoji_name === 'string'
        ? o.emoji_name.trim()
        : typeof o.emojiName === 'string'
          ? o.emojiName.trim()
          : '';
    const moderated = o.moderated === true ? true : undefined;
    out.push({
      id,
      name,
      ...(emoji ? { emoji } : {}),
      ...(moderated !== undefined ? { moderated } : {}),
    });
  }
  return out.length ? out : undefined;
}

function normalizeDiscordForumPosts(
  posts: DiscordRawForumPost[],
): NormalizedDiscordForumPost[] {
  const out: NormalizedDiscordForumPost[] = [];
  for (const post of posts) {
    const id = post.id != null ? String(post.id).trim() : '';
    if (!id) continue;
    const parentRaw = post.parent_id ?? post.parentId;
    const parent = normalizeDiscordParentId(parentRaw);
    if (!parent) continue;
    const title =
      typeof post.name === 'string' && post.name.trim()
        ? post.name.trim()
        : 'Imported Post';

    const appliedTagIdsRaw = post.applied_tags ?? post.appliedTags;
    const appliedTagIds = Array.isArray(appliedTagIdsRaw)
      ? appliedTagIdsRaw
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.trim())
          .filter(Boolean)
      : [];

    const threadMeta = asObject(post.thread_metadata ?? post.threadMetadata);
    const locked = threadMeta?.locked === true;
    const pinned = threadMeta?.pinned === true || post.pinned === true;
    const isArchived = threadMeta?.archived === true;
    const archiveTs =
      safeParseIsoDate(threadMeta?.archive_timestamp) ??
      safeParseIsoDate(threadMeta?.archiveTimestamp);
    const archivedAt = isArchived ? (archiveTs ?? new Date()) : null;

    const createdAt =
      safeParseIsoDate(threadMeta?.create_timestamp) ??
      safeParseIsoDate(threadMeta?.createTimestamp) ??
      safeParseIsoDate(post.created_at) ??
      safeParseIsoDate(post.createdAt);

    out.push({
      discordId: id,
      parentForumDiscordId: parent,
      title,
      appliedTagIds,
      pinned,
      locked,
      archivedAt,
      createdAt,
    });
  }
  return out;
}

function parseJsonObject(text: string, label: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON in ${label}`);
  }
  const obj = asObject(parsed);
  if (!obj) throw new Error(`Expected JSON object in ${label}`);
  return obj;
}

function parseJsonArray(text: string, label: string): JsonObject[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON in ${label}`);
  }
  if (!Array.isArray(parsed))
    throw new Error(`Expected JSON array in ${label}`);
  return parsed.filter((entry): entry is JsonObject => asObject(entry) != null);
}

async function readJsonObjectFile(
  filePath: string,
  label: string,
): Promise<JsonObject> {
  return parseJsonObject(await readFile(filePath, 'utf8'), label);
}

async function readJsonArrayFile(
  filePath: string,
  label: string,
): Promise<JsonObject[]> {
  return parseJsonArray(await readFile(filePath, 'utf8'), label);
}

async function readJsonlFile(
  filePath: string,
  label: string,
): Promise<JsonObject[]> {
  const rows: JsonObject[] = [];
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNo = 0;
  try {
    for await (const line of lines) {
      lineNo += 1;
      const raw = line.trim();
      if (!raw) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(`Invalid JSONL row in ${label} at line ${lineNo}`);
      }
      const obj = asObject(parsed);
      if (!obj)
        throw new Error(`Expected JSON object in ${label} at line ${lineNo}`);
      rows.push(obj);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  } finally {
    lines.close();
    stream.destroy();
  }
  return rows;
}

function uniqueWarnings(...parts: Array<string[] | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    for (const warning of part ?? []) {
      const trimmed = warning.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

function parseBitfield(raw: unknown): bigint {
  if (typeof raw === 'bigint') return raw;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0)
    return BigInt(Math.floor(raw));
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return 0n;
    if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
  }
  return 0n;
}

function permissionsFromBitfield(raw: unknown): string[] {
  const bitfield = parseBitfield(raw);
  if (bitfield === 0n) return [];
  return DISCORD_PERMISSION_BIT_TO_NAME.filter(
    (entry: { name: string; bit: bigint }) =>
      (bitfield & entry.bit) === entry.bit,
  )
    .map((entry: { name: string; bit: bigint }) => entry.name)
    .filter((n) => !THREAD_PERMISSION_NAMES.has(n));
}

function overwritePartialFromAllowDeny(
  allowRaw: unknown,
  denyRaw: unknown,
): Record<string, boolean> {
  const allow = parseBitfield(allowRaw);
  const deny = parseBitfield(denyRaw);
  const out: Record<string, boolean> = {};
  for (const entry of DISCORD_PERMISSION_BIT_TO_NAME) {
    if (THREAD_PERMISSION_NAMES.has(entry.name)) continue;
    if ((deny & entry.bit) === entry.bit) out[entry.name] = false;
    if ((allow & entry.bit) === entry.bit) out[entry.name] = true;
  }
  return out;
}

/** Returns a hex color string or `''` for colorless. Discord uses 0 / #000000 to mean "no color". */
function safeHexColor(role: JsonObject): string {
  const hexColor =
    typeof role.hexColor === 'string' ? role.hexColor.trim() : '';
  if (
    /^#[0-9a-fA-F]{6}$/.test(hexColor) &&
    hexColor.toLowerCase() !== '#000000'
  )
    return hexColor;
  const color =
    typeof role.color === 'number' && Number.isFinite(role.color)
      ? Math.max(0, Math.floor(role.color))
      : null;
  if (color == null || color === 0) return '';
  return `#${color.toString(16).padStart(6, '0').slice(-6)}`;
}

function toIsoString(raw: Date | string | null): string | null {
  if (raw == null) return null;
  if (raw instanceof Date) return raw.toISOString();
  const trimmed = String(raw).trim();
  return trimmed || null;
}

const MAX_INLINE_ASSET_BYTES = 1_500_000;

function isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(
    path.resolve(rootPath),
    path.resolve(candidatePath),
  );
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  );
}

function parseMapping(raw: unknown): ImportMapping {
  const obj = asObject(raw);
  if (!obj) return {};
  const out: ImportMapping = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && value.trim()) out[key] = value.trim();
    else if (typeof value === 'number' && Number.isFinite(value))
      out[key] = String(value);
  }
  return out;
}

function tryResolveDiscordExportDir(
  exportsRoot: string,
  guildId: string,
): string | null {
  if (!exportsRoot || !guildId || !existsSync(exportsRoot)) return null;
  const suffix = `_${guildId}`;
  try {
    for (const name of readdirSync(exportsRoot)) {
      const full = path.join(exportsRoot, name);
      try {
        if (!statSync(full).isDirectory()) continue;
      } catch {
        continue;
      }
      if (name.endsWith(suffix)) return full;
    }
  } catch {
    return null;
  }
  return null;
}

function effectiveSourceDirFromRow(row: DiscordImportStateRow): string {
  const gid =
    row.discord_guild_id != null ? String(row.discord_guild_id).trim() : '';
  if (gid) {
    const resolved = tryResolveDiscordExportDir(
      config.discordExportCollectionsRoot,
      gid,
    );
    if (resolved) return resolved;
  }
  const sd = typeof row.source_dir === 'string' ? row.source_dir.trim() : '';
  if (sd) return sd;
  return config.discordImportSourceDir;
}

function mapStateRow(row: DiscordImportStateRow): DiscordImportStateDto {
  const roleIdMap = parseMapping(row.role_id_map);
  const categoryIdMap = parseMapping(row.category_id_map);
  const channelIdMap = parseMapping(row.channel_id_map);
  const discordToEchoUserMap = parseMapping(row.discord_to_echo_user_map);
  const metadataImported = row.metadata_imported_at != null;
  const rolesImported = row.roles_imported_at != null;
  const membersImported = row.members_imported_at != null;
  const channelsImported = row.channels_imported_at != null;
  const sourceDir = effectiveSourceDirFromRow(row);
  return {
    serverId: row.server_id,
    sourceLabel: path.basename(sourceDir),
    sourceDir,
    metadataImported,
    rolesImported,
    membersImported,
    channelsImported,
    metadataImportedAt: toIsoString(row.metadata_imported_at),
    rolesImportedAt: toIsoString(row.roles_imported_at),
    membersImportedAt: toIsoString(row.members_imported_at ?? null),
    channelsImportedAt: toIsoString(row.channels_imported_at),
    roleCount: Object.keys(roleIdMap).length,
    categoryCount: Object.keys(categoryIdMap).length,
    channelCount: Object.keys(channelIdMap).length,
    channelIdMap,
    discordToEchoUserMap,
    userMapEntryCount: Object.keys(discordToEchoUserMap).length,
    warnings: uniqueWarnings(asStringArray(row.warnings)),
    lastError: typeof row.last_error === 'string' ? row.last_error : '',
    roleImportIssues: parseRoleImportIssues(row.role_import_issues),
    updatedAt: toIsoString(row.updated_at),
    nextStep: !metadataImported
      ? 'metadata'
      : !rolesImported
        ? 'roles'
        : !membersImported
          ? 'members'
          : !channelsImported
            ? 'channels'
            : null,
    completedSteps: [
      metadataImported,
      rolesImported,
      membersImported,
      channelsImported,
    ].filter(Boolean).length,
    preview: null,
    previewError: '',
  };
}

async function ensureImportState(
  pool: pg.Pool,
  serverId: string,
): Promise<DiscordImportStateDto> {
  const sourceDir = config.discordImportSourceDir;
  const row = await pool.query<DiscordImportStateRow>(
    `
    INSERT INTO echo_discord_import_states (server_id, source_dir, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (server_id) DO UPDATE
      SET updated_at = NOW()
    RETURNING *
    `,
    [serverId, sourceDir],
  );
  return mapStateRow(row.rows[0]!);
}

async function loadImportStateRow(
  pool: pg.Pool,
  serverId: string,
): Promise<DiscordImportStateRow | null> {
  const row = await pool.query<DiscordImportStateRow>(
    `SELECT * FROM echo_discord_import_states WHERE server_id = $1 LIMIT 1`,
    [serverId],
  );
  return row.rows[0] ?? null;
}

async function resolveImportBundleSourceDir(
  pool: pg.Pool,
  serverId: string,
): Promise<string> {
  const row = await loadImportStateRow(pool, serverId);
  if (!row) return config.discordImportSourceDir;
  return effectiveSourceDirFromRow(row);
}

async function saveImportState(
  pool: pg.Pool,
  serverId: string,
  patch: {
    metadataImported?: boolean;
    rolesImported?: boolean;
    membersImported?: boolean;
    channelsImported?: boolean;
    roleIdMap?: ImportMapping;
    categoryIdMap?: ImportMapping;
    channelIdMap?: ImportMapping;
    warnings?: string[];
    lastError?: string;
    roleImportIssues?: DiscordRoleImportIssue[];
  },
): Promise<DiscordImportStateDto> {
  const current = await ensureImportState(pool, serverId);
  const sets = ['updated_at = NOW()'];
  const values: unknown[] = [];
  const push = (sql: string, value: unknown) => {
    values.push(value);
    sets.push(`${sql} = $${values.length}`);
  };
  if (patch.metadataImported === true)
    push('metadata_imported_at', new Date().toISOString());
  if (patch.rolesImported === true)
    push('roles_imported_at', new Date().toISOString());
  if (patch.membersImported === true)
    push('members_imported_at', new Date().toISOString());
  if (patch.channelsImported === true)
    push('channels_imported_at', new Date().toISOString());
  if (patch.roleIdMap !== undefined)
    push('role_id_map', JSON.stringify(patch.roleIdMap));
  if (patch.categoryIdMap !== undefined)
    push('category_id_map', JSON.stringify(patch.categoryIdMap));
  if (patch.channelIdMap !== undefined)
    push('channel_id_map', JSON.stringify(patch.channelIdMap));
  if (patch.warnings !== undefined)
    push(
      'warnings',
      JSON.stringify(uniqueWarnings(current.warnings, patch.warnings)),
    );
  if (patch.lastError !== undefined) push('last_error', patch.lastError);
  if (patch.roleImportIssues !== undefined)
    push('role_import_issues', JSON.stringify(patch.roleImportIssues));
  values.push(serverId);
  const row = await pool.query<DiscordImportStateRow>(
    `UPDATE echo_discord_import_states SET ${sets.join(', ')} WHERE server_id = $${values.length} RETURNING *`,
    values,
  );
  return mapStateRow(row.rows[0]!);
}

async function recordImportFailure(
  pool: pg.Pool,
  serverId: string,
  error: unknown,
): Promise<void> {
  const message =
    error instanceof Error ? error.message : 'Discord import failed';
  if (error instanceof DiscordImportRolesError) {
    await saveImportState(pool, serverId, {
      lastError: message,
      roleImportIssues: error.roleImportIssues,
    });
    return;
  }
  await saveImportState(pool, serverId, {
    lastError: message,
    roleImportIssues: [],
  });
}

async function assertBundleReadable(sourceDir: string): Promise<void> {
  await access(sourceDir);
  await access(path.join(sourceDir, 'manifest.json'));
  await access(path.join(sourceDir, 'guild.json'));
}

async function loadBundle(sourceDir: string): Promise<LoadedBundle> {
  await assertBundleReadable(sourceDir);
  const manifest = await readJsonObjectFile(
    path.join(sourceDir, 'manifest.json'),
    'manifest.json',
  );
  const completeness = asObject(manifest.completeness);
  const echoCoreOk = completeness?.echoCoreOk === true;
  if (!echoCoreOk) {
    throw new Error(
      'Discord export is not import-ready: manifest.completeness.echoCoreOk is false.',
    );
  }
  const warnings = uniqueWarnings(asStringArray(completeness?.warnings));
  let assetManifest: JsonObject | null = null;
  try {
    assetManifest = await readJsonObjectFile(
      path.join(sourceDir, 'asset_manifest.json'),
      'asset_manifest.json',
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return {
    sourceDir,
    manifest,
    guild: await readJsonObjectFile(
      path.join(sourceDir, 'guild.json'),
      'guild.json',
    ),
    roles: await readJsonArrayFile(
      path.join(sourceDir, 'roles.json'),
      'roles.json',
    ),
    channels: await readJsonArrayFile(
      path.join(sourceDir, 'channels.json'),
      'channels.json',
    ),
    channelThreads: await readJsonArrayFile(
      path.join(sourceDir, 'channel_threads.json'),
      'channel_threads.json',
    ).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return [];
    }),
    forumPosts: await readJsonArrayFile(
      path.join(sourceDir, 'forum_posts.json'),
      'forum_posts.json',
    ).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }),
    emojis: await readJsonArrayFile(
      path.join(sourceDir, 'emojis.json'),
      'emojis.json',
    ).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }),
    overwrites: await readJsonlFile(
      path.join(sourceDir, 'overwrites.jsonl'),
      'overwrites.jsonl',
    ),
    assetManifest,
    warnings,
  };
}

function mimeTypeFromFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

async function assetPathToDataUrl(
  sourceDir: string,
  relPath: unknown,
  options?: { maxBytes?: number | null },
): Promise<string | undefined> {
  if (typeof relPath !== 'string' || !relPath.trim()) return undefined;
  const filePath = path.resolve(sourceDir, relPath.trim());
  const normalizedRoot = path.resolve(sourceDir);
  if (!isPathInsideRoot(normalizedRoot, filePath)) return undefined;
  try {
    const fileInfo = await stat(filePath);
    const maxBytes = options?.maxBytes ?? MAX_INLINE_ASSET_BYTES;
    if (
      !fileInfo.isFile() ||
      (maxBytes != null &&
        Number.isFinite(maxBytes) &&
        fileInfo.size > maxBytes)
    ) {
      return undefined;
    }
    const buffer = await readFile(filePath);
    return `data:${mimeTypeFromFile(filePath)};base64,${buffer.toString('base64')}`;
  } catch {
    return undefined;
  }
}

async function assetPathToImportedBrandingUrl(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  sourceDir: string,
  relPath: unknown,
  purpose: 'server_icon' | 'server_banner',
): Promise<{ url?: string; warning?: string }> {
  if (typeof relPath !== 'string' || !relPath.trim()) return {};
  const trimmedRelPath = relPath.trim();
  const filePath = path.resolve(sourceDir, trimmedRelPath);
  const normalizedRoot = path.resolve(sourceDir);
  if (!isPathInsideRoot(normalizedRoot, filePath)) return {};

  const contentType = mimeTypeFromFile(filePath);
  const supportsDirectStorage =
    !!config.echoLocalUploadDir || isEchoS3UploadConfigured();
  if (!supportsDirectStorage) {
    const dataUrl = await assetPathToDataUrl(sourceDir, trimmedRelPath);
    return dataUrl ? { url: dataUrl } : {};
  }

  if (!contentType.startsWith('image/')) {
    return {
      warning: `Skipped Discord ${purpose === 'server_icon' ? 'server icon' : 'server banner'} because ${path.basename(trimmedRelPath)} is not a supported image format.`,
    };
  }

  let buffer: Buffer;
  try {
    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile()) return {};
    buffer = await readFile(filePath);
  } catch {
    return {};
  }

  const ext = path.extname(trimmedRelPath).toLowerCase() || '.bin';
  const objectKey = `discord-import-${purpose}-${nextEchoSnowflakeId()}${ext}`;
  const storageDest = await resolveEchoUploadStorageKey(pool, actorId, {
    serverId,
    purpose,
    contentType,
    objectKey,
  });
  if (!storageDest.ok) {
    if (storageDest.error.code === 'FORBIDDEN') {
      throw new Error(
        'You do not have permission to import Discord server metadata.',
      );
    }
    return {
      warning: `Skipped Discord ${purpose === 'server_icon' ? 'server icon' : 'server banner'} because Echo could not prepare storage for it.`,
    };
  }

  if (config.echoLocalUploadDir) {
    await writeLocalEchoUploadFile(storageDest.storageKey, buffer);
  } else {
    const client = createEchoS3UploadClient();
    const bucket = getEchoS3UploadBucket();
    if (!client || !bucket) {
      return {
        warning: `Skipped Discord ${purpose === 'server_icon' ? 'server icon' : 'server banner'} because object storage is not configured correctly.`,
      };
    }
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageDest.storageKey,
        Body: buffer,
        ContentType: contentType,
      }),
    );
  }

  const publicUrl = buildEchoUploadPublicUrlForStorageKey(
    storageDest.storageKey,
  );
  if (!publicUrl) {
    return {
      warning: `Skipped Discord ${purpose === 'server_icon' ? 'server icon' : 'server banner'} because Echo could not build a public URL for it.`,
    };
  }
  return { url: publicUrl };
}

function overwriteTargetType(rawType: unknown): 'role' | 'member' | null {
  if (rawType === 0 || rawType === '0' || rawType === 'role') return 'role';
  if (rawType === 1 || rawType === '1' || rawType === 'member') return 'member';
  return null;
}

function fallbackImportedEmojiName(
  emojiId: string,
  relPath: string,
  fallbackIndex: number,
): string {
  const basename = path.basename(relPath, path.extname(relPath));
  const withoutDiscordId = basename.replace(new RegExp(`_${emojiId}$`), '');
  const normalized = withoutDiscordId.trim().replace(/[^\w.-]+/g, '_');
  return normalized || `emoji_${fallbackIndex}`;
}

/** Discord guild stickers expose `format_type`; custom emojis do not. */
function isLikelyDiscordStickerExportRow(o: JsonObject): boolean {
  return o.format_type != null || o.sticker_format != null;
}

function collectDiscordStickerSnowflakeIds(bundle: LoadedBundle): Set<string> {
  const ids = new Set<string>();
  const guildStickers = (bundle.guild as { stickers?: unknown }).stickers;
  if (Array.isArray(guildStickers)) {
    for (const entry of guildStickers) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const id = (entry as { id?: unknown }).id;
      if (id == null) continue;
      const s = String(id).trim();
      if (s) ids.add(s);
    }
  }
  const manifest = asObject(bundle.assetManifest);
  const stickerPaths = asObject(manifest?.stickers);
  if (stickerPaths) {
    for (const k of Object.keys(stickerPaths)) {
      const s = k.trim();
      if (s) ids.add(s);
    }
  }
  return ids;
}

async function loadDiscordStickerIdsFromStickersJsonFile(
  sourceDir: string,
): Promise<Set<string>> {
  const p = path.join(sourceDir, 'stickers.json');
  if (!existsSync(p)) return new Set();
  try {
    const rows = await readJsonArrayFile(p, 'stickers.json');
    const ids = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      const id = (row as { id?: unknown }).id;
      if (id == null) continue;
      const s = String(id).trim();
      if (s) ids.add(s);
    }
    return ids;
  } catch {
    return new Set();
  }
}

async function importDiscordGuildEmojiPack(
  pool: pg.Pool,
  serverId: string,
  bundle: LoadedBundle,
): Promise<{ importedCount: number }> {
  const assetManifest = asObject(bundle.assetManifest);
  const emojiAssetMap = asObject(assetManifest?.emojis);
  if (!emojiAssetMap || Object.keys(emojiAssetMap).length === 0) {
    return { importedCount: 0 };
  }

  const stickerSnowflakeIds = collectDiscordStickerSnowflakeIds(bundle);
  for (const sid of await loadDiscordStickerIdsFromStickersJsonFile(
    bundle.sourceDir,
  )) {
    stickerSnowflakeIds.add(sid);
  }

  const emojiMetaById = new Map<string, JsonObject>();
  for (const emoji of bundle.emojis) {
    const emojiId = emoji.id != null ? String(emoji.id).trim() : '';
    if (!emojiId) continue;
    if (stickerSnowflakeIds.has(emojiId)) continue;
    if (isLikelyDiscordStickerExportRow(emoji)) continue;
    emojiMetaById.set(emojiId, emoji);
  }

  const imported: Array<{
    name: string;
    animated: boolean;
    imageUrl: string;
    discordEmojiId: string;
  }> = [];
  let fallbackIndex = 1;
  for (const [emojiId, relPathRaw] of Object.entries(emojiAssetMap)) {
    const relPath = typeof relPathRaw === 'string' ? relPathRaw.trim() : '';
    if (!emojiId.trim() || !relPath) continue;
    const idTrim = emojiId.trim();
    if (stickerSnowflakeIds.has(idTrim)) continue;
    const meta = emojiMetaById.get(idTrim);
    if (meta && isLikelyDiscordStickerExportRow(meta)) continue;
    const inlineUrl = await assetPathToDataUrl(bundle.sourceDir, relPath, {
      maxBytes: null,
    });
    const remoteUrl =
      typeof meta?.imageURL === 'string' ? meta.imageURL.trim() : '';
    const imageUrl = inlineUrl || remoteUrl;
    if (!imageUrl) continue;
    const name =
      typeof meta?.name === 'string' && meta.name.trim()
        ? meta.name.trim()
        : fallbackImportedEmojiName(emojiId.trim(), relPath, fallbackIndex);
    const animated =
      meta?.animated === true || path.extname(relPath).toLowerCase() === '.gif';
    imported.push({ name, animated, imageUrl, discordEmojiId: emojiId.trim() });
    fallbackIndex += 1;
  }

  if (imported.length === 0) return { importedCount: 0 };

  const guildName =
    typeof bundle.guild.name === 'string' ? bundle.guild.name.trim() : '';
  const discordGuildId =
    bundle.guild.id != null ? String(bundle.guild.id).trim() : '';
  const result = await replaceDiscordImportedEmojiPack(pool, serverId, {
    guildName,
    discordGuildId,
    emojis: imported,
  });
  return { importedCount: result.importedCount };
}

async function importDiscordGuildStickerPack(
  pool: pg.Pool,
  serverId: string,
  bundle: LoadedBundle,
): Promise<{ importedCount: number }> {
  const assetManifest = asObject(bundle.assetManifest);
  const stickerAssetMap = asObject(assetManifest?.stickers);
  if (!stickerAssetMap || Object.keys(stickerAssetMap).length === 0) {
    return { importedCount: 0 };
  }

  const stickerMetaById = new Map<string, JsonObject>();
  const guildStickers = (bundle.guild as { stickers?: unknown }).stickers;
  if (Array.isArray(guildStickers)) {
    for (const entry of guildStickers) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const id = (entry as { id?: unknown }).id;
      if (id == null) continue;
      stickerMetaById.set(String(id).trim(), entry as JsonObject);
    }
  }
  try {
    const rows = await readJsonArrayFile(
      path.join(bundle.sourceDir, 'stickers.json'),
      'stickers.json',
    );
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      const id = (row as { id?: unknown }).id;
      if (id == null) continue;
      stickerMetaById.set(String(id).trim(), row as JsonObject);
    }
  } catch {
    /* optional stickers.json */
  }

  const imported: Array<{
    name: string;
    imageUrl: string;
    format?: string;
    discordStickerId: string;
  }> = [];
  let fallbackIndex = 1;
  for (const [stickerId, relPathRaw] of Object.entries(stickerAssetMap)) {
    const relPath = typeof relPathRaw === 'string' ? relPathRaw.trim() : '';
    if (!stickerId.trim() || !relPath) continue;
    const meta = stickerMetaById.get(stickerId.trim());
    const inlineUrl = await assetPathToDataUrl(bundle.sourceDir, relPath, {
      maxBytes: null,
    });
    const remoteUrl =
      typeof meta?.imageURL === 'string' ? meta.imageURL.trim() : '';
    const imageUrl = inlineUrl || remoteUrl;
    if (!imageUrl) continue;
    const name =
      typeof meta?.name === 'string' && meta.name.trim()
        ? meta.name.trim()
        : fallbackImportedEmojiName(stickerId.trim(), relPath, fallbackIndex);
    const formatType = meta?.format_type;
    let format = 'png';
    if (formatType === 2) format = 'apng';
    else if (formatType === 3) format = 'lottie';
    else if (formatType === 4) format = 'gif';
    imported.push({
      name,
      imageUrl,
      format,
      discordStickerId: stickerId.trim(),
    });
    fallbackIndex += 1;
  }

  if (imported.length === 0) return { importedCount: 0 };

  const guildName =
    typeof bundle.guild.name === 'string' ? bundle.guild.name.trim() : '';
  const discordGuildId =
    bundle.guild.id != null ? String(bundle.guild.id).trim() : '';
  const result = await replaceDiscordImportedStickerPack(pool, serverId, {
    guildName,
    discordGuildId,
    stickers: imported,
  });
  return { importedCount: result.importedCount };
}

async function importMetadataStep(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  options?: { force?: boolean },
): Promise<DiscordImportStepResult> {
  const existingState = await ensureImportState(pool, serverId);
  const force = options?.force === true;
  if (existingState.metadataImported && !force) {
    return { state: existingState };
  }

  if (!existingState.metadataImported) {
    await assertDiscordImportMetadataQuota(pool, actorId);
  }

  const sourceDir = await resolveImportBundleSourceDir(pool, serverId);
  const bundle = await loadBundle(sourceDir);
  const guildName =
    typeof bundle.guild.name === 'string' ? bundle.guild.name.trim() : '';
  const description =
    typeof bundle.guild.description === 'string'
      ? bundle.guild.description.trim()
      : '';
  const patch: {
    name?: string;
    description?: string;
    iconUrl?: string;
    bannerUrl?: string;
  } = {};
  const warnings = [...bundle.warnings];
  if (guildName) patch.name = guildName;
  if (description) patch.description = description;
  if (bundle.assetManifest) {
    const iconImport = await assetPathToImportedBrandingUrl(
      pool,
      serverId,
      actorId,
      bundle.sourceDir,
      bundle.assetManifest.guildIcon,
      'server_icon',
    );
    if (iconImport.url) patch.iconUrl = iconImport.url;
    if (iconImport.warning) warnings.push(iconImport.warning);
    const bannerAsset =
      bundle.assetManifest.guildBanner ?? bundle.assetManifest.guildSplash;
    const bannerImport = await assetPathToImportedBrandingUrl(
      pool,
      serverId,
      actorId,
      bundle.sourceDir,
      bannerAsset,
      'server_banner',
    );
    if (bannerImport.url) patch.bannerUrl = bannerImport.url;
    if (bannerImport.warning) warnings.push(bannerImport.warning);
  }
  const result = await updateEchoServerPreferences(
    pool,
    serverId,
    actorId,
    patch,
  );
  if (result !== 'ok') {
    throw new Error(
      result === 'forbidden'
        ? 'You do not have permission to import Discord server metadata.'
        : 'Discord metadata import could not update this server.',
    );
  }
  const emojiImport = await importDiscordGuildEmojiPack(pool, serverId, bundle);
  if (
    emojiImport.importedCount === 0 &&
    asObject(bundle.assetManifest?.emojis) &&
    Object.keys(asObject(bundle.assetManifest?.emojis) ?? {}).length > 0
  ) {
    warnings.push(
      'Discord export contained emoji assets, but none could be imported into an Echo emoji pack.',
    );
  }
  const stickerImport = await importDiscordGuildStickerPack(
    pool,
    serverId,
    bundle,
  );
  if (
    stickerImport.importedCount === 0 &&
    asObject(bundle.assetManifest?.stickers) &&
    Object.keys(asObject(bundle.assetManifest?.stickers) ?? {}).length > 0
  ) {
    warnings.push(
      'Discord export contained sticker assets, but none could be imported into an Echo sticker pack.',
    );
  }
  const state = await saveImportState(pool, serverId, {
    metadataImported: true,
    warnings,
    lastError: '',
  });
  if (!existingState.metadataImported) {
    await recordDiscordImportMetadataStarted(pool, actorId);
  }
  return { state };
}

async function importRolesStep(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  options?: { force?: boolean },
): Promise<DiscordImportStepResult> {
  const existingState = await ensureImportState(pool, serverId);
  if (existingState.rolesImported) return { state: existingState };

  const sourceDir = await resolveImportBundleSourceDir(pool, serverId);
  const bundle = await loadBundle(sourceDir);

  const existingRoles = await listEchoRolesForServer(pool, serverId);
  const membersRole = existingRoles.find(
    (role) => role.isMembers || role.isEveryone,
  );
  if (!membersRole)
    throw new Error('Echo server is missing the default @members role.');

  const roleIdMap: ImportMapping = {};
  const warnings = [...bundle.warnings];
  const roleImportIssues: DiscordRoleImportIssue[] = [];
  const force = options?.force === true;
  if (existingRoles.length > 1 && !force) {
    warnings.push(
      'Discord role import detected a non-empty server. Proceeding in merge mode; pass { force: true } to suppress this warning.',
    );
  }
  const orderedRoleIdsTopToBottom: string[] = [];
  const usedRoleNames = new Set<string>();
  for (const r of existingRoles) {
    if (typeof r.name === 'string' && r.name.trim()) usedRoleNames.add(r.name);
  }

  for (const role of bundle.roles) {
    const discordRoleId = role.id != null ? String(role.id).trim() : '';
    const roleName = typeof role.name === 'string' ? role.name.trim() : '';
    if (!discordRoleId || !roleName) continue;
    // Skip managed roles (created/owned by bots or integrations) — do not import these.
    // Discord marks these with `managed: true`.
    if (role.managed === true) {
      warnings.push(
        `Skipped Discord role "${roleName}" because it is managed by a bot/integration.`,
      );
      roleImportIssues.push({
        code: 'skipped_managed',
        discordRoleId,
        roleName,
        detail:
          'This role is managed by a Discord bot or integration; Echo cannot mirror it as a normal server role.',
      });
      continue;
    }
    const permissions = permissionsFromBitfield(role.permissions);
    const color = safeHexColor(role);
    const hoist = role.hoist === true;
    if (roleName === '@everyone') {
      const patch: {
        name?: string;
        color?: string;
        hoist?: boolean;
        permissions?: string[];
      } = { permissions, hoist, color };
      const update = await updateEchoRole(
        pool,
        serverId,
        actorId,
        membersRole.id,
        patch,
      );
      if (update !== 'ok') {
        const detail = describeUpdateEveryoneFailure(update);
        roleImportIssues.push({
          code: 'everyone_update_failed',
          discordRoleId,
          roleName: '@everyone',
          detail,
        });
        throw new DiscordImportRolesError(
          `Discord role import could not update @everyone: ${detail}`,
          roleImportIssues,
        );
      }
      roleIdMap[discordRoleId] = membersRole.id;
      orderedRoleIdsTopToBottom.push(membersRole.id);
      continue;
    }
    const effectiveRoleName = makeUniqueImportedRoleName(
      roleName,
      usedRoleNames,
    );
    if (effectiveRoleName !== roleName) {
      warnings.push(
        `Discord role "${roleName}" collided with an existing Echo role name; imported as "${effectiveRoleName}".`,
      );
      roleImportIssues.push({
        code: 'renamed_duplicate',
        discordRoleId,
        roleName,
        detail: `An Echo role already used the name "${roleName}"; this Discord role was imported as "${effectiveRoleName}" to avoid a duplicate name.`,
      });
    }

    const created = await createEchoRole(pool, serverId, actorId, {
      name: effectiveRoleName,
      color,
      permissions,
      hoist,
      roleType: 'mixed',
    });
    if (created === 'forbidden') {
      roleImportIssues.push({
        code: 'permission_denied',
        discordRoleId,
        roleName: effectiveRoleName,
        detail:
          'Echo refused to create this role, usually because its permission set exceeds what your account may grant. Import as server owner, narrow Discord permissions for this role before export, or split permissions across roles.',
      });
      throw new DiscordImportRolesError(
        `Could not import Discord role "${effectiveRoleName}" (${discordRoleId}): missing permission to create it with the requested permission set.`,
        roleImportIssues,
      );
    }
    if (created === 'limit_reached') {
      warnings.push(
        'Stopped importing Discord roles because Echo servers can have at most 512 roles.',
      );
      roleImportIssues.push({
        code: 'truncated_role_limit',
        roleName,
        discordRoleId,
        detail:
          'Echo hit the 512-role limit; remaining Discord roles in the export were not created.',
      });
      break;
    }
    if (created === 'invalid_body') {
      warnings.push(
        `Skipped Discord role "${roleName}" because it could not be translated cleanly.`,
      );
      roleImportIssues.push({
        code: 'skipped_invalid_body',
        discordRoleId,
        roleName: effectiveRoleName,
        detail:
          'Echo rejected this role after translation (invalid name, color, or permission list).',
      });
      continue;
    }
    if (typeof created !== 'object' || !created.roleId) {
      roleImportIssues.push({
        code: 'unexpected_create_result',
        discordRoleId,
        roleName: effectiveRoleName,
        detail: `Unexpected response while creating Echo role for "${effectiveRoleName}".`,
      });
      throw new DiscordImportRolesError(
        `Discord role import failed while creating "${effectiveRoleName}".`,
        roleImportIssues,
      );
    }
    usedRoleNames.add(effectiveRoleName);
    roleIdMap[discordRoleId] = created.roleId;
    orderedRoleIdsTopToBottom.push(created.roleId);
  }

  if (!orderedRoleIdsTopToBottom.includes(membersRole.id)) {
    orderedRoleIdsTopToBottom.push(membersRole.id);
  }
  // Preserve any pre-existing roles not referenced by the import by appending them.
  for (const r of existingRoles) {
    if (!orderedRoleIdsTopToBottom.includes(r.id))
      orderedRoleIdsTopToBottom.push(r.id);
  }

  const orderResult = await replaceEchoServerRoleOrder(
    pool,
    serverId,
    actorId,
    orderedRoleIdsTopToBottom,
  );
  if (orderResult !== 'ok') {
    const detail = describeRoleOrderFailure(orderResult);
    roleImportIssues.push({
      code: 'role_order_failed',
      detail,
    });
    throw new DiscordImportRolesError(
      `Discord role import could not restore role order: ${detail}`,
      roleImportIssues,
    );
  }

  const state = await saveImportState(pool, serverId, {
    rolesImported: true,
    roleIdMap,
    warnings,
    lastError: '',
    roleImportIssues,
  });
  return { state };
}

type MembersJsonlScanStats = {
  /** Non-blank lines in the file */
  nonEmptyLines: number;
  /** Lines that were valid JSON objects (guild member rows) */
  parsedObjects: number;
  /** Lines that were non-empty but not valid JSON */
  invalidJsonLines: number;
};

async function forEachMembersJsonlRow(
  membersPath: string,
  onRow: (row: JsonObject) => Promise<void>,
): Promise<MembersJsonlScanStats> {
  let nonEmptyLines = 0;
  let parsedObjects = 0;
  let invalidJsonLines = 0;
  const stream = createReadStream(membersPath, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      const t = line.trim();
      if (!t) continue;
      nonEmptyLines += 1;
      let parsed: unknown;
      try {
        parsed = JSON.parse(t);
      } catch {
        invalidJsonLines += 1;
        continue;
      }
      const o = asObject(parsed);
      if (!o) {
        invalidJsonLines += 1;
        continue;
      }
      await onRow(o);
      parsedObjects += 1;
    }
  } finally {
    rl.close();
  }
  return { nonEmptyLines, parsedObjects, invalidJsonLines };
}

/**
 * Applies `members.jsonl`: Discord user → Echo user map in import state, and `echo_member_roles`
 * from each member’s Discord role list (via `role_id_map`). Linked accounts get roles on their
 * canonical user; others get shadow users. When a user later links Discord, merges reuse these rows.
 */
async function importMembersStep(
  pool: pg.Pool,
  serverId: string,
  _actorId: string,
): Promise<DiscordImportStepResult> {
  const existingState = await ensureImportState(pool, serverId);
  if (existingState.membersImported) return { state: existingState };

  if (!existingState.rolesImported) {
    throw new Error('Import Discord roles before importing members.');
  }

  const existingStateRow = await loadImportStateRow(pool, serverId);
  const roleIdMap = existingStateRow
    ? parseMapping(existingStateRow.role_id_map)
    : {};
  if (Object.keys(roleIdMap).length === 0) {
    throw new Error(
      'Discord role import mapping is missing; import roles again first.',
    );
  }

  const sourceDir = await resolveImportBundleSourceDir(pool, serverId);
  const bundle = await loadBundle(sourceDir);
  const warnings = [...bundle.warnings];

  const guildDiscordId =
    bundle.guild.id != null ? String(bundle.guild.id).trim() : '';

  const existingRoles = await listEchoRolesForServer(pool, serverId);
  const membersRole = existingRoles.find(
    (role) => role.isMembers || role.isEveryone,
  );
  if (!membersRole)
    throw new Error('Echo server is missing the default @members role.');

  const membersPath = path.join(sourceDir, 'members.jsonl');
  /** Flush map in chunks so one giant JSON parameter cannot OOM or hit driver limits. */
  const USER_MAP_MERGE_CHUNK = 2500;
  let userMapChunk: ImportMapping = {};
  let jsonlStats: MembersJsonlScanStats | null = null;
  let skippedRowsWithoutUser = 0;
  let usersMapped = 0;

  async function flushUserMapChunk(): Promise<void> {
    if (Object.keys(userMapChunk).length === 0) return;
    await mergeDiscordImportUserMapBatch(pool, serverId, userMapChunk);
    userMapChunk = {};
  }

  if (!existsSync(membersPath)) {
    warnings.push(
      'members.jsonl was not found in the export bundle; no Discord member roles were applied.',
    );
  } else {
    jsonlStats = await forEachMembersJsonlRow(membersPath, async (member) => {
      const u = asObject((member as { user?: unknown }).user);
      if (!u) {
        skippedRowsWithoutUser += 1;
        return;
      }
      const uidRaw = u.id;
      if (uidRaw === undefined || uidRaw === null) {
        skippedRowsWithoutUser += 1;
        return;
      }
      if (typeof uidRaw !== 'string' && typeof uidRaw !== 'number') {
        skippedRowsWithoutUser += 1;
        return;
      }
      const discordAuthorId = uidRaw;

      const rawNick = (member as { nick?: unknown }).nick;
      let guildNick: string | null | undefined;
      if (Object.prototype.hasOwnProperty.call(member, 'nick')) {
        if (rawNick === null) guildNick = null;
        else if (typeof rawNick === 'string') {
          const t = rawNick.trim();
          guildNick = t || null;
        } else guildNick = null;
      }

      const echoUserId = await ensureEchoUserForDiscordMember(
        pool,
        serverId,
        {
          id: discordAuthorId,
          username: typeof u.username === 'string' ? u.username : undefined,
          global_name:
            typeof (u as { global_name?: unknown }).global_name === 'string'
              ? (u as { global_name: string }).global_name
              : undefined,
          globalName:
            typeof (u as { globalName?: unknown }).globalName === 'string'
              ? (u as { globalName: string }).globalName
              : undefined,
          avatar:
            typeof u.avatar === 'string' || u.avatar === null
              ? (u.avatar as string | null)
              : undefined,
          ...(guildNick !== undefined ? { guildNick } : {}),
        },
        { recordInImportMap: false },
      );

      const discordUserId = String(uidRaw);
      userMapChunk[discordUserId] = echoUserId;
      usersMapped += 1;
      if (Object.keys(userMapChunk).length >= USER_MAP_MERGE_CHUNK) {
        await flushUserMapChunk();
      }

      const rolesRaw = (member as { roles?: unknown }).roles;
      const discordRoleIds = asStringArray(rolesRaw);
      const desiredRoleIds: string[] = [];

      for (const drid of discordRoleIds) {
        const d = String(drid).trim();
        if (!d || d === guildDiscordId) continue;
        const echoRoleId = roleIdMap[d];
        if (!echoRoleId || echoRoleId === membersRole.id) continue;
        desiredRoleIds.push(echoRoleId);
      }

      await syncDiscordImportedRoleAssignments({
        pool,
        serverId,
        discordUserId,
        echoUserId,
        desiredRoleIds,
      });
    });
    await flushUserMapChunk();
  }

  if (jsonlStats && jsonlStats.invalidJsonLines > 0) {
    warnings.push(
      `members.jsonl had ${jsonlStats.invalidJsonLines} line(s) that were not valid JSON objects; those rows were skipped.`,
    );
  }
  if (skippedRowsWithoutUser > 0) {
    warnings.push(
      `members.jsonl had ${skippedRowsWithoutUser} row(s) without a usable nested user.id; those members were skipped for the user map and role sync.`,
    );
  }

  if (
    jsonlStats &&
    jsonlStats.parsedObjects === 0 &&
    jsonlStats.nonEmptyLines > 0 &&
    existsSync(membersPath)
  ) {
    warnings.push(
      'members.jsonl contained no readable member rows; user map may be empty.',
    );
  }

  const state = await saveImportState(pool, serverId, {
    membersImported: true,
    warnings,
    lastError: '',
  });
  return { state };
}

async function assertServerChannelsSafeToReplace(
  pool: pg.Pool,
  serverId: string,
  force = false,
): Promise<void> {
  if (force) return;
  const count = await countEchoMessagesForServerChannels(pool, serverId);
  if (count > 0) {
    throw new Error(
      'Discord channel import only runs on a fresh server with no channel messages.',
    );
  }
}

/**
 * Discord `parent_id` / `parentId`: null, absent, "", or "0" mean “no category” (guild root).
 */
function normalizeDiscordParentId(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (s === '' || s === '0') return null;
  return s;
}

function mergeBundleChannelRows(bundle: LoadedBundle): DiscordRawChannel[] {
  return [...bundle.channels, ...bundle.channelThreads];
}

/**
 * Walk parent_id chains so threads (parent = channel) resolve to the parent **category** Discord id.
 */
function buildChannelDiscordIdToCategoryId(
  normalizedChannels: NormalizedDiscordChannel[],
  categoryDiscordIds: Set<string>,
): Map<string, string | null> {
  const idToParent = new Map<string, string | null>();
  for (const ch of normalizedChannels) {
    idToParent.set(ch.discordId, ch.parentDiscordId);
  }
  const result = new Map<string, string | null>();
  for (const ch of normalizedChannels) {
    let p: string | null = ch.parentDiscordId;
    const seen = new Set<string>();
    let resolved: string | null = null;
    while (p) {
      if (categoryDiscordIds.has(p)) {
        resolved = p;
        break;
      }
      if (seen.has(p)) break;
      seen.add(p);
      p = idToParent.get(p) ?? null;
    }
    result.set(ch.discordId, resolved);
  }
  return result;
}

/**
 * Guild sidebar interleaves categories and **categoryless** text/voice/news channels using one
 * ordered list. Positions can collide across those rows (e.g. category and root channel both 0);
 * `channels.json` array order is a stable tiebreak. Echo stores a contiguous index in
 * `echo_categories.position` and `echo_channels.position` (when `category_id` IS NULL) so the
 * client can merge with `mergeEchoChannelCategoriesWithRoots`.
 *
 * Channels **under** a category use Discord’s per-parent `position` only (different namespace).
 */
function buildDiscordTopLevelSidebarOrder(
  channels: DiscordRawChannel[],
): Map<string, number> {
  type Row = {
    discordId: string;
    discordPos: number;
    fileOrder: number;
  };
  const rows: Row[] = [];
  for (let fileOrder = 0; fileOrder < channels.length; fileOrder++) {
    const channel = channels[fileOrder]!;
    const tk = channelTypeKey(channel.type);
    const id = channel.id != null ? String(channel.id).trim() : '';
    if (!id) continue;
    const parentRaw = channel.parent_id ?? channel.parentId;
    const parent = normalizeDiscordParentId(parentRaw);
    if (tk === 'category') {
      rows.push({
        discordId: id,
        discordPos: safeImportPosition(
          channel.position ?? channel.rawPosition,
          fileOrder,
        ),
        fileOrder,
      });
      continue;
    }
    if (tk === 'text' || tk === 'voice' /* includes GUILD_STAGE_VOICE (13) */) {
      if (parent) continue;
      rows.push({
        discordId: id,
        discordPos: safeImportPosition(
          channel.position ?? channel.rawPosition,
          fileOrder,
        ),
        fileOrder,
      });
    }
    if (tk === 'forum') {
      if (parent) continue;
      rows.push({
        discordId: id,
        discordPos: safeImportPosition(
          channel.position ?? channel.rawPosition,
          fileOrder,
        ),
        fileOrder,
      });
    }
  }
  rows.sort(
    (a, b) =>
      a.discordPos - b.discordPos ||
      a.fileOrder - b.fileOrder ||
      a.discordId.localeCompare(b.discordId),
  );
  const map = new Map<string, number>();
  for (let i = 0; i < rows.length; i++) {
    map.set(rows[i]!.discordId, i);
  }
  return map;
}

/**
 * Discord channel type → coarse Echo kind.
 *
 * **GUILD_NEWS (type 5)** is imported as a **text** channel (same as GUILD_TEXT).
 * **GUILD_STAGE_VOICE (type 13)** is imported as **stage** with `iconKey` `sofa`
 * (see `normalizeDiscordChannels`) so stages are never skipped.
 * Channel permission overwrites from `overwrites.jsonl` are keyed by Discord
 * channel id; they apply to news channels unchanged, so typical announcement
 * setups (e.g. `@everyone` deny `SEND_MESSAGES`, moderator role allow) match
 * Discord when the export includes those rows.
 *
 * Thread types (10–12) and GUILD_MEDIA (16) are imported as **text** when present
 * in the export (e.g. `channel_threads.json` or API-shaped `channels.json`).
 */
function channelTypeKey(
  raw: unknown,
): 'category' | 'text' | 'voice' | 'stage' | 'forum' | 'unsupported' {
  const type =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d+$/.test(raw)
        ? Number(raw)
        : null;
  if (type === 4) return 'category';
  if (type === 0) return 'text';
  if (type === 2) return 'voice';
  /** GUILD_STAGE_VOICE */
  if (type === 13) return 'stage';
  /** GUILD_NEWS — same Echo channel kind as GUILD_TEXT; overwrites carry posting rules. */
  if (type === 5) return 'text';
  if (type === 15) return 'forum';
  /** ANNOUNCEMENT_THREAD, PUBLIC_THREAD, PRIVATE_THREAD */
  if (type === 10 || type === 11 || type === 12) return 'text';
  /** GUILD_DIRECTORY — not mapped in Echo. */
  if (type === 14) return 'unsupported';
  /** GUILD_MEDIA */
  if (type === 16) return 'text';
  return 'unsupported';
}

function safeImportPosition(raw: unknown, fallback = 0): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0)
    return Math.floor(raw);
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim()))
    return Number(raw.trim());
  return fallback;
}

function makeUniqueImportedRoleName(
  baseName: string,
  usedRoleNames: Set<string>,
): string {
  if (!usedRoleNames.has(baseName)) return baseName;
  const suffix = ' (Discord Imported)';
  const firstCandidate = `${baseName}${suffix}`;
  if (!usedRoleNames.has(firstCandidate)) return firstCandidate;
  let index = 2;
  while (true) {
    const candidate = `${baseName}${suffix} ${index}`;
    if (!usedRoleNames.has(candidate)) return candidate;
    index += 1;
  }
}

function normalizeDiscordCategories(
  channels: DiscordRawChannel[],
): NormalizedDiscordCategory[] {
  return channels
    .map((channel, index) => ({ channel, index }))
    .filter(({ channel }) => channelTypeKey(channel.type) === 'category')
    .map(({ channel, index }) => ({
      discordId: channel.id != null ? String(channel.id).trim() : '',
      name:
        typeof channel.name === 'string' && channel.name.trim()
          ? channel.name.trim()
          : 'Imported Category',
      position: safeImportPosition(
        channel.position ?? channel.rawPosition,
        index,
      ),
    }))
    .filter((category) => !!category.discordId)
    .sort(
      (a, b) =>
        a.position - b.position ||
        a.name.localeCompare(b.name) ||
        a.discordId.localeCompare(b.discordId),
    );
}

function normalizeDiscordChannels(
  channels: DiscordRawChannel[],
): NormalizedDiscordChannel[] {
  return channels
    .map((channel, index) => ({ channel, index }))
    .filter(({ channel }) => channelTypeKey(channel.type) !== 'category')
    .map(({ channel, index }) => {
      const discordTypeRaw =
        typeof channel.type === 'number' && Number.isFinite(channel.type)
          ? channel.type
          : typeof channel.type === 'string' &&
              /^\d+$/.test(String(channel.type).trim())
            ? Number(String(channel.type).trim())
            : null;
      const typeKey = channelTypeKey(channel.type);
      const kind: NormalizedDiscordChannel['kind'] =
        typeKey === 'voice'
          ? 'voice'
          : typeKey === 'stage'
            ? 'stage'
            : typeKey === 'forum'
              ? 'forum'
              : typeKey === 'text'
                ? 'text'
                : 'unsupported';
      const normalized: NormalizedDiscordChannel = {
        discordId: channel.id != null ? String(channel.id).trim() : '',
        kind,
        name:
          typeof channel.name === 'string' && channel.name.trim()
            ? channel.name.trim()
            : 'imported-channel',
        parentDiscordId: normalizeDiscordParentId(
          channel.parent_id ?? channel.parentId,
        ),
        position: safeImportPosition(
          channel.position ?? channel.rawPosition,
          index,
        ),
      };
      if (discordTypeRaw === 13) {
        normalized.iconKey = 'sofa';
      }
      if (typeof channel.rate_limit_per_user === 'number')
        normalized.slowmodeSeconds = Math.max(
          0,
          Math.floor(channel.rate_limit_per_user),
        );
      if (typeof channel.user_limit === 'number')
        normalized.userLimit = Math.max(0, Math.floor(channel.user_limit));
      if (typeof channel.bitrate === 'number')
        normalized.bitrateBps = Math.max(8_000, Math.floor(channel.bitrate));
      if (typeof channel.nsfw === 'boolean') normalized.nsfw = channel.nsfw;
      if (typeKey === 'forum') {
        const tagsRaw = channel.available_tags ?? channel.availableTags;
        const tags = normalizeDiscordForumAvailableTags(tagsRaw);
        if (tags) normalized.forumAvailableTags = tags;
      }
      return normalized;
    })
    .filter((channel) => !!channel.discordId)
    .sort((a, b) => {
      const aParent = a.parentDiscordId ?? '';
      const bParent = b.parentDiscordId ?? '';
      return (
        aParent.localeCompare(bParent) ||
        a.position - b.position ||
        a.name.localeCompare(b.name) ||
        a.discordId.localeCompare(b.discordId)
      );
    });
}

function buildDiscordImportPreview(
  bundle: LoadedBundle,
): DiscordImportPreviewDto {
  const mergedRows = mergeBundleChannelRows(bundle);
  const categories = normalizeDiscordCategories(bundle.channels);
  const channels = normalizeDiscordChannels(mergedRows);
  const categoryIds = new Set(categories.map((category) => category.discordId));
  const unsupported = channels.filter(
    (channel) => channel.kind === 'unsupported',
  );
  const categorized = channels.filter(
    (channel) => channel.kind !== 'unsupported',
  );
  const channelIds = new Set(categorized.map((c) => c.discordId));
  const channelToCategory = buildChannelDiscordIdToCategoryId(
    categorized,
    categoryIds,
  );

  const uncategorized = categorized.filter(
    (channel) => channelToCategory.get(channel.discordId) == null,
  );

  /** Broken refs: parent id is not a category and not another exported channel. */
  const orphaned = categorized.filter((channel) => {
    const p = channel.parentDiscordId;
    if (!p) return false;
    if (categoryIds.has(p)) return false;
    if (channelIds.has(p)) return false;
    return true;
  });

  const byParent = new Map<string, string[]>();
  for (const channel of categorized) {
    const resolved = channelToCategory.get(channel.discordId);
    let parentKey: string;
    if (resolved) {
      parentKey = resolved;
    } else if (!channel.parentDiscordId) {
      parentKey = '__uncategorized__';
    } else if (
      channel.parentDiscordId &&
      channelIds.has(channel.parentDiscordId)
    ) {
      parentKey = '__uncategorized__';
    } else {
      parentKey = `__orphan__:${channel.parentDiscordId}`;
    }
    const list = byParent.get(parentKey) ?? [];
    list.push(channel.name);
    byParent.set(parentKey, list);
  }

  const sampleBuckets: DiscordImportPreviewBucketDto[] = [];
  for (const category of categories) {
    const names = byParent.get(category.discordId) ?? [];
    sampleBuckets.push({
      key: category.discordId,
      label: category.name,
      channelNames: names.slice(0, 6),
      totalChannels: names.length,
    });
  }
  if (uncategorized.length > 0) {
    sampleBuckets.push({
      key: '__uncategorized__',
      label: 'Uncategorized',
      channelNames: uncategorized.map((channel) => channel.name).slice(0, 6),
      totalChannels: uncategorized.length,
    });
  }
  const orphanGroups = new Map<string, string[]>();
  for (const channel of orphaned) {
    const key = channel.parentDiscordId ?? 'missing-parent';
    const list = orphanGroups.get(key) ?? [];
    list.push(channel.name);
    orphanGroups.set(key, list);
  }
  for (const [missingParentId, names] of orphanGroups) {
    sampleBuckets.push({
      key: `__orphan__:${missingParentId}`,
      label: `Missing category ${missingParentId}`,
      channelNames: names.slice(0, 6),
      totalChannels: names.length,
    });
  }

  return {
    guildName:
      typeof bundle.guild.name === 'string' && bundle.guild.name.trim()
        ? bundle.guild.name.trim()
        : 'Discord Server',
    roleCount: bundle.roles.filter((role) => {
      const roleName = typeof role.name === 'string' ? role.name.trim() : '';
      return !!roleName;
    }).length,
    categoryCount: categories.length,
    channelCount: categorized.length,
    unsupportedChannelCount: unsupported.length,
    uncategorizedChannelCount: uncategorized.length,
    orphanedChannelCount: orphaned.length,
    sampleBuckets: sampleBuckets.slice(0, 8),
    warnings: bundle.warnings,
  };
}

async function importChannelsStep(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  options?: { force?: boolean },
): Promise<DiscordImportStepResult> {
  await ensureImportState(pool, serverId);
  const existingStateRow = await loadImportStateRow(pool, serverId);
  const sourceDir = await resolveImportBundleSourceDir(pool, serverId);
  const bundle = await loadBundle(sourceDir);
  const currentState = existingStateRow
    ? mapStateRow(existingStateRow)
    : await ensureImportState(pool, serverId);
  const force = options?.force === true;
  if (currentState.channelsImported && !force) return { state: currentState };
  if (!currentState.rolesImported) {
    throw new Error('Import Discord roles before importing channels.');
  }
  if (!currentState.membersImported) {
    throw new Error(
      'Import Discord members (user map + roles) before importing channels.',
    );
  }
  const roleIdMap = existingStateRow
    ? parseMapping(existingStateRow.role_id_map)
    : {};
  const discordToEchoUserMap = existingStateRow
    ? parseMapping(existingStateRow.discord_to_echo_user_map)
    : {};
  if (Object.keys(roleIdMap).length === 0) {
    throw new Error(
      'Discord role import mapping is missing; import roles again first.',
    );
  }

  const actorPerms = await getMergedRolePermissions(pool, serverId, actorId);
  if (!actorPerms.has('MANAGE_CHANNELS') && !actorPerms.has('MANAGE_GUILD')) {
    throw new Error(
      'You do not have permission to replace server channels (Manage Channels or Manage Server required).',
    );
  }

  await assertServerChannelsSafeToReplace(pool, serverId, force);

  const warnings = [...bundle.warnings];
  await pool.query(`DELETE FROM echo_channels WHERE server_id = $1`, [
    serverId,
  ]);
  await pool.query(`DELETE FROM echo_categories WHERE server_id = $1`, [
    serverId,
  ]);

  const mergedChannelRows = mergeBundleChannelRows(bundle);
  const normalizedCategories = normalizeDiscordCategories(bundle.channels);
  const normalizedChannels = normalizeDiscordChannels(mergedChannelRows);
  const categoryDiscordIds = new Set(
    normalizedCategories.map((c) => c.discordId),
  );
  const channelToCategoryDiscord = buildChannelDiscordIdToCategoryId(
    normalizedChannels,
    categoryDiscordIds,
  );
  const topLevelSidebarOrder = buildDiscordTopLevelSidebarOrder(
    bundle.channels,
  );
  const maxTopLevelSidebarIndex =
    topLevelSidebarOrder.size === 0
      ? -1
      : Math.max(...topLevelSidebarOrder.values());
  const categoryIdMap: ImportMapping = {};
  const channelIdMap: ImportMapping = {};
  let fallbackCategoryPosition = Math.max(
    maxTopLevelSidebarIndex + 1,
    normalizedCategories.length,
  );
  const orphanCategoryKeys = new Map<string, string>();
  const forumMetaByDiscordId = new Map<
    string,
    { echoChannelId: string; categoryId: string | null }
  >();

  for (const category of normalizedCategories) {
    const sidebarPos = topLevelSidebarOrder.get(category.discordId);
    const created = await createEchoCategory(pool, serverId, actorId, {
      name: category.name,
      position: sidebarPos ?? category.position,
    });
    if (created === 'forbidden')
      throw new Error(
        'You do not have permission to import Discord categories.',
      );
    if (created === 'invalid_body' || created === 'duplicate_name') {
      warnings.push(
        `Skipped Discord category "${category.name}" because Echo could not create it.`,
      );
      continue;
    }
    categoryIdMap[category.discordId] = created.categoryId;
  }

  async function createFallbackCategory(
    name: string,
    mapKey: string,
    warning?: string,
  ): Promise<string> {
    if (categoryIdMap[mapKey]) return categoryIdMap[mapKey]!;
    const created = await createEchoCategory(pool, serverId, actorId, {
      name,
      position: fallbackCategoryPosition++,
    });
    if (
      created === 'forbidden' ||
      created === 'invalid_body' ||
      created === 'duplicate_name'
    ) {
      throw new Error(
        `Discord channel import could not create fallback category "${name}".`,
      );
    }
    categoryIdMap[mapKey] = created.categoryId;
    if (warning) warnings.push(warning);
    return created.categoryId;
  }

  async function ensureCategoryForChannel(
    channel: NormalizedDiscordChannel,
  ): Promise<string | null> {
    const resolvedCat = channelToCategoryDiscord.get(channel.discordId) ?? null;
    if (resolvedCat && categoryIdMap[resolvedCat])
      return categoryIdMap[resolvedCat]!;
    if (!resolvedCat) {
      return null;
    }
    const orphanKey =
      orphanCategoryKeys.get(resolvedCat) ?? `__orphan__:${resolvedCat}`;
    orphanCategoryKeys.set(resolvedCat, orphanKey);
    return createFallbackCategory(
      `Imported Orphaned ${orphanCategoryKeys.size}`,
      orphanKey,
      `Discord channel "${channel.name}" referenced missing category ${resolvedCat}; imported into placeholder category.`,
    );
  }

  let firstImportedTextChannelId = '';
  for (const channel of normalizedChannels) {
    if (channel.kind === 'unsupported') {
      warnings.push(
        `Skipped unsupported Discord channel type for "${channel.name}".`,
      );
      continue;
    }
    const categoryId = await ensureCategoryForChannel(channel);
    const createdChannelId = await createEchoChannel(
      pool,
      serverId,
      channel.name,
      channel.kind,
      categoryId,
      channel.iconKey,
      channel.kind === 'forum' && channel.forumAvailableTags
        ? { forumAvailableTags: channel.forumAvailableTags }
        : undefined,
    );
    if (createdChannelId === 'invalid_category') {
      warnings.push(
        `Skipped Discord channel "${channel.name}" because its target category could not be resolved.`,
      );
      continue;
    }
    channelIdMap[channel.discordId] = createdChannelId;
    if (channel.kind === 'forum') {
      forumMetaByDiscordId.set(channel.discordId, {
        echoChannelId: createdChannelId,
        categoryId,
      });
    }
    const echoChannelPosition = channel.parentDiscordId
      ? channel.position
      : (topLevelSidebarOrder.get(channel.discordId) ?? channel.position);
    await pool.query(
      `UPDATE echo_channels SET position = $1 WHERE id = $2 AND server_id = $3`,
      [echoChannelPosition, createdChannelId, serverId],
    );
    if (!firstImportedTextChannelId && channel.kind === 'text')
      firstImportedTextChannelId = createdChannelId;
    const patchResult = await patchEchoChannel(
      pool,
      serverId,
      actorId,
      createdChannelId,
      {
        ...(channel.kind === 'text' && channel.slowmodeSeconds !== undefined
          ? { slowmodeSeconds: channel.slowmodeSeconds }
          : {}),
        ...(channel.kind === 'voice' && channel.userLimit !== undefined
          ? { userLimit: channel.userLimit }
          : {}),
        ...(channel.kind === 'voice' && channel.bitrateBps !== undefined
          ? { bitrateBps: channel.bitrateBps }
          : {}),
        ...(channel.nsfw !== undefined ? { nsfw: channel.nsfw } : {}),
      },
    );
    if (patchResult !== 'ok') {
      warnings.push(
        `Imported Discord channel "${channel.name}" but could not apply all channel settings.`,
      );
    }
  }

  const categoryOverwriteRows = new Map<
    string,
    EchoPermissionOverwriteRowInput[]
  >();
  const channelOverwriteRows = new Map<
    string,
    EchoPermissionOverwriteRowInput[]
  >();
  const guildId =
    typeof bundle.guild.id === 'string' ? bundle.guild.id.trim() : '';

  for (const overwrite of bundle.overwrites) {
    const discordScopeId =
      overwrite.channelId != null ? String(overwrite.channelId).trim() : '';
    const targetId = overwrite.id != null ? String(overwrite.id).trim() : '';
    if (!discordScopeId || !targetId) continue;
    const partial = overwritePartialFromAllowDeny(
      overwrite.allow,
      overwrite.deny,
    );
    if (Object.keys(partial).length === 0) continue;
    let row: EchoPermissionOverwriteRowInput | null = null;
    const targetType = overwriteTargetType(overwrite.type);
    if (targetType === 'role') {
      if (guildId && targetId === guildId) {
        row = { targetType: 'members', partial };
      } else if (roleIdMap[targetId]) {
        row = { targetType: 'role', targetId: roleIdMap[targetId], partial };
      } else {
        warnings.push(
          `Skipped a Discord role overwrite for unmapped role ${targetId}.`,
        );
        continue;
      }
    } else if (targetType === 'member') {
      const echoUserId = discordToEchoUserMap[targetId];
      if (echoUserId) {
        row = { targetType: 'member', targetId: echoUserId, partial };
      } else {
        warnings.push(
          `Skipped member-specific overwrite for ${targetId}; user is not in the import map.`,
        );
        continue;
      }
    } else {
      warnings.push(
        `Skipped a Discord overwrite with unsupported target type ${String(overwrite.type)}.`,
      );
      continue;
    }

    const echoCategoryId = categoryIdMap[discordScopeId];
    if (echoCategoryId) {
      const rows = categoryOverwriteRows.get(echoCategoryId) ?? [];
      rows.push(row);
      categoryOverwriteRows.set(echoCategoryId, rows);
      continue;
    }
    const echoChannelId = channelIdMap[discordScopeId];
    if (echoChannelId) {
      const rows = channelOverwriteRows.get(echoChannelId) ?? [];
      rows.push(row);
      channelOverwriteRows.set(echoChannelId, rows);
    }
  }

  for (const [categoryId, rows] of categoryOverwriteRows) {
    const result = await replaceEchoCategoryPermissionOverwrites(
      pool,
      serverId,
      actorId,
      categoryId,
      rows,
    );
    if (result !== 'ok') {
      warnings.push(
        `Some imported category overwrites could not be applied for ${categoryId}.`,
      );
    }
  }
  for (const [channelId, rows] of channelOverwriteRows) {
    const result = await replaceEchoChannelPermissionOverwrites(
      pool,
      serverId,
      actorId,
      channelId,
      rows,
    );
    if (result !== 'ok') {
      warnings.push(
        `Some imported channel overwrites could not be applied for ${channelId}.`,
      );
    }
  }

  const normalizedForumPosts = normalizeDiscordForumPosts(bundle.forumPosts);
  for (const post of normalizedForumPosts) {
    const meta = forumMetaByDiscordId.get(post.parentForumDiscordId);
    if (!meta) {
      warnings.push(
        `Skipped Discord forum post "${post.title}" because its parent forum channel ${post.parentForumDiscordId} was not imported.`,
      );
      continue;
    }
    const createdPostChannelId = await createEchoChannel(
      pool,
      serverId,
      post.title,
      'text',
      meta.categoryId,
      undefined,
      {
        parentChannelId: meta.echoChannelId,
        forumPostTagIds: post.appliedTagIds,
        forumPostPinned: post.pinned,
        forumPostLocked: post.locked,
        forumPostArchivedAt: post.archivedAt,
      },
    );
    if (createdPostChannelId === 'invalid_category') {
      warnings.push(
        `Skipped Discord forum post "${post.title}" because its target category could not be resolved.`,
      );
      continue;
    }
    channelIdMap[post.discordId] = createdPostChannelId;
    await copyEchoChannelPermissionOverwrites(
      pool,
      serverId,
      meta.echoChannelId,
      createdPostChannelId,
    );
    if (post.createdAt) {
      await pool.query(
        `UPDATE echo_channels SET created_at = $1 WHERE id = $2 AND server_id = $3`,
        [post.createdAt.toISOString(), createdPostChannelId, serverId],
      );
    }
  }

  const state = await saveImportState(pool, serverId, {
    channelsImported: true,
    categoryIdMap,
    channelIdMap,
    warnings,
    lastError: '',
  });
  return {
    state,
    ...(firstImportedTextChannelId
      ? { nextChannelId: firstImportedTextChannelId }
      : {}),
  };
}

export async function getDiscordImportState(
  pool: pg.Pool,
  serverId: string,
): Promise<DiscordImportStateDto | null> {
  const row = await loadImportStateRow(pool, serverId);
  if (!row) return null;
  const state = mapStateRow(row);
  try {
    const bundle = await loadBundle(state.sourceDir);
    state.preview = buildDiscordImportPreview(bundle);
    state.previewError = '';
    state.warnings = uniqueWarnings(state.warnings, state.preview.warnings);
  } catch (error) {
    state.preview = null;
    state.previewError =
      error instanceof Error ? error.message : 'Preview unavailable';
  }
  return state;
}

export async function runDiscordImportStep(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  step: DiscordImportStep,
  options?: { force?: boolean },
): Promise<DiscordImportStepResult> {
  await ensureImportState(pool, serverId);
  try {
    if (step === 'metadata')
      return await importMetadataStep(pool, serverId, actorId, options);
    if (step === 'roles')
      return await importRolesStep(pool, serverId, actorId, options);
    if (step === 'members')
      return await importMembersStep(pool, serverId, actorId);
    return await importChannelsStep(pool, serverId, actorId, options);
  } catch (error) {
    await recordImportFailure(pool, serverId, error);
    throw error;
  }
}

/**
 * Re-applies metadata and channel layout from the latest on-disk Discord export bundle.
 * Destructive to channels: replaces categories/channels and removes channel messages (same as channel import with force).
 * Requires a completed initial import (channels step done).
 */
export async function runDiscordImportRefreshFromExport(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
): Promise<DiscordImportStepResult> {
  await ensureImportState(pool, serverId);
  const row = await loadImportStateRow(pool, serverId);
  if (!row) {
    throw new Error('This server does not have a Discord import configured.');
  }
  const st = mapStateRow(row);
  if (!st.channelsImported) {
    throw new Error(
      'Finish the initial Discord import first. Use the import steps in Server Settings, then run Refresh from Discord export.',
    );
  }
  if (!st.rolesImported || !st.membersImported) {
    throw new Error(
      'Discord import is incomplete (roles or members). Complete those steps before refreshing.',
    );
  }
  await runDiscordImportStep(pool, serverId, actorId, 'metadata', {
    force: true,
  });
  return await runDiscordImportStep(pool, serverId, actorId, 'channels', {
    force: true,
  });
}

/**
 * Binds an Echo server’s Discord import to a specific Discord guild export folder under
 * {@link config.discordExportCollectionsRoot} (`{name}_{guildId}`).
 */
export async function bindDiscordImportGuild(
  pool: pg.Pool,
  serverId: string,
  discordGuildId: string,
): Promise<void> {
  const normalized = discordGuildId.trim();
  if (!/^\d{10,25}$/.test(normalized)) {
    throw new Error('Invalid Discord server id.');
  }
  const resolved = tryResolveDiscordExportDir(
    config.discordExportCollectionsRoot,
    normalized,
  );
  await ensureImportState(pool, serverId);
  if (resolved) {
    await pool.query(
      `UPDATE echo_discord_import_states SET discord_guild_id = $2, source_dir = $3, updated_at = NOW() WHERE server_id = $1`,
      [serverId, normalized, resolved],
    );
    return;
  }
  const root = config.discordExportCollectionsRoot;
  throw new Error(
    `Discord export folder not found for guild ${normalized} under "${root}". Set ECHO_DISCORD_EXPORTS_ROOT on the Echo API host to the directory where the export bot writes folders named …_${normalized}, then ensure the bot finished writing manifest.json and guild.json.`,
  );
}
