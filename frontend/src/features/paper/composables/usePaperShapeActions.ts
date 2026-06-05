import type { Ref } from 'vue';
import type { Editor } from '@tiptap/core';
import {
  defaultPaperShapeSize,
  PAPER_DEFAULT_SHAPE_FILL,
  type PaperShapeAlign,
  type PaperShapeKind,
} from '@/features/paper/editor/paperShapeExtension';
import {
  clampPaperShapePx,
  formatPaperShapePx,
  parsePaperShapePx,
} from '@/features/paper/editor/paperShapeUtils';
import { runPaperFormatCommand } from '@/features/paper/editor/paperFormatSelection';
import { usePaperObjectColor } from '@/features/paper/composables/usePaperObjectColor';

export const PAPER_SHAPE_SIZE_PRESETS = [
  { label: 'Small', px: 80 },
  { label: 'Medium', px: 120 },
  { label: 'Large', px: 200 },
  { label: 'XL', px: 280 },
] as const;

export function usePaperShapeActions(editor: Ref<Editor | null | undefined>) {
  const { pendingObjectColor, setPendingObjectColor, resetPendingObjectColor } =
    usePaperObjectColor();

  const isShapeSelected = () => editor.value?.isActive('paperShape') ?? false;

  function selectedShapeAttrs(): Record<string, unknown> | null {
    const ed = editor.value;
    if (!ed?.isActive('paperShape')) return null;
    return ed.getAttributes('paperShape');
  }

  function selectedShapeFill(): string | null {
    const fill = selectedShapeAttrs()?.fill;
    return typeof fill === 'string' && fill.trim() ? fill : null;
  }

  function selectedShapeAlign(): PaperShapeAlign {
    const align = selectedShapeAttrs()?.align;
    if (align === 'left' || align === 'right' || align === 'center') {
      return align;
    }
    return 'center';
  }

  function selectedShapeSizePx(): { width: number; height: number } {
    const attrs = selectedShapeAttrs();
    const shape = (attrs?.shape as PaperShapeKind) ?? 'rectangle';
    const defaults = defaultPaperShapeSize(shape);
    return {
      width: parsePaperShapePx(
        attrs?.width as string,
        parsePaperShapePx(defaults.width, 120),
      ),
      height: parsePaperShapePx(
        attrs?.height as string,
        parsePaperShapePx(defaults.height, 120),
      ),
    };
  }

  function insertShape(shape: PaperShapeKind, fill?: string) {
    const ed = editor.value;
    if (!ed) return;
    const color = fill ?? pendingObjectColor.value ?? PAPER_DEFAULT_SHAPE_FILL;
    const size = defaultPaperShapeSize(shape);
    runPaperFormatCommand(ed, (chain) =>
      chain.insertPaperShape({
        shape,
        fill: color,
        width: size.width,
        height: size.height,
      }),
    );
    setPendingObjectColor(color);
  }

  function setObjectFill(color: string) {
    const ed = editor.value;
    if (!ed) return;
    if (ed.isActive('paperShape')) {
      runPaperFormatCommand(ed, (chain) =>
        chain.updatePaperShapeAttributes({ fill: color }),
      );
    }
    setPendingObjectColor(color);
  }

  function clearObjectFill() {
    const ed = editor.value;
    if (ed?.isActive('paperShape')) {
      runPaperFormatCommand(ed, (chain) =>
        chain.updatePaperShapeAttributes({ fill: PAPER_DEFAULT_SHAPE_FILL }),
      );
    }
    resetPendingObjectColor();
  }

  function setShapeAlign(align: PaperShapeAlign) {
    const ed = editor.value;
    if (!ed?.isActive('paperShape')) return;
    runPaperFormatCommand(ed, (chain) =>
      chain.updatePaperShapeAttributes({ align }),
    );
  }

  function setShapeSizePx(widthPx: number, heightPx?: number) {
    const ed = editor.value;
    if (!ed?.isActive('paperShape')) return;
    const attrs = ed.getAttributes('paperShape');
    const shape = (attrs.shape as PaperShapeKind) ?? 'rectangle';
    const width = clampPaperShapePx(widthPx);
    let height = heightPx != null ? clampPaperShapePx(heightPx) : width;
    if (shape === 'line') {
      height = parsePaperShapePx(attrs.height as string, 4);
    } else if (shape === 'circle' || shape === 'triangle') {
      height = width;
    }
    runPaperFormatCommand(ed, (chain) =>
      chain.updatePaperShapeAttributes({
        width: formatPaperShapePx(width),
        height: formatPaperShapePx(height),
      }),
    );
  }

  return {
    pendingObjectColor,
    isShapeSelected,
    selectedShapeAttrs,
    selectedShapeFill,
    selectedShapeAlign,
    selectedShapeSizePx,
    insertShape,
    setObjectFill,
    clearObjectFill,
    setShapeAlign,
    setShapeSizePx,
  };
}
