/**
 * Copies Twemoji SVG assets from @twemoji/svg, converts each to WebP using sharp,
 * and outputs to frontend/public/twemoji/ (e.g. 1f600.svg -> 1f600.webp).
 *
 * Incremental: when frontend/public/twemoji/.echo-twemoji-fingerprint.json matches
 * @twemoji/svg package version + this script's SHA-256 + stored svg count, skips
 * without scanning node_modules/@twemoji/svg or loading sharp (~fast no-op).
 *
 * Flags / env:
 *   --force  Regenerate all WebP and rewrite fingerprint.
 *   ECHO_SKIP_TWEMOJI_COPY=1  Never convert; exit 0 only if incremental check passes.
 *       Use only when assets are already complete for the current package + script.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const sourceDir = path.resolve(__dirname, '../node_modules/@twemoji/svg');
const targetDir = path.resolve(__dirname, '../frontend/public/twemoji');
const fingerprintFile = path.join(targetDir, '.echo-twemoji-fingerprint.json');
const force = process.argv.includes('--force');
const skipOnly =
  process.env.ECHO_SKIP_TWEMOJI_COPY === '1' ||
  process.env.ECHO_SKIP_TWEMOJI_COPY === 'true';

function requireSharp() {
  try {
    return require('sharp');
  } catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND') {
      console.error(
        'Missing dependency: sharp (needed to convert Twemoji SVG → WebP).\n' +
          'From the repository root run: npm install\n' +
          'If install fails or sharp has no binary for your Node version, use Node 20 LTS.',
      );
      process.exit(1);
    }
    throw e;
  }
}

function readTwemojiPkgVersion() {
  const pkgPath = path.join(sourceDir, 'package.json');
  const raw = fs.readFileSync(pkgPath, 'utf8');
  const j = JSON.parse(raw);
  return typeof j.version === 'string' ? j.version : '';
}

function scriptSha256() {
  const buf = fs.readFileSync(__filename);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function countWebpInTarget() {
  if (!fs.existsSync(targetDir)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(targetDir)) {
    if (f.endsWith('.webp')) n++;
  }
  return n;
}

/**
 * Fast path: no source dir listing; only target readdir + small reads.
 * Assumes @twemoji/svg version fully identifies the SVG set (same version ⇒ same file count).
 */
function tryIncrementalSkip() {
  if (force) return false;
  if (!fs.existsSync(sourceDir)) return false;

  let pkgVersion;
  try {
    pkgVersion = readTwemojiPkgVersion();
  } catch {
    return false;
  }
  const scriptHash = scriptSha256();

  if (!fs.existsSync(fingerprintFile)) return false;

  let fp;
  try {
    fp = JSON.parse(fs.readFileSync(fingerprintFile, 'utf8'));
  } catch {
    return false;
  }
  if (
    !fp ||
    typeof fp.svgCount !== 'number' ||
    fp.pkgVersion !== pkgVersion ||
    fp.scriptSha256 !== scriptHash
  ) {
    return false;
  }

  const webpCount = countWebpInTarget();
  return webpCount === fp.svgCount;
}

function writeFingerprint(svgCount, pkgVersion, scriptHash) {
  const body = {
    pkgVersion,
    scriptSha256: scriptHash,
    svgCount,
  };
  fs.writeFileSync(
    fingerprintFile,
    `${JSON.stringify(body, null, 2)}\n`,
    'utf8',
  );
}

async function copyTwemoji() {
  if (!fs.existsSync(sourceDir)) {
    console.error('@twemoji/svg not found. Run npm install first.');
    process.exit(1);
  }

  const pkgVersion = readTwemojiPkgVersion();
  const scriptHash = scriptSha256();

  if (tryIncrementalSkip()) {
    console.log(
      'Twemoji WebP up to date (fingerprint matches @twemoji/svg ' +
        pkgVersion +
        '). Skipping.',
    );
    return;
  }

  const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.svg'));
  const existingWebp = countWebpInTarget();

  // Upgrade path: tree built before fingerprints existed; write fp without reconverting.
  if (
    !force &&
    !fs.existsSync(fingerprintFile) &&
    existingWebp === files.length &&
    files.length > 0
  ) {
    writeFingerprint(files.length, pkgVersion, scriptHash);
    console.log(
      'Twemoji WebP assets already exist (' +
        existingWebp +
        ' files). Wrote fingerprint; future builds skip without scanning @twemoji/svg.',
    );
    return;
  }

  if (skipOnly) {
    console.error(
      'ECHO_SKIP_TWEMOJI_COPY is set but Twemoji assets are missing or stale.\n' +
        `  Source SVGs: ${files.length}; WebP on disk: ${existingWebp}.\n` +
        'Unset ECHO_SKIP_TWEMOJI_COPY or run: npm run twemoji -- --force',
    );
    process.exit(1);
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const total = files.length;
  const progressEvery = 250;
  console.log(
    'Converting ' +
      total +
      ' Twemoji SVGs to WebP (first run or --force can take a few minutes; no freeze).',
  );

  const sharp = requireSharp();

  let converted = 0;
  for (const file of files) {
    const baseName = path.basename(file, '.svg');
    const outputPath = path.join(targetDir, baseName + '.webp');
    const svgBuffer = fs.readFileSync(path.join(sourceDir, file));

    // ~1em UI display; 64px covers ~2× DPR for emoji up to ~32px without shipping 128px tiles.
    await sharp(svgBuffer)
      .resize(64, 64)
      .webp({ quality: 82, effort: 6 })
      .toFile(outputPath);
    converted++;
    if (converted % progressEvery === 0 || converted === total) {
      console.log('Twemoji: ' + converted + '/' + total + ' WebP');
    }
  }

  writeFingerprint(files.length, pkgVersion, scriptHash);

  console.log(
    'Converted ' +
      converted +
      ' Twemoji SVG files to WebP in frontend/public/twemoji/',
  );
}

copyTwemoji().catch((err) => {
  console.error(err);
  process.exit(1);
});
