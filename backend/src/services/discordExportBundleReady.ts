import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function resolveDiscordExportDirByGuildId(
  exportsRoot: string,
  guildId: string,
): string | null {
  const root = exportsRoot.trim();
  const gid = guildId.trim();
  if (!root || !gid || !existsSync(root)) return null;
  const suffix = `_${gid}`;
  try {
    for (const name of readdirSync(root)) {
      if (!name.endsWith(suffix)) continue;
      const full = path.join(root, name);
      try {
        if (statSync(full).isDirectory()) return full;
      } catch {
        /* ignore unreadable path */
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function isDiscordExportBundleReady(
  exportsRoot: string,
  guildId: string,
): Promise<boolean> {
  const dir = resolveDiscordExportDirByGuildId(exportsRoot, guildId);
  if (!dir) return false;
  const manifestPath = path.join(dir, 'manifest.json');
  const guildPath = path.join(dir, 'guild.json');
  if (!existsSync(manifestPath) || !existsSync(guildPath)) return false;
  try {
    const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
    if (!isObject(parsed)) return false;
    const completeness = parsed.completeness;
    if (!isObject(completeness)) return false;
    return completeness.echoCoreOk === true;
  } catch {
    return false;
  }
}
