import type { Guild, GuildEmoji, Role, Sticker } from 'discord.js';
import { join } from 'node:path';
import { fetchWithRetry, runWithConcurrency } from '../util/rateLimitQueue.js';
import { ensureDir, writeBinary } from '../util/fs.js';

function extFromContentType(ct: string | null): string {
  if (!ct) return 'bin';
  if (ct.includes('png')) return 'png';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('webp')) return 'webp';
  return 'bin';
}

async function downloadOnce(
  url: string,
): Promise<
  { ok: true; buffer: Buffer; ext: string } | { ok: false; detail: string }
> {
  try {
    const res = await fetchWithRetry(url, undefined);
    if (!res.ok)
      return { ok: false, detail: `${res.status} ${res.statusText}` };
    const buffer = Buffer.from(await res.arrayBuffer());
    const ext = extFromContentType(res.headers.get('content-type'));
    return { ok: true, buffer, ext };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

export type AssetManifest = {
  guildIcon?: string;
  guildBanner?: string;
  guildSplash?: string;
  emojis: Record<string, string>;
  stickers: Record<string, string>;
  roleIcons: Record<string, string>;
  errors: string[];
};

export async function downloadGuildAssets(
  guild: Guild,
  assetsRoot: string,
): Promise<AssetManifest> {
  await ensureDir(assetsRoot);
  await ensureDir(join(assetsRoot, 'emojis'));
  await ensureDir(join(assetsRoot, 'stickers'));
  await ensureDir(join(assetsRoot, 'role_icons'));

  const errors: string[] = [];
  const manifest: AssetManifest = {
    emojis: {},
    stickers: {},
    roleIcons: {},
    errors: [],
  };

  const iconUrl = guild.iconURL({ size: 4096, extension: 'png' });
  if (iconUrl) {
    const got = await downloadOnce(iconUrl);
    if (got.ok) {
      const rel = `guild_icon.${got.ext}`;
      await writeBinary(join(assetsRoot, rel), got.buffer);
      manifest.guildIcon = `assets/${rel}`;
    } else errors.push(`guild_icon: ${got.detail}`);
  }

  const bannerUrl = guild.bannerURL({ size: 4096, extension: 'png' });
  if (bannerUrl) {
    const got = await downloadOnce(bannerUrl);
    if (got.ok) {
      const rel = `guild_banner.${got.ext}`;
      await writeBinary(join(assetsRoot, rel), got.buffer);
      manifest.guildBanner = `assets/${rel}`;
    } else errors.push(`guild_banner: ${got.detail}`);
  }

  const splashUrl = guild.splashURL({ size: 4096, extension: 'png' });
  if (splashUrl) {
    const got = await downloadOnce(splashUrl);
    if (got.ok) {
      const rel = `guild_splash.${got.ext}`;
      await writeBinary(join(assetsRoot, rel), got.buffer);
      manifest.guildSplash = `assets/${rel}`;
    } else errors.push(`guild_splash: ${got.detail}`);
  }

  await guild.emojis.fetch();
  const emojis = [...guild.emojis.cache.values()];
  await runWithConcurrency(emojis, 6, async (e: GuildEmoji) => {
    const url = e.imageURL({ extension: 'png', size: 128 });
    if (!url) return;
    const got = await downloadOnce(url);
    if (!got.ok) {
      errors.push(`emoji ${e.id}: ${got.detail}`);
      return;
    }
    const safeName = `${(e.name ?? 'emoji').replace(/[^\w.-]+/g, '_')}_${e.id}.${got.ext}`;
    const rel = join('emojis', safeName);
    await writeBinary(join(assetsRoot, rel), got.buffer);
    manifest.emojis[e.id] = `assets/${rel.replace(/\\/g, '/')}`;
  });

  await guild.stickers.fetch();
  const stickers = [...guild.stickers.cache.values()];
  await runWithConcurrency(stickers, 6, async (s: Sticker) => {
    const url = s.url;
    if (!url) return;
    const got = await downloadOnce(url);
    if (!got.ok) {
      errors.push(`sticker ${s.id}: ${got.detail}`);
      return;
    }
    const safe = `${(s.name ?? 'sticker').replace(/[^\w.-]+/g, '_')}_${s.id}.${got.ext}`;
    const rel = join('stickers', safe);
    await writeBinary(join(assetsRoot, rel), got.buffer);
    manifest.stickers[s.id] = `assets/${rel.replace(/\\/g, '/')}`;
  });

  const rolesWithIcons = [...guild.roles.cache.values()].filter((r: Role) =>
    Boolean(r.icon),
  );
  await runWithConcurrency(rolesWithIcons, 6, async (r: Role) => {
    const url = r.iconURL({ extension: 'png', size: 256 });
    if (!url) return;
    const got = await downloadOnce(url);
    if (!got.ok) {
      errors.push(`role_icon ${r.id}: ${got.detail}`);
      return;
    }
    const rel = join('role_icons', `${r.id}.${got.ext}`);
    await writeBinary(join(assetsRoot, rel), got.buffer);
    manifest.roleIcons[r.id] = `assets/${rel.replace(/\\/g, '/')}`;
  });

  manifest.errors = errors;
  return manifest;
}
