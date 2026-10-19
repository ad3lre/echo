/** Fit is CSS contain at scale 1; open slightly pulled back. */
export const IMAGE_VIEWER_INITIAL_ZOOM = 0.9;
export const IMAGE_VIEWER_MIN_ZOOM = 0.25;
export const IMAGE_VIEWER_MAX_ZOOM = 4;

/**
 * Adjust pan so the content under a focal point (relative to the container
 * center) stays put when scale changes. Used for cursor/pinch zoom.
 */
export function zoomPanTowardFocal(opts: {
  prevZoom: number;
  nextZoom: number;
  posX: number;
  posY: number;
  focalX: number;
  focalY: number;
}): { x: number; y: number } {
  const prev = opts.prevZoom;
  if (!Number.isFinite(prev) || prev <= 0 || !Number.isFinite(opts.nextZoom)) {
    return {
      x: Number.isFinite(opts.posX) ? opts.posX : 0,
      y: Number.isFinite(opts.posY) ? opts.posY : 0,
    };
  }
  const ratio = opts.nextZoom / prev;
  const px = Number.isFinite(opts.posX) ? opts.posX : 0;
  const py = Number.isFinite(opts.posY) ? opts.posY : 0;
  const fx = Number.isFinite(opts.focalX) ? opts.focalX : 0;
  const fy = Number.isFinite(opts.focalY) ? opts.focalY : 0;
  return {
    x: fx - (fx - px) * ratio,
    y: fy - (fy - py) * ratio,
  };
}

export function clampImageViewerZoom(z: number): number {
  if (!Number.isFinite(z)) return IMAGE_VIEWER_INITIAL_ZOOM;
  return Math.max(IMAGE_VIEWER_MIN_ZOOM, Math.min(IMAGE_VIEWER_MAX_ZOOM, z));
}
