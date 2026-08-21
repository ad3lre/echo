/* eslint-disable no-console */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const repoRoot = path.join(__dirname, '../../..');
const assetsRoot = path.join(repoRoot, 'clients', 'web', 'src', 'assets');
const textSearchRoots = [
  path.join(repoRoot, 'clients', 'web', 'src'),
  path.join(repoRoot, 'contracts'),
  path.join(repoRoot, 'server', 'backend'),
];
const textFileExts = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.vue',
  '.json',
  '.md',
  '.scss',
  '.css',
  '.html',
  '.yml',
  '.yaml',
]);
const convertExts = new Set(['.png', '.jpg', '.jpeg']);
const skipPathTokens = ['icons', 'emoji'];
/** Mock avatars / server icons: UI w-8/w-10 (~32–40px); ~2× DPR → cap ~96px. */
const AVATAR_MAX_PX = 96;
/** Slightly lossier OK at small display sizes (Lighthouse “compression factor”). */
const AVATAR_WEBP_QUALITY = 80;
const AVATAR_WEBP_TOP_DIRS = new Set(['users', 'server_icons']);

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function shouldSkipPath(absPath) {
  const rel = toPosix(path.relative(assetsRoot, absPath)).toLowerCase();
  return skipPathTokens.some(
    (token) => rel.includes(`/${token}/`) || rel.startsWith(`${token}/`),
  );
}

async function walk(dir, visitor) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(absPath, visitor);
      continue;
    }
    if (entry.isFile()) {
      await visitor(absPath);
    }
  }
}

async function convertAssets() {
  const converted = [];

  await walk(assetsRoot, async (absPath) => {
    const ext = path.extname(absPath).toLowerCase();
    if (!convertExts.has(ext)) return;
    if (shouldSkipPath(absPath)) return;

    const webpPath = absPath.replace(/\.(png|jpe?g)$/i, '.webp');
    const inputStat = await fs.stat(absPath);
    let shouldConvert = true;

    try {
      const outputStat = await fs.stat(webpPath);
      shouldConvert = outputStat.mtimeMs < inputStat.mtimeMs;
    } catch {
      shouldConvert = true;
    }

    if (shouldConvert) {
      const relToAssets = toPosix(path.relative(assetsRoot, absPath));
      const topDir = relToAssets.split('/')[0];
      let pipeline = sharp(absPath);
      if (topDir && AVATAR_WEBP_TOP_DIRS.has(topDir)) {
        pipeline = pipeline.resize(AVATAR_MAX_PX, AVATAR_MAX_PX, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }
      await pipeline.webp({ quality: AVATAR_WEBP_QUALITY }).toFile(webpPath);
      console.log(
        `Converted: ${toPosix(path.relative(repoRoot, absPath))} -> ${toPosix(path.relative(repoRoot, webpPath))}`,
      );
    }

    converted.push({ from: absPath, to: webpPath });
  });

  return converted;
}

async function resizeLargeWebpAvatars() {
  let count = 0;
  let skipped = 0;
  await walk(assetsRoot, async (absPath) => {
    if (path.extname(absPath).toLowerCase() !== '.webp') return;
    const rel = toPosix(path.relative(assetsRoot, absPath));
    const top = rel.split('/')[0];
    if (!top || !AVATAR_WEBP_TOP_DIRS.has(top)) return;

    try {
      // Read into a buffer first—on Windows this often succeeds when sharp(path) is blocked by indexing/IDE locks.
      const raw = await fs.readFile(absPath);
      const meta = await sharp(raw).metadata();
      if (!meta.width || !meta.height) return;
      const maxDim = Math.max(meta.width, meta.height);
      if (maxDim <= AVATAR_MAX_PX) return;

      const buf = await sharp(raw)
        .resize(AVATAR_MAX_PX, AVATAR_MAX_PX, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: AVATAR_WEBP_QUALITY })
        .toBuffer();
      await fs.writeFile(absPath, buf);
      count += 1;
      console.log(`Resized: ${toPosix(path.relative(repoRoot, absPath))}`);
    } catch {
      skipped += 1;
    }
  });
  if (skipped > 0) {
    console.warn(
      `Skipped ${skipped} avatar resize(s) (file locked or unreadable). Close editors and run: npm run assets:webp`,
    );
  }
  return count;
}

/** Default profile pic under icons/ (skipped by raster→webp walk). */
async function convertPfpPngToWebp() {
  const pfpPng = path.join(assetsRoot, 'icons', 'pfp.png');
  const pfpWebp = path.join(assetsRoot, 'icons', 'pfp.webp');
  try {
    await fs.access(pfpPng);
  } catch {
    return 0;
  }
  const buf = await sharp(pfpPng)
    .resize(AVATAR_MAX_PX, AVATAR_MAX_PX, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: AVATAR_WEBP_QUALITY })
    .toBuffer();
  await fs.writeFile(pfpWebp, buf);
  await fs.unlink(pfpPng);
  console.log(
    `Converted: ${toPosix(path.relative(repoRoot, pfpPng))} -> ${toPosix(path.relative(repoRoot, pfpWebp))}`,
  );
  return 1;
}

async function rewriteTextReferences(conversions) {
  if (!conversions.length) return 0;

  const replacements = new Map();
  for (const { from, to } of conversions) {
    const fromRelRepo = toPosix(path.relative(repoRoot, from));
    const toRelRepo = toPosix(path.relative(repoRoot, to));
    replacements.set(fromRelRepo, toRelRepo);

    const fromRelAssets = toPosix(path.relative(assetsRoot, from));
    const toRelAssets = toPosix(path.relative(assetsRoot, to));
    replacements.set(fromRelAssets, toRelAssets);
  }

  let updatedFiles = 0;
  for (const root of textSearchRoots) {
    await walk(root, async (absPath) => {
      const ext = path.extname(absPath).toLowerCase();
      if (!textFileExts.has(ext)) return;

      let content = await fs.readFile(absPath, 'utf8');
      const original = content;

      for (const [fromRel, toRel] of replacements.entries()) {
        const escaped = fromRel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        content = content.replace(new RegExp(escaped, 'g'), toRel);

        const fromBase = path.basename(fromRel);
        const toBase = path.basename(toRel);
        const escapedBase = fromBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        content = content.replace(new RegExp(escapedBase, 'g'), toBase);
      }

      if (content !== original) {
        await fs.writeFile(absPath, content, 'utf8');
        updatedFiles += 1;
        console.log(
          `Updated refs: ${toPosix(path.relative(repoRoot, absPath))}`,
        );
      }
    });
  }

  return updatedFiles;
}

async function main() {
  const conversions = await convertAssets();
  const updatedFiles = await rewriteTextReferences(conversions);
  const pfpDone = await convertPfpPngToWebp();
  const resized = await resizeLargeWebpAvatars();

  console.log(
    `\nDone. Converted ${conversions.length} asset(s). Updated ${updatedFiles} file(s). pfp: ${pfpDone}. Resized webp: ${resized}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
