import { describe, expect, it } from 'vitest';
import {
  clampImageViewerZoom,
  IMAGE_VIEWER_INITIAL_ZOOM,
  IMAGE_VIEWER_MAX_ZOOM,
  IMAGE_VIEWER_MIN_ZOOM,
  zoomPanTowardFocal,
} from './imageViewerZoom';

describe('imageViewerZoom', () => {
  it('clamps zoom into the allowed range', () => {
    expect(clampImageViewerZoom(0)).toBe(IMAGE_VIEWER_MIN_ZOOM);
    expect(clampImageViewerZoom(99)).toBe(IMAGE_VIEWER_MAX_ZOOM);
    expect(clampImageViewerZoom(Number.NaN)).toBe(IMAGE_VIEWER_INITIAL_ZOOM);
  });

  it('keeps the focal point stable when zooming in', () => {
    // Cursor 100px right of center; pan was 0. After 2× zoom, pan shifts so
    // that same content stays under the cursor.
    const next = zoomPanTowardFocal({
      prevZoom: 1,
      nextZoom: 2,
      posX: 0,
      posY: 0,
      focalX: 100,
      focalY: 0,
    });
    expect(next).toEqual({ x: -100, y: 0 });
  });

  it('zooms toward center without drifting when focal is origin', () => {
    const next = zoomPanTowardFocal({
      prevZoom: 2,
      nextZoom: 1,
      posX: 40,
      posY: -20,
      focalX: 0,
      focalY: 0,
    });
    expect(next).toEqual({ x: 20, y: -10 });
  });
});
