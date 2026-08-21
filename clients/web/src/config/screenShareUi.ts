import { echoBrowserCompatibility } from '@/platform/browserCompatibility';

/**
 * Screen-share UX: browser vs future native/desktop.
 *
 * Browsers already show a native picker, so Echo normally skips its own config
 * modal. Safari gets the extra step because screen-share audio is less
 * predictable there and users benefit from an explicit audio toggle.
 *
 * For a packaged app with richer permissions / capture APIs, set
 * `VITE_SCREEN_SHARE_CONFIG_MODAL=true` at build time to always show
 * `ScreenSharePickerModal`.
 */
export const ECHO_SCREEN_SHARE_USE_CONFIG_MODAL =
  import.meta.env.VITE_SCREEN_SHARE_CONFIG_MODAL === 'true' ||
  echoBrowserCompatibility.prefersPromptingForScreenShareOptions;

/** Defaults when the Echo modal is skipped and the browser picker is the primary UI. */
export const SCREEN_SHARE_BROWSER_DEFAULTS = {
  quality: 'auto' as const,
  audio: !echoBrowserCompatibility.prefersScreenShareAudioDisabledByDefault,
  /** `detail` nudges capture + encoding toward sharp static UI (slides, IDEs); `motion` blurs text. */
  contentHint: 'detail' as const,
};
