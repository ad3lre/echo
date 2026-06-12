/**
 * Anonymous client environment dimensions for product analytics (privacy level 2).
 * Coarse categorical values only — no raw UA, IPs, or fingerprinting identifiers.
 */

export const CLIENT_ENVIRONMENT_SHELLS = [
  'web',
  'desktop',
  'android',
  'ios',
  'tauri_shell',
] as const;
export type ClientEnvironmentShell = (typeof CLIENT_ENVIRONMENT_SHELLS)[number];

export const CLIENT_ENVIRONMENT_OS_FAMILIES = [
  'windows',
  'macos',
  'linux',
  'ios',
  'android',
  'chromeos',
  'unknown',
] as const;
export type ClientEnvironmentOsFamily =
  (typeof CLIENT_ENVIRONMENT_OS_FAMILIES)[number];

export const CLIENT_ENVIRONMENT_DEVICE_FORMS = [
  'desktop',
  'phone',
  'tablet',
  'unknown',
] as const;
export type ClientEnvironmentDeviceForm =
  (typeof CLIENT_ENVIRONMENT_DEVICE_FORMS)[number];

export const CLIENT_ENVIRONMENT_BROWSER_FAMILIES = [
  'chrome',
  'firefox',
  'safari',
  'edge',
  'opera',
  'echo_desktop',
  'unknown',
] as const;
export type ClientEnvironmentBrowserFamily =
  (typeof CLIENT_ENVIRONMENT_BROWSER_FAMILIES)[number];

export const CLIENT_ENVIRONMENT_DISPLAY_MODES = [
  'browser',
  'standalone',
  'desktop_app',
] as const;
export type ClientEnvironmentDisplayMode =
  (typeof CLIENT_ENVIRONMENT_DISPLAY_MODES)[number];

export const CLIENT_ENVIRONMENT_GPU_TIERS = ['full', 'reduced'] as const;
export type ClientEnvironmentGpuTier =
  (typeof CLIENT_ENVIRONMENT_GPU_TIERS)[number];

export const CLIENT_ENVIRONMENT_VIEWPORT_BUCKETS = [
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
] as const;
export type ClientEnvironmentViewportBucket =
  (typeof CLIENT_ENVIRONMENT_VIEWPORT_BUCKETS)[number];

export const CLIENT_ENVIRONMENT_COLOR_SCHEMES = [
  'light',
  'dark',
  'unknown',
] as const;
export type ClientEnvironmentColorScheme =
  (typeof CLIENT_ENVIRONMENT_COLOR_SCHEMES)[number];

export const CLIENT_ENVIRONMENT_CONNECTION_TYPES = [
  'slow-2g',
  '2g',
  '3g',
  '4g',
  'unknown',
] as const;
export type ClientEnvironmentConnectionType =
  (typeof CLIENT_ENVIRONMENT_CONNECTION_TYPES)[number];

export type ClientEnvironmentSnapshot = {
  shell: ClientEnvironmentShell;
  osFamily: ClientEnvironmentOsFamily;
  deviceForm: ClientEnvironmentDeviceForm;
  browserFamily: ClientEnvironmentBrowserFamily;
  displayMode: ClientEnvironmentDisplayMode;
  gpuTier: ClientEnvironmentGpuTier;
  viewportBucket: ClientEnvironmentViewportBucket;
  locale: string;
  touch: boolean;
  colorScheme: ClientEnvironmentColorScheme;
  connectionType: ClientEnvironmentConnectionType;
};

const SHELL_SET = new Set<string>(CLIENT_ENVIRONMENT_SHELLS);
const OS_SET = new Set<string>(CLIENT_ENVIRONMENT_OS_FAMILIES);
const DEVICE_SET = new Set<string>(CLIENT_ENVIRONMENT_DEVICE_FORMS);
const BROWSER_SET = new Set<string>(CLIENT_ENVIRONMENT_BROWSER_FAMILIES);
const DISPLAY_SET = new Set<string>(CLIENT_ENVIRONMENT_DISPLAY_MODES);
const GPU_SET = new Set<string>(CLIENT_ENVIRONMENT_GPU_TIERS);
const VIEWPORT_SET = new Set<string>(CLIENT_ENVIRONMENT_VIEWPORT_BUCKETS);
const COLOR_SET = new Set<string>(CLIENT_ENVIRONMENT_COLOR_SCHEMES);
const CONNECTION_SET = new Set<string>(CLIENT_ENVIRONMENT_CONNECTION_TYPES);

const LOCALE_RE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;

function readEnumField(
  raw: Record<string, unknown>,
  key: string,
  allow: Set<string>,
): string | null {
  const v = raw[key];
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || !allow.has(t)) return null;
  return t;
}

function readBooleanField(
  raw: Record<string, unknown>,
  key: string,
): boolean | null {
  const v = raw[key];
  return typeof v === 'boolean' ? v : null;
}

function normalizeLocale(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().slice(0, 16);
  if (!t || !LOCALE_RE.test(t)) return null;
  return t;
}

/**
 * Parse and validate a client environment snapshot from JSON.
 * Returns null when any required dimension is missing or invalid.
 */
export function parseClientEnvironmentSnapshot(
  raw: unknown,
): ClientEnvironmentSnapshot | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const body = raw as Record<string, unknown>;
  const shell = readEnumField(body, 'shell', SHELL_SET);
  const osFamily = readEnumField(body, 'osFamily', OS_SET);
  const deviceForm = readEnumField(body, 'deviceForm', DEVICE_SET);
  const browserFamily = readEnumField(body, 'browserFamily', BROWSER_SET);
  const displayMode = readEnumField(body, 'displayMode', DISPLAY_SET);
  const gpuTier = readEnumField(body, 'gpuTier', GPU_SET);
  const viewportBucket = readEnumField(body, 'viewportBucket', VIEWPORT_SET);
  const locale = normalizeLocale(body.locale);
  const touch = readBooleanField(body, 'touch');
  const colorScheme = readEnumField(body, 'colorScheme', COLOR_SET);
  const connectionType = readEnumField(body, 'connectionType', CONNECTION_SET);
  if (
    !shell ||
    !osFamily ||
    !deviceForm ||
    !browserFamily ||
    !displayMode ||
    !gpuTier ||
    !viewportBucket ||
    !locale ||
    touch === null ||
    !colorScheme ||
    !connectionType
  ) {
    return null;
  }
  return {
    shell: shell as ClientEnvironmentShell,
    osFamily: osFamily as ClientEnvironmentOsFamily,
    deviceForm: deviceForm as ClientEnvironmentDeviceForm,
    browserFamily: browserFamily as ClientEnvironmentBrowserFamily,
    displayMode: displayMode as ClientEnvironmentDisplayMode,
    gpuTier: gpuTier as ClientEnvironmentGpuTier,
    viewportBucket: viewportBucket as ClientEnvironmentViewportBucket,
    locale,
    touch,
    colorScheme: colorScheme as ClientEnvironmentColorScheme,
    connectionType: connectionType as ClientEnvironmentConnectionType,
  };
}
