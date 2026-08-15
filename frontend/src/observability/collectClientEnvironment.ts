import type { ClientEnvironmentSnapshot } from '@shared/clientEnvironment';
import {
  isIosLikeBrowser,
  isStandaloneDisplayMode,
} from '@/platform/browserCompatibility';
import { detectGpuTier } from '@/utils/gpuTier';

function userAgent(): string {
  return typeof navigator !== 'undefined' ? navigator.userAgent : '';
}

function detectOsFamily(ua: string): ClientEnvironmentSnapshot['osFamily'] {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/CrOS/i.test(ua)) return 'chromeos';
  if (/Windows NT/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos';
  if (/Linux/i.test(ua)) return 'linux';
  return 'unknown';
}

function detectDeviceForm(ua: string): ClientEnvironmentSnapshot['deviceForm'] {
  if (/iPad/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    return 'tablet';
  }
  if (
    /iPhone|iPod/i.test(ua) ||
    (/Android/i.test(ua) && /Mobile/i.test(ua)) ||
    (isIosLikeBrowser() && /Mobile/i.test(ua))
  ) {
    return 'phone';
  }
  if (/Windows NT|Macintosh|Mac OS X|Linux/i.test(ua) && !/Mobile/i.test(ua)) {
    return 'desktop';
  }
  return 'unknown';
}

function detectBrowserFamily(
  ua: string,
): ClientEnvironmentSnapshot['browserFamily'] {
  if (/Electron/i.test(ua)) return 'echo_desktop';
  if (/Edg\//i.test(ua)) return 'edge';
  if (/OPR\/|Opera/i.test(ua)) return 'opera';
  if (/Firefox\//i.test(ua)) return 'firefox';
  if (/CriOS\//i.test(ua)) return 'chrome';
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'chrome';
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'safari';
  return 'unknown';
}

function detectDisplayMode(): ClientEnvironmentSnapshot['displayMode'] {
  return isStandaloneDisplayMode() ? 'standalone' : 'browser';
}

function detectViewportBucket(): ClientEnvironmentSnapshot['viewportBucket'] {
  const w =
    typeof window !== 'undefined'
      ? window.innerWidth || document.documentElement?.clientWidth || 0
      : 0;
  if (w < 640) return 'xs';
  if (w < 768) return 'sm';
  if (w < 1024) return 'md';
  if (w < 1280) return 'lg';
  return 'xl';
}

function detectLocale(): string {
  const raw =
    typeof navigator !== 'undefined'
      ? navigator.language || navigator.languages?.[0] || 'en'
      : 'en';
  const t = raw.trim().slice(0, 16);
  return /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/i.test(t) ? t : 'en';
}

function detectTouch(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (navigator.maxTouchPoints ?? 0) > 0;
}

function detectColorScheme(): ClientEnvironmentSnapshot['colorScheme'] {
  if (typeof window === 'undefined') return 'unknown';
  try {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
  } catch {
    /* ignore */
  }
  return 'unknown';
}

function detectConnectionType(): ClientEnvironmentSnapshot['connectionType'] {
  if (typeof navigator === 'undefined') return 'unknown';
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string };
  };
  const t = nav.connection?.effectiveType?.trim().toLowerCase();
  if (t === 'slow-2g' || t === '2g' || t === '3g' || t === '4g') {
    return t;
  }
  return 'unknown';
}

/** Collect a PII-safe, coarse client environment snapshot for analytics. */
export function collectClientEnvironment(): ClientEnvironmentSnapshot {
  const ua = userAgent();
  return {
    shell: 'web',
    osFamily: detectOsFamily(ua),
    deviceForm: detectDeviceForm(ua),
    browserFamily: detectBrowserFamily(ua),
    displayMode: detectDisplayMode(),
    gpuTier: detectGpuTier(),
    viewportBucket: detectViewportBucket(),
    locale: detectLocale(),
    touch: detectTouch(),
    colorScheme: detectColorScheme(),
    connectionType: detectConnectionType(),
  };
}
