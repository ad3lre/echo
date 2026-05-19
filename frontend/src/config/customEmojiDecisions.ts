/**
 * Locked product/implementation choices for custom emoji & packs (executive checklist).
 * Assets: API returns absolute imageUrl strings (S3 public URL, data URL, or Twemoji CDN for market imports).
 * Picker: one nav icon per imported pack (per-pack sections); “This server” is implicit in section titles.
 * Animated: `animated` flag + `<a:name:id>` vs `<:name:id>`; image URL may be GIF or static image.
 */
export const CUSTOM_EMOJI_ASSET_SOURCE = 'api_absolute_url' as const;
export const CUSTOM_EMOJI_PICKER_NAV = 'per_pack_sections' as const;
