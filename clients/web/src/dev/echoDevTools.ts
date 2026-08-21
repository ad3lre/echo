/**
 * Dev-only utilities gated here so they cost nothing when off (no extra chunk load, no Vite middleware).
 *
 * Flip to `true` locally when you need the numbered-icon batch rename UI + `POST /__dev/icon-rename`.
 */
export const ENABLE_NUMBERED_ICON_RENAME_TOOL = false;
