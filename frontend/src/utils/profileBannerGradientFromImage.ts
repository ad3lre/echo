import { isLikelyGifImageUrl } from '@/utils/isGifImageUrl';
import { safeImageUrl } from '@/utils/safeImageUrl';
import {
  DEFAULT_PROFILE_BANNER_SOLID_HEX,
  isLinearGradientProfileBannerColor,
  normalizeProfileBannerColor,
} from '@shared/profileBannerColor';

export { DEFAULT_PROFILE_BANNER_SOLID_HEX };

/** Compact gradient string; API caps `bannerColor` at 200 chars (`auth/me` schema). */
const FALLBACK_GRADIENT = 'linear-gradient(122deg,#6366f1,#a78bfa,#312e81)';

/**
 * Coerce stored/API `bannerColor` for the settings form: never `""`, never non-hex solids.
 * Preserves safe `linear-gradient(...)` strings, but drops URL/function CSS.
 */
export function normalizeBannerColorForForm(
  raw: string | null | undefined,
): string {
  return normalizeProfileBannerColor(raw, DEFAULT_PROFILE_BANNER_SOLID_HEX);
}

function profileBannerColorOnlyBackdropStyle(
  bannerColor: string,
): Record<string, string> {
  const safeBannerColor = normalizeProfileBannerColor(bannerColor);
  if (isLinearGradientProfileBannerColor(safeBannerColor)) {
    return {
      backgroundImage: safeBannerColor,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return { backgroundColor: safeBannerColor };
}

/**
 * Styles for blurred refraction layers. Do not use animated image URLs here:
 * CSS `background-image` GIFs (and some hosts) loop forever with no loop budget.
 */
export function profileBannerRefractionBackdropStyle(
  bannerColor: string,
  bannerImage?: string | null,
  bannerPositionY?: number,
): Record<string, string> {
  const positionY =
    typeof bannerPositionY === 'number' && Number.isFinite(bannerPositionY)
      ? Math.max(0, Math.min(100, bannerPositionY))
      : 50;
  const raw = bannerImage?.trim();
  if (raw) {
    const safe = safeImageUrl(raw);
    if (isLikelyGifImageUrl(safe)) {
      return profileBannerColorOnlyBackdropStyle(bannerColor);
    }
    return {
      backgroundImage: `url(${safe})`,
      backgroundSize: 'cover',
      backgroundPosition: `center ${positionY}%`,
    };
  }
  return profileBannerColorOnlyBackdropStyle(bannerColor);
}

export function profileBannerFallbackLayerStyle(
  bannerColor: string,
  bannerImage?: string,
): Record<string, string> {
  if (bannerImage) {
    return {
      backgroundImage: `url(${bannerImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  const safeBannerColor = normalizeProfileBannerColor(bannerColor);
  if (isLinearGradientProfileBannerColor(safeBannerColor)) {
    return {
      backgroundImage: safeBannerColor,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return { backgroundColor: safeBannerColor };
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const expanded =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(expanded, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex(r: number, g: number, b: number): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
  return `#${((c(r) << 16) | (c(g) << 8) | c(b)).toString(16).padStart(6, '0')}`;
}

function mixHex(a: string, b: string, t: number): string {
  const A = parseHex(a);
  const B = parseHex(b);
  return toHex(
    A.r + (B.r - A.r) * t,
    A.g + (B.g - A.g) * t,
    A.b + (B.b - A.b) * t,
  );
}

function darkenHex(hex: string, amount: number): string {
  return mixHex(hex, '#000000', amount);
}

function lightenHex(hex: string, amount: number): string {
  return mixHex(hex, '#ffffff', amount);
}

function rgbToHueDeg(r255: number, g255: number, b255: number): number {
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 1e-5) return 0;
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) / 6
      : max === g
        ? ((b - r) / d + 2) / 6
        : ((r - g) / d + 4) / 6;
  return h * 360;
}

function saturation(r255: number, g255: number, b255: number): number {
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-6) return 0;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

function lightness(r255: number, g255: number, b255: number): number {
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return (max + min) / 2;
}

type HueBin = { r: number; g: number; b: number; w: number };

/**
 * Samples a small downscaled bitmap and builds a short multi-stop linear gradient
 * for use as `bannerColor` when no banner image is set.
 */
export async function deriveProfileBannerGradientFromImageSource(
  source: File | Blob | string,
): Promise<string> {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  const needRevoke = typeof source !== 'string';

  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('image load failed'));
      img.src = url;
    });

    const side = 48;
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return FALLBACK_GRADIENT;

    ctx.drawImage(img, 0, 0, side, side);
    const { data } = ctx.getImageData(0, 0, side, side);

    const bins: HueBin[] = Array.from({ length: 8 }, () => ({
      r: 0,
      g: 0,
      b: 0,
      w: 0,
    }));

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3]!;
      if (a < 28) continue;
      const r = data[i]!;
      const g = data[i + 1]!;
      const bl = data[i + 2]!;
      const s = saturation(r, g, bl);
      const l = lightness(r, g, bl);
      if (s < 0.1 || l < 0.07 || l > 0.97) continue;
      const hue = rgbToHueDeg(r, g, bl);
      const binIdx = Math.min(7, Math.floor(hue / 45));
      const w = s * s * (0.55 + Math.cos((l - 0.42) * Math.PI) * 0.35);
      const bin = bins[binIdx]!;
      bin.r += r * w;
      bin.g += g * w;
      bin.b += bl * w;
      bin.w += w;
    }

    const ranked = bins.filter((b) => b.w > 0.001).sort((a, b) => b.w - a.w);

    if (ranked.length === 0) return FALLBACK_GRADIENT;

    const avg = (bin: HueBin) =>
      toHex(bin.r / bin.w, bin.g / bin.w, bin.b / bin.w);

    const c1 = avg(ranked[0]!);
    let c2: string;
    if (ranked.length >= 2 && ranked[1]!.w > ranked[0]!.w * 0.18) {
      c2 = avg(ranked[1]!);
    } else {
      c2 = lightenHex(mixHex(c1, '#a78bfa', 0.35), 0.12);
    }

    const c3 = darkenHex(c1, 0.52);
    const grad = `linear-gradient(122deg,${c1},${c2},${c3})`;
    return grad.length <= 200 ? grad : FALLBACK_GRADIENT;
  } catch {
    return FALLBACK_GRADIENT;
  } finally {
    if (needRevoke) URL.revokeObjectURL(url);
  }
}
