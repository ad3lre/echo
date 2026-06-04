export interface ImageViewerPreferences {
  /**
   * When true, two-finger scroll pans and pinch zooms (trackpad-friendly).
   * When false, scroll wheel zooms in/out (classic behavior).
   */
  wheelScrollPans: boolean;
}

const STORAGE_KEY = 'echo-image-viewer-preferences-v1';

const DEFAULTS: ImageViewerPreferences = {
  wheelScrollPans: true,
};

let cached: ImageViewerPreferences | null = null;

function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

function readStored(): Partial<ImageViewerPreferences> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<ImageViewerPreferences>;
  } catch {
    return {};
  }
}

export function loadImageViewerPreferences(): ImageViewerPreferences {
  if (cached) return cached;
  const s = readStored();
  cached = {
    wheelScrollPans: isBool(s.wheelScrollPans)
      ? s.wheelScrollPans
      : DEFAULTS.wheelScrollPans,
  };
  return cached;
}

export function saveImageViewerPreferences(
  next: Partial<ImageViewerPreferences>,
): ImageViewerPreferences {
  const current = loadImageViewerPreferences();
  const merged: ImageViewerPreferences = {
    wheelScrollPans: isBool(next.wheelScrollPans)
      ? next.wheelScrollPans
      : current.wheelScrollPans,
  };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      /* ignore */
    }
  }
  cached = merged;
  return merged;
}

export function resetImageViewerPreferencesToDefaults(): ImageViewerPreferences {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  cached = null;
  return loadImageViewerPreferences();
}
