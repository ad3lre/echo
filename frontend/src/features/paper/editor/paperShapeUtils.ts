import type {
  PaperShapeAlign,
  PaperShapeBorderStyle,
  PaperShapeKind,
} from '@/features/paper/editor/paperShapeExtension';
import { PAPER_SHAPE_FILL_NONE } from '@/features/paper/editor/paperShapeExtension';

export { PAPER_SHAPE_FILL_NONE };

export const PAPER_SHAPE_BORDER_WIDTHS = [0, 1, 2, 3, 4, 6, 8] as const;

export const PAPER_SHAPE_BORDER_STYLES: {
  label: string;
  value: PaperShapeBorderStyle;
}[] = [
  { label: 'Solid', value: 'solid' },
  { label: 'Dashed', value: 'dashed' },
  { label: 'Dotted', value: 'dotted' },
];

export type PaperShapeBorderAttrs = {
  color: string | null;
  width: string;
  style: PaperShapeBorderStyle;
};

export const PAPER_SHAPE_MIN_PX = 24;
export const PAPER_SHAPE_MAX_PX = 720;

export const PAPER_SHAPE_SIZE_PRESETS = [
  { label: 'Small', px: 80 },
  { label: 'Medium', px: 120 },
  { label: 'Large', px: 200 },
  { label: 'XL', px: 280 },
] as const;

export const PAPER_SHAPE_SIZE_FINE_STEP = 20;

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

export function stepShapeSizePx(
  currentPx: number,
  direction: 'up' | 'down',
): number {
  const presets = PAPER_SHAPE_SIZE_PRESETS.map((p) => p.px);
  if (direction === 'up') {
    const next = presets.find((p) => p > currentPx);
    if (next != null) return clampPaperShapePx(next);
    return clampPaperShapePx(currentPx + PAPER_SHAPE_SIZE_FINE_STEP);
  }
  const prev = [...presets].reverse().find((p) => p < currentPx);
  if (prev != null) return clampPaperShapePx(prev);
  return clampPaperShapePx(currentPx - PAPER_SHAPE_SIZE_FINE_STEP);
}

function escapeCssUrl(url: string): string {
  return url.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function isPaperShapeFillNone(fill: string | null | undefined): boolean {
  if (!fill) return true;
  const value = fill.trim().toLowerCase();
  return value === 'transparent' || value === 'none' || value === '';
}

export function resolvePaperShapeFill(fill: string): string {
  return isPaperShapeFillNone(fill) ? PAPER_SHAPE_FILL_NONE : fill;
}

export function parsePaperShapeBorderWidth(
  raw: string | number | null | undefined,
): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.min(24, Math.round(raw)));
  }
  if (!raw) return 0;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === '0' || trimmed === '0px') return 0;
  return Math.max(0, Math.min(24, parsePaperShapePx(trimmed, 0)));
}

export function formatPaperShapeBorderWidth(px: number): string {
  return `${Math.max(0, Math.min(24, Math.round(px)))}px`;
}

export function shapeHasBorder(
  borderColor: string | null | undefined,
  borderWidth: number,
): boolean {
  if (borderWidth <= 0) return false;
  if (!borderColor?.trim()) return false;
  return !isPaperShapeFillNone(borderColor);
}

export function hostInlineStyle(width: string, height: string): string {
  return [`width:${width}`, `min-height:${height}`, `height:${height}`].join(
    ';',
  );
}

export function shapeInlineStyle(
  shape: PaperShapeKind,
  fill: string,
  width: string,
  height: string,
  imageSrc?: string | null,
  border?: PaperShapeBorderAttrs,
): string {
  const resolvedFill = resolvePaperShapeFill(fill);
  const borderWidth = parsePaperShapeBorderWidth(border?.width);
  const borderColor = border?.color ?? null;
  const borderStyle = border?.style ?? 'solid';
  const hasBorder = shapeHasBorder(borderColor, borderWidth);

  const parts = ['width:100%', 'height:100%', 'display:block'];

  if (shape === 'line') {
    const lineColor = hasBorder
      ? borderColor!
      : isPaperShapeFillNone(resolvedFill)
        ? 'transparent'
        : resolvedFill;
    parts.push(`background-color:${lineColor}`);
    parts.push('border-radius:2px');
    return parts.join(';');
  }

  if (!isPaperShapeFillNone(resolvedFill)) {
    parts.push(`background-color:${resolvedFill}`);
  } else {
    parts.push('background-color:transparent');
  }

  if (imageSrc?.trim()) {
    parts.push(`background-image:url("${escapeCssUrl(imageSrc.trim())}")`);
    parts.push('background-size:cover');
    parts.push('background-position:center');
    parts.push('background-repeat:no-repeat');
  }

  if (hasBorder) {
    if (shape === 'triangle') {
      parts.push(`box-shadow:inset 0 0 0 ${borderWidth}px ${borderColor}`);
    } else {
      parts.push(`border:${borderWidth}px ${borderStyle} ${borderColor}`);
      parts.push('box-sizing:border-box');
    }
  }

  if (shape === 'circle') {
    parts.push('border-radius:50%');
  } else if (shape === 'triangle') {
    parts.push('clip-path:polygon(50% 0%, 0% 100%, 100% 100%)');
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
