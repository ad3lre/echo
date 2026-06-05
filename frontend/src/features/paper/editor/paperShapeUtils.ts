import type {
  PaperShapeAlign,
  PaperShapeKind,
} from '@/features/paper/editor/paperShapeExtension';

export const PAPER_SHAPE_MIN_PX = 24;
export const PAPER_SHAPE_MAX_PX = 720;

export function parsePaperShapePx(
  raw: string | null | undefined,
  fallback: number,
): number {
  if (!raw || typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  const px = trimmed.match(/^(\d+(?:\.\d+)?)px$/i);
  if (px) return Number(px[1]);
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : fallback;
}

export function formatPaperShapePx(px: number): string {
  return `${Math.round(px)}px`;
}

export function clampPaperShapePx(px: number): number {
  return Math.min(PAPER_SHAPE_MAX_PX, Math.max(PAPER_SHAPE_MIN_PX, px));
}

export function shapeInlineStyle(
  shape: PaperShapeKind,
  fill: string,
  width: string,
  height: string,
): string {
  const parts = [
    `background-color:${fill}`,
    `width:${width}`,
    `height:${height}`,
    'display:block',
  ];
  if (shape === 'circle') {
    parts.push('border-radius:50%');
  } else if (shape === 'triangle') {
    parts.push('clip-path:polygon(50% 0%, 0% 100%, 100% 100%)');
  } else if (shape === 'line') {
    parts.push('border-radius:2px');
  } else {
    parts.push('border-radius:6px');
  }
  return parts.join(';');
}

export function alignWrapClass(align: PaperShapeAlign): string {
  return `paper-editor-shape-wrap--align-${align}`;
}

export function computeShapeResize(
  shape: PaperShapeKind,
  startW: number,
  startH: number,
  deltaX: number,
  deltaY: number,
  corner: 'se' | 'e',
): { width: number; height: number } {
  if (shape === 'line' || corner === 'e') {
    return {
      width: clampPaperShapePx(startW + deltaX),
      height: startH,
    };
  }

  const width = clampPaperShapePx(startW + deltaX);
  const height = clampPaperShapePx(startH + deltaY);

  if (shape === 'circle' || shape === 'triangle') {
    const size = clampPaperShapePx(Math.max(width, height));
    return { width: size, height: size };
  }

  return { width, height };
}
