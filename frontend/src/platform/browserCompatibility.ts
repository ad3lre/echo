export type EchoPageNotificationPreviewMode =
  | 'supported'
  | 'standalone-only'
  | 'unsupported';

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

function getNavigator(): Navigator | null {
  return typeof navigator === 'undefined' ? null : navigator;
}

function getWindow(): Window | null {
  return typeof window === 'undefined' ? null : window;
}

function userAgent(): string {
  return getNavigator()?.userAgent ?? '';
}

function platform(): string {
  return getNavigator()?.platform ?? '';
}

function maxTouchPoints(): number {
  return getNavigator()?.maxTouchPoints ?? 0;
}

export function isIosLikeBrowser(): boolean {
  const ua = userAgent();
  if (/\b(iPhone|iPad|iPod)\b/i.test(ua)) return true;
  return platform() === 'MacIntel' && maxTouchPoints() > 1;
}

export function isSafariLikeBrowser(): boolean {
  const nav = getNavigator();
  const ua = userAgent();
  const vendor = nav?.vendor ?? '';
  if (!vendor.includes('Apple')) return false;
  if (!/Safari/i.test(ua)) return false;
  return !/(Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS|SamsungBrowser)/i.test(ua);
}

export function isStandaloneDisplayMode(): boolean {
  const nav = getNavigator() as NavigatorWithStandalone | null;
  const win = getWindow();
  if (nav?.standalone === true) return true;
  try {
    return !!win?.matchMedia?.('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

export function supportsAudioOutputSelection(): boolean {
  return (
    typeof HTMLMediaElement !== 'undefined' &&
    typeof (HTMLMediaElement.prototype as { setSinkId?: unknown }).setSinkId ===
      'function'
  );
}

export function supportsAudioContextOutputSelection(): boolean {
  const win = getWindow() as
    | (Window & { webkitAudioContext?: typeof AudioContext })
    | null;
  const Ctx =
    (typeof AudioContext !== 'undefined' ? AudioContext : undefined) ??
    win?.webkitAudioContext;
  return (
    !!Ctx &&
    typeof (Ctx.prototype as { setSinkId?: unknown }).setSinkId === 'function'
  );
}

export function supportsScreenShare(): boolean {
  return typeof getNavigator()?.mediaDevices?.getDisplayMedia === 'function';
}

export function prefersPromptingForScreenShareOptions(): boolean {
  return isSafariLikeBrowser();
}

export function prefersScreenShareAudioDisabledByDefault(): boolean {
  return isSafariLikeBrowser();
}

export function supportsPageNotifications(): boolean {
  return typeof Notification !== 'undefined';
}

export function pageNotificationPreviewMode(): EchoPageNotificationPreviewMode {
  if (!supportsPageNotifications()) return 'unsupported';
  if (isIosLikeBrowser() && !isStandaloneDisplayMode()) {
    return 'standalone-only';
  }
  return 'supported';
}

export function normalizeAudioOutputDeviceId(
  id: string | null | undefined,
): string {
  if (!supportsAudioOutputSelection()) return 'default';
  const trimmed = id?.trim();
  return trimmed ? trimmed : 'default';
}

const AUDIO_RECORDING_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
] as const;

export function pickSupportedAudioRecordingMimeType(): string | null {
  if (
    typeof MediaRecorder === 'undefined' ||
    typeof MediaRecorder.isTypeSupported !== 'function'
  ) {
    return null;
  }
  for (const candidate of AUDIO_RECORDING_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function audioRecordingFileExtensionForMimeType(
  mimeType: string,
): string {
  const mime = mimeType.toLowerCase();
  if (mime.includes('mp4') || mime.includes('aac')) return 'm4a';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  return 'audio';
}

export const echoBrowserCompatibility = {
  get isIosLike(): boolean {
    return isIosLikeBrowser();
  },
  get isSafariLike(): boolean {
    return isSafariLikeBrowser();
  },
  get isStandaloneDisplayMode(): boolean {
    return isStandaloneDisplayMode();
  },
  get supportsAudioOutputSelection(): boolean {
    return supportsAudioOutputSelection();
  },
  get supportsAudioContextOutputSelection(): boolean {
    return supportsAudioContextOutputSelection();
  },
  get supportsScreenShare(): boolean {
    return supportsScreenShare();
  },
  get prefersPromptingForScreenShareOptions(): boolean {
    return prefersPromptingForScreenShareOptions();
  },
  get prefersScreenShareAudioDisabledByDefault(): boolean {
    return prefersScreenShareAudioDisabledByDefault();
  },
  get supportsPageNotifications(): boolean {
    return supportsPageNotifications();
  },
  get pageNotificationPreviewMode(): EchoPageNotificationPreviewMode {
    return pageNotificationPreviewMode();
  },
} as const;
