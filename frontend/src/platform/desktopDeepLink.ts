import { isDesktop } from '@/platform/desktopBridge';
import { tryHandleEchoProductDeepLinkRaw } from '@/platform/desktopProductDeepLink';
import {
  readPendingDesktopOAuthHandoffCode,
  setPendingDesktopOAuthHandoffCode,
  readPendingDesktopOAuthReturnPath,
} from '@/platform/desktopOAuthHandoff';

let lastHandledDeepLinkRaw = '';
let lastHandledDeepLinkAt = 0;
const DUPLICATE_DEEP_LINK_WINDOW_MS = 15_000;

/**
 * `echo://` deep links (e.g. OAuth handoff) append query params like the SPA redirect.
 */
export async function initDesktopDeepLinks(): Promise<void> {
  if (!isDesktop()) return;
  try {
    const { getCurrent, onOpenUrl } =
      await import('@tauri-apps/plugin-deep-link');
    console.warn('[echo-desktop] deep-link init: plugin loaded');
    const handleOpenUrls = (urls: string[]) => {
      console.warn('[echo-desktop] deep-link urls received', {
        count: urls.length,
      });
      for (const raw of urls) {
        try {
          const now = Date.now();
          if (
            raw === lastHandledDeepLinkRaw &&
            now - lastHandledDeepLinkAt < DUPLICATE_DEEP_LINK_WINDOW_MS
          ) {
            console.warn('[echo-desktop] deep-link duplicate URL ignored');
            continue;
          }
          lastHandledDeepLinkRaw = raw;
          lastHandledDeepLinkAt = now;
          const u = new URL(raw);
          if (u.protocol !== 'echo:') continue;
          if (tryHandleEchoProductDeepLinkRaw(raw)) {
            continue;
          }
          const handoff = u.searchParams.get('echo_handoff')?.trim();
          console.warn('[echo-desktop] deep-link parsed', {
            protocol: u.protocol,
            pathname: u.pathname,
            hasHandoff: Boolean(handoff),
            handoffLen: handoff ? handoff.length : 0,
            handoffHex64: handoff ? /^[0-9a-f]{64}$/i.test(handoff) : false,
          });
          // If this deep link was triggered from `oauth-desktop-bridge.html`, we must return to the
          // original SPA route, otherwise the bridge stays visible ("Opening Echo...").
          // Always merge the custom-scheme query (e.g. `echo_handoff`) into `next`. If we only used
          // `returnPath` without the handoff query, `next` could equal the current URL on warm
          // start (already on `/explore`) and navigation would be skipped — redeem never runs.
          const returnPath = readPendingDesktopOAuthReturnPath();
          const base = window.location.origin;
          const pathSpec = returnPath
            ? returnPath
            : `${window.location.pathname || '/'}${window.location.hash}`;
          const resolved =
            pathSpec.startsWith('http://') || pathSpec.startsWith('https://')
              ? pathSpec
              : pathSpec.startsWith('/')
                ? `${base}${pathSpec}`
                : `${base}/${pathSpec}`;
          const nextUrl = new URL(resolved);
          u.searchParams.forEach((value, key) => {
            nextUrl.searchParams.set(key, value);
          });
          const next = nextUrl.toString();
          console.warn('[echo-desktop] deep-link navigating back to app', {
            hasReturnPath: Boolean(returnPath),
          });
          if (handoff) {
            const alreadyStored = readPendingDesktopOAuthHandoffCode();
            if (alreadyStored === handoff) {
              console.warn(
                '[echo-desktop] deep-link duplicate handoff ignored',
              );
              continue;
            }
            setPendingDesktopOAuthHandoffCode(handoff);
            console.warn('[echo-desktop] deep-link stored handoff code');
          }
          if (window.location.href === next) {
            console.warn('[echo-desktop] deep-link no-op navigation skipped');
            continue;
          }
          window.location.replace(next);
        } catch (error) {
          console.error('[echo-desktop] deep-link malformed URL', {
            raw,
            error,
          });
        }
      }
    };

    // Warm start: app already running, new deep links arrive via events.
    await onOpenUrl(handleOpenUrls);
    console.warn('[echo-desktop] deep-link listener attached');
    try {
      const { listen } = await import('@tauri-apps/api/event');
      await listen<string>('echo-desktop-open-url', (event) => {
        handleOpenUrls([event.payload]);
      });
      console.warn(
        '[echo-desktop] single-instance deep-link listener attached',
      );
    } catch {
      /* optional on non-Tauri builds */
    }
    // Cold start: app launched by deep link; process the initial URL immediately.
    const initial = await getCurrent();
    console.warn('[echo-desktop] deep-link getCurrent result', {
      count: initial?.length ?? 0,
      urls: initial ?? [],
    });
    if (initial?.length) handleOpenUrls(initial);
  } catch {
    console.warn('[echo-desktop] deep-link init unavailable (non-desktop?)');
  }
}
