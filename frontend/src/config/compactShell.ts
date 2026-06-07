/** Viewports strictly below this width use the compact swipe shell (shared mobile + tablet). */
export const COMPACT_SHELL_BREAKPOINT_PX = 800;

/** CSS media query: matches when `window.innerWidth` is strictly less than `COMPACT_SHELL_BREAKPOINT_PX`. */
export const COMPACT_SHELL_MEDIA_QUERY = '(max-width: 799px)';

/**
 * Within the compact shell, viewports at least this wide show guild rail + channel panel +
 * chat side by side (channel column uses natural width). Narrower phones keep tri-pane swipe.
 */
export const COMPACT_GUILD_SPLIT_MIN_WIDTH_PX = 600;

/** CSS media query: compact guild split (tablet) inside the compact shell band. */
export const COMPACT_GUILD_SPLIT_MEDIA_QUERY = `(min-width: ${COMPACT_GUILD_SPLIT_MIN_WIDTH_PX}px) and (max-width: ${COMPACT_SHELL_BREAKPOINT_PX - 1}px)`;
