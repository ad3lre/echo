import { isDesktop } from '@/platform/desktopBridge';

const BOOT_DIAG_TAG = '[echo-boot-diag]';
const QUEUE_KEY = '__ECHO_BOOT_DIAG_QUEUE__';
const WATCH_MS = 2000;
const WATCH_DURATION_MS = 45_000;

type BootDiagQueueEntry = {
  t: number;
  stage: string;
  detail?: Record<string, unknown>;
  paint?: Record<string, unknown>;
};

type PaintSnapshot = {
  href: string;
  pathname: string;
  search: string;
  htmlClass: string;
  htmlDataset: Record<string, string>;
  body: StyleProbe | null;
  app: StyleProbe | null;
  appChildCount: number;
  appHasMountedAttr: boolean;
  appInnerTextLen: number;
  bootGateVisible: boolean;
  echoShellRoot: ElementProbe | null;
  desktopTitlebar: ElementProbe | null;
  settingsModalOpen: boolean;
  splash: StyleProbe | null;
  spinnerDisplay: string | null;
};

type StyleProbe = {
  display: string;
  visibility: string;
  opacity: string;
  backgroundColor: string;
  color: string;
  transform: string;
  filter: string;
  mixBlendMode: string;
  backdropFilter: string;
  width: string;
  height: string;
};

type ElementProbe = {
  found: boolean;
  childCount: number;
  textLen: number;
  style: StyleProbe | null;
};

let installed = false;
let invokeFailed = false;
let watchTimer: ReturnType<typeof setInterval> | null = null;
let watchStopTimer: ReturnType<typeof setTimeout> | null = null;
let lastTheme: string | null = null;

function readStyle(el: Element | null): StyleProbe | null {
  if (!el || typeof window.getComputedStyle !== 'function') return null;
  const s = window.getComputedStyle(el);
  const webkitStyle = s as CSSStyleDeclaration & {
    webkitBackdropFilter?: string;
  };
  return {
    display: s.display,
    visibility: s.visibility,
    opacity: s.opacity,
    backgroundColor: s.backgroundColor,
    color: s.color,
    transform: s.transform,
    filter: s.filter,
    mixBlendMode: s.mixBlendMode,
    backdropFilter: s.backdropFilter || webkitStyle.webkitBackdropFilter || '',
    width: s.width,
    height: s.height,
  };
}

function probeElement(selector: string): ElementProbe {
  const el = document.querySelector(selector);
  if (!el) return { found: false, childCount: 0, textLen: 0, style: null };
  return {
    found: true,
    childCount: el.childElementCount,
    textLen: (el.textContent ?? '').trim().length,
    style: readStyle(el),
  };
}

export function captureDesktopPaintSnapshot(): PaintSnapshot {
  const html = document.documentElement;
  const app = document.getElementById('app');
  const splash = app?.querySelector('.echo-boot-splash') ?? null;
  const spinner = app?.querySelector('.echo-boot-spinner') ?? null;
  const bootGate = document.querySelector('.echo-boot-gate');
  const bootGateStyle =
    bootGate && typeof window.getComputedStyle === 'function'
      ? window.getComputedStyle(bootGate)
      : null;

  return {
    href: window.location.href,
    pathname: window.location.pathname,
    search: window.location.search,
    htmlClass: html.className,
    htmlDataset: Object.fromEntries(
      Object.entries(html.dataset).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    ),
    body: readStyle(document.body),
    app: readStyle(app),
    appChildCount: app?.childElementCount ?? 0,
    appHasMountedAttr: app?.hasAttribute('data-echo-mounted') ?? false,
    appInnerTextLen: (app?.innerText ?? '').trim().length,
    bootGateVisible: !!(
      bootGate &&
      bootGateStyle &&
      bootGateStyle.display !== 'none' &&
      bootGateStyle.visibility !== 'hidden' &&
      bootGateStyle.opacity !== '0'
    ),
    echoShellRoot: probeElement('.echo-shell-root'),
    desktopTitlebar: probeElement('.desktop-titlebar'),
    settingsModalOpen: !!document.querySelector(
      '.settings-modal, [class*="settings-modal"]',
    ),
    splash: readStyle(splash),
    spinnerDisplay: spinner ? window.getComputedStyle(spinner).display : null,
  };
}

async function postBootDiag(
  stage: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  if (!isDesktop() || invokeFailed) return;
  const payload = {
    timestamp: new Date().toISOString(),
    level: 'warn',
    kind: 'boot_diag',
    message: `${BOOT_DIAG_TAG} ${stage}`,
    details: [
      {
        stage,
        ...(detail ?? {}),
        paint: captureDesktopPaintSnapshot(),
      },
    ],
    href: window.location.href,
    userAgent: navigator.userAgent,
  };
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('log_frontend_event', { payload });
  } catch {
    invokeFailed = true;
    console.warn(
      `${BOOT_DIAG_TAG} invoke failed; falling back to console only`,
      stage,
      detail,
    );
  }
}

export function logDesktopBootDiag(
  stage: string,
  detail?: Record<string, unknown>,
): void {
  if (!isDesktop()) return;
  const merged = {
    ...(detail ?? {}),
    paint: captureDesktopPaintSnapshot(),
  };
  console.warn(BOOT_DIAG_TAG, stage, merged);
  void postBootDiag(stage, detail);
}

function readEarlyQueue(): BootDiagQueueEntry[] {
  const raw = (window as unknown as Record<string, unknown>)[QUEUE_KEY];
  if (!Array.isArray(raw)) return [];
  return raw as BootDiagQueueEntry[];
}

function clearEarlyQueue(): void {
  try {
    delete (window as unknown as Record<string, unknown>)[QUEUE_KEY];
  } catch {
    /* ignore */
  }
}

export function flushEarlyDesktopBootDiagQueue(): void {
  if (!isDesktop()) return;
  const queued = readEarlyQueue();
  if (!queued.length) return;
  logDesktopBootDiag('early-queue-flush', { count: queued.length });
  for (const entry of queued) {
    logDesktopBootDiag(`early:${entry.stage}`, {
      queuedAtMs: entry.t,
      ...(entry.detail ?? {}),
      earlyPaint: entry.paint ?? null,
    });
  }
  clearEarlyQueue();
}

function watchThemeAttribute(): void {
  if (typeof MutationObserver === 'undefined') return;
  const root = document.documentElement;
  lastTheme = root.dataset.theme ?? null;
  const obs = new MutationObserver(() => {
    const next = root.dataset.theme ?? null;
    if (next === lastTheme) return;
    const prev = lastTheme;
    lastTheme = next;
    logDesktopBootDiag('html.data-theme-changed', {
      from: prev,
      to: next,
      solidGlass: root.dataset.echoSolidGlass ?? null,
      webkitLightGuard: root.dataset.echoWebkitLightGuard ?? null,
      themeRepaint: root.dataset.echoThemeRepaint ?? null,
    });
  });
  obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
}

function startPeriodicPaintWatch(): void {
  if (watchTimer) clearInterval(watchTimer);
  if (watchStopTimer) clearTimeout(watchStopTimer);
  let tick = 0;
  watchTimer = setInterval(() => {
    tick += 1;
    logDesktopBootDiag('periodic-paint-watch', { tick });
  }, WATCH_MS);
  watchStopTimer = setTimeout(() => {
    if (watchTimer) clearInterval(watchTimer);
    watchTimer = null;
    logDesktopBootDiag('periodic-paint-watch:stopped', { tick });
  }, WATCH_DURATION_MS);
}

export function installDesktopBootDiagnostics(): void {
  if (!isDesktop() || installed) return;
  installed = true;
  flushEarlyDesktopBootDiagQueue();
  logDesktopBootDiag('install', {
    baseUrl: import.meta.env.BASE_URL,
    viteDesktop: import.meta.env.VITE_ECHO_DESKTOP === '1',
  });
  watchThemeAttribute();
  startPeriodicPaintWatch();
}
