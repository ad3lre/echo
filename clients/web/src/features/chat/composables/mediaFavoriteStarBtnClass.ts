/**
 * Tailwind classes for the media-picker favorite (star) overlay on GIF/image tiles.
 * Keeps the control visible while a tile is actively previewed (hover / animated GIF).
 */
export function mediaFavoriteStarBtnClass(
  isFavorited: boolean,
  isTileActive: boolean,
): string {
  const layout =
    'absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-overlay-heavy shadow-sm transition-opacity hover:bg-overlay-heavy';
  if (isFavorited) {
    return `${layout} text-amber-300 opacity-100`;
  }
  if (isTileActive) {
    return `${layout} text-foreground/90 opacity-100`;
  }
  return `${layout} text-foreground/90 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100`;
}
