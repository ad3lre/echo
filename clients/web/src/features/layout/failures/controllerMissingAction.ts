import { reportPrimaryFlowFailure } from '@/features/layout/failures/primaryFlowFailure';

export const ECHO_APP_TOAST_EVENT = 'echo-app-toast';

/** `detail: { focused: boolean }` — composer focus raises the toast's bottom inset so it clears the input bar. */
export const ECHO_CHAT_COMPOSER_FOCUS_EVENT = 'echo:chat-composer-focus';

/** Ask the active chat composer for `channelId` to re-apply channel message format. */
export const ECHO_CHANNEL_COMPOSER_FORMAT_REHYDRATE_EVENT =
  'echo:channel-composer-format-rehydrate';

export type AppToastSeverity = 'success' | 'info' | 'warning' | 'error';

export type AppToastAction = {
  id: string;
  label: string;
  kind?: 'primary' | 'secondary';
  /** When true, keep the toast visible after this action executes. */
  keepOpen?: boolean;
  run: () => void;
};

export type AppToastDetail = {
  message: string;
  severity?: AppToastSeverity;
  durationMs?: number;
  actions?: AppToastAction[];
  title?: string;
  subtitle?: string;
  variant?: 'default' | 'incoming_call' | 'incoming_chat_message';
  /** Optional leading icon for default (non-rich) toasts — bundled asset URL. */
  leadingIconSrc?: string;
  /**
   * When false, suppresses the auto-dismiss progress indicator even when the toast
   * has a finite duration. Defaults to on for auto-dismissing toasts except
   * `incoming_call`.
   */
  showAutoDismissProgress?: boolean;
  /** Optional image (e.g. caller avatar for `incoming_call`). */
  imageUrl?: string;
  /** Small numeric badge on rich toasts (e.g. unread count). */
  badge?: string;
  /** When set with `incoming_chat_message`, toast shows a quick-reply field for this channel. */
  quickReplyChannelId?: string;
};

/** Cross-cutting vs Vue shell — see `docs/overview/agents.md`. */
export type MissingActionPolicy =
  | 'optional_surface'
  | 'required_binding'
  | 'deprecated_unwired';

const deprecatedUnwiredDevWarned = new Set<string>();
const deprecatedUnwiredProdTelemetry = new Set<string>();
const requiredBindingProdBanner = new Set<string>();

function isStrictEnv(): boolean {
  return import.meta.env.DEV || import.meta.env.MODE === 'staging';
}

export function dispatchAppToastDetail(detail: AppToastDetail): void {
  if (typeof window === 'undefined') return;
  const payload: AppToastDetail = {
    message: detail.message,
    severity: detail.severity ?? 'info',
    ...(typeof detail.durationMs === 'number'
      ? { durationMs: detail.durationMs }
      : {}),
    ...(detail.actions?.length ? { actions: detail.actions } : {}),
    ...(detail.title?.trim() ? { title: detail.title.trim() } : {}),
    ...(detail.subtitle?.trim() ? { subtitle: detail.subtitle.trim() } : {}),
    ...(detail.variant ? { variant: detail.variant } : {}),
    ...(detail.imageUrl?.trim() ? { imageUrl: detail.imageUrl.trim() } : {}),
    ...(detail.badge?.trim() ? { badge: detail.badge.trim() } : {}),
    ...(detail.quickReplyChannelId?.trim()
      ? { quickReplyChannelId: detail.quickReplyChannelId.trim() }
      : {}),
    ...(detail.leadingIconSrc?.trim()
      ? { leadingIconSrc: detail.leadingIconSrc.trim() }
      : {}),
    ...(detail.showAutoDismissProgress === true
      ? { showAutoDismissProgress: true }
      : detail.showAutoDismissProgress === false
        ? { showAutoDismissProgress: false }
        : {}),
  };
  window.dispatchEvent(
    new CustomEvent<AppToastDetail>(ECHO_APP_TOAST_EVENT, {
      detail: payload,
    }),
  );
}

export function dispatchAppToast(
  message: string,
  severity: AppToastSeverity = 'info',
): void {
  dispatchAppToastDetail({ message, severity });
}

export function subscribeAppToasts(
  handler: (d: AppToastDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const fn = (e: Event) => {
    const ce = e as CustomEvent<AppToastDetail>;
    const d = ce.detail;
    if (!d) return;
    const hasMessage = !!(d.message && String(d.message).trim());
    const hasTitle = !!(d.title && String(d.title).trim());
    if (!hasMessage && !hasTitle) return;
    handler(d);
  };
  window.addEventListener(ECHO_APP_TOAST_EVENT, fn);
  return () => window.removeEventListener(ECHO_APP_TOAST_EVENT, fn);
}

/**
 * Single runtime path for “action missing” / unwired behavior.
 *
 * - optional_surface: user hit an unfinished shell handler (DM calls, etc.) — dev throw; prod toast + telemetry, no banner.
 * - required_binding: invariant broken at runtime (e.g. delegate before bind) — dev throw; prod one structural banner + warning toast.
 * - deprecated_unwired: optional registry-style placeholder — dev warn-once; prod telemetry once (no banner) + info toast once.
 */
export function notifyMissingAction(
  path: string,
  policy: MissingActionPolicy,
): void {
  const err = new Error(`Not implemented: ${path}`);

  switch (policy) {
    case 'optional_surface': {
      if (isStrictEnv()) {
        reportPrimaryFlowFailure(path, err);
        throw err;
      }
      reportPrimaryFlowFailure(path, err, undefined, { showBanner: false });
      dispatchAppToast('Feature not available yet', 'info');
      break;
    }
    case 'required_binding': {
      if (isStrictEnv()) {
        throw new Error(`[Echo] Missing required binding: ${path}`);
      }
      if (!requiredBindingProdBanner.has(path)) {
        requiredBindingProdBanner.add(path);
        reportPrimaryFlowFailure(`layout.required_binding.${path}`, err, {
          path,
        });
      }
      dispatchAppToast('Something went wrong. Try again or reload.', 'warning');
      break;
    }
    case 'deprecated_unwired': {
      if (isStrictEnv()) {
        if (!deprecatedUnwiredDevWarned.has(path)) {
          deprecatedUnwiredDevWarned.add(path);
        }
        return;
      }
      if (!deprecatedUnwiredProdTelemetry.has(path)) {
        deprecatedUnwiredProdTelemetry.add(path);
        reportPrimaryFlowFailure(
          `layout.action_missing.${path}`,
          err,
          { path },
          { showBanner: false },
        );
        dispatchAppToast('Feature not available yet', 'info');
      }
      break;
    }
  }
}
