/**
 * Rasterize Echo branding SVG into PNGs (PWA, favicon sources, in-app logos).
 * Safari mishandles the filter/mask-heavy SVG masters; pre-rendered PNGs stay crisp.
 * Depends on root devDependency `sharp`.
 */
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const roundedSvgPath = join(repoRoot, 'frontend/public/echo-rounded-trans.svg');
const echoMarkSvgPath = join(repoRoot, 'frontend/src/assets/icons/echo.svg');
const outDir = join(repoRoot, 'frontend/public/icons');
const marketingIconsDir = join(repoRoot, 'marketing/public/icons');

const THEME_BG = { r: 13, g: 8, b: 18, alpha: 1 }; // #0d0812 (boot splash)

const BRAND_RASTER_SIZE = 512;
const BRAND_RASTER_DENSITY = 450;

function rasterizeRounded(size, density = 3) {
  return sharp(roundedSvgPath, { density })
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png();
}

/** Square canvas, non-square logo letterboxed with transparency. */
async function rasterizeBrandAsset(absSvgPath, outPath) {
  await mkdir(dirname(outPath), { recursive: true });
  await sharp(absSvgPath, { density: BRAND_RASTER_DENSITY })
    .resize(BRAND_RASTER_SIZE, BRAND_RASTER_SIZE, {
      fit: 'inside',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  await mkdir(marketingIconsDir, { recursive: true });

  await rasterizeBrandAsset(
    echoMarkSvgPath,
    join(repoRoot, 'frontend/src/assets/icons/echo-logo.png'),
  );
  await rasterizeBrandAsset(
    echoMarkSvgPath,
    join(repoRoot, 'frontend/public/echo-logo.png'),
  );
  await rasterizeBrandAsset(
    roundedSvgPath,
    join(repoRoot, 'frontend/src/assets/icons/echo-rounded-logo.png'),
  );
  await rasterizeBrandAsset(
    roundedSvgPath,
    join(repoRoot, 'frontend/public/echo-rounded-logo.png'),
  );
  await rasterizeBrandAsset(
    roundedSvgPath,
    join(repoRoot, 'marketing/public/echo-rounded-logo.png'),
  );

  await rasterizeRounded(16).toFile(join(outDir, 'favicon-16.png'));
  await rasterizeRounded(32).toFile(join(outDir, 'favicon-32.png'));
  await rasterizeRounded(16).toFile(join(marketingIconsDir, 'favicon-16.png'));
  await rasterizeRounded(32).toFile(join(marketingIconsDir, 'favicon-32.png'));
  await rasterizeRounded(192).toFile(join(outDir, 'pwa-192.png'));
  await rasterizeRounded(512).toFile(join(outDir, 'pwa-512.png'));

  // iOS / Safari pinned tab
  const p180 = await rasterizeRounded(180);
  await p180.toFile(join(outDir, 'apple-touch-icon.png'));

  // Maskable: icon centered on theme background (safe for adaptive icon crops)
  const inner = Math.round(512 * 0.72);
  const innerBuf = await rasterizeRounded(inner, 4).toBuffer();
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: THEME_BG,
    },
  })
    .composite([{ input: innerBuf, gravity: 'center' }])
    .png()
    .toFile(join(outDir, 'pwa-maskable-512.png'));

  await rasterizeRounded(32).toFile(
    join(repoRoot, 'frontend/public/favicon.ico'),
  );

  console.log(
    'PWA + brand PNGs written (public/icons/, favicon.ico, echo-logo.png, echo-rounded-logo.png).',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
