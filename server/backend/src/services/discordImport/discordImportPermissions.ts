import {
  DISCORD_ECHO_PERMISSION_STRINGS,
  ECHO_DISABLED_DISCORD_PERMISSION_NAMES,
} from '../../../../../contracts/discordEchoPermissions';

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

export function parseBitfield(raw: unknown): bigint {
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

export function permissionsFromBitfield(raw: unknown): string[] {
  const bitfield = parseBitfield(raw);
  if (bitfield === 0n) return [];
  return DISCORD_PERMISSION_BIT_TO_NAME.filter(
    (entry: { name: string; bit: bigint }) =>
      (bitfield & entry.bit) === entry.bit,
  )
    .map((entry: { name: string; bit: bigint }) => entry.name)
    .filter(
      (n) =>
        !THREAD_PERMISSION_NAMES.has(n) &&
        !ECHO_DISABLED_DISCORD_PERMISSION_NAMES.has(n),
    );
}

export function overwritePartialFromAllowDeny(
  allowRaw: unknown,
  denyRaw: unknown,
): Record<string, boolean> {
  const allow = parseBitfield(allowRaw);
  const deny = parseBitfield(denyRaw);
  const out: Record<string, boolean> = {};
  for (const entry of DISCORD_PERMISSION_BIT_TO_NAME) {
    if (
      THREAD_PERMISSION_NAMES.has(entry.name) ||
      ECHO_DISABLED_DISCORD_PERMISSION_NAMES.has(entry.name)
    )
      continue;
    if ((deny & entry.bit) === entry.bit) out[entry.name] = false;
    if ((allow & entry.bit) === entry.bit) out[entry.name] = true;
  }
  return out;
}
