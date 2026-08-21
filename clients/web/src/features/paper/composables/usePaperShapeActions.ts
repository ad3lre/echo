import type { Ref } from 'vue';
import type { Editor } from '@tiptap/core';
import {
  defaultPaperShapeSize,
  PAPER_DEFAULT_SHAPE_BORDER_COLOR,
  PAPER_DEFAULT_SHAPE_FILL,
  PAPER_SHAPE_FILL_NONE,
  type PaperShapeAlign,
  type PaperShapeBorderStyle,
  type PaperShapeKind,
} from '@/features/paper/editor/paperShapeExtension';
import {
  clampPaperShapePx,
  formatPaperShapeBorderWidth,
  formatPaperShapePx,
  isPaperShapeFillNone,
  parsePaperShapeBorderWidth,
  parsePaperShapePx,
  PAPER_SHAPE_SIZE_PRESETS,
  stepShapeSizePx,
} from '@/features/paper/editor/paperShapeUtils';

export { PAPER_SHAPE_SIZE_PRESETS };
import { runPaperFormatCommand } from '@/features/paper/editor/paperFormatSelection';
import { usePaperObjectColor } from '@/features/paper/composables/usePaperObjectColor';

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
    return typeof fill === 'string' ? fill : null;
  }

  function selectedShapeFillIsNone(): boolean {
    return isPaperShapeFillNone(selectedShapeFill());
  }

  function selectedShapeBorderColor(): string | null {
    const color = selectedShapeAttrs()?.borderColor;
    return typeof color === 'string' && color.trim() ? color : null;
  }

  function selectedShapeBorderWidthPx(): number {
    return parsePaperShapeBorderWidth(
      selectedShapeAttrs()?.borderWidth as string | undefined,
    );
  }

  function selectedShapeBorderStyle(): PaperShapeBorderStyle {
    const style = selectedShapeAttrs()?.borderStyle;
    return style === 'dashed' || style === 'dotted' ? style : 'solid';
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
        adjacent: true,
      }),
    );
    if (!isPaperShapeFillNone(color)) {
      setPendingObjectColor(color);
    }
  }

  function replaceShape(shape: PaperShapeKind) {
    const ed = editor.value;
    if (!ed?.isActive('paperShape')) return;
    const size = defaultPaperShapeSize(shape);
    runPaperFormatCommand(ed, (chain) =>
      chain.updatePaperShapeAttributes({
        shape,
        width: size.width,
        height: size.height,
      }),
    );
  }

  function setShapeImage(src: string | null) {
    const ed = editor.value;
    if (!ed?.isActive('paperShape')) return;
    runPaperFormatCommand(ed, (chain) =>
      chain.updatePaperShapeAttributes({ imageSrc: src }),
    );
  }

  function clearShapeImage() {
    setShapeImage(null);
  }

  function setObjectFill(color: string) {
    const ed = editor.value;
    if (!ed) return;
    const fill = isPaperShapeFillNone(color) ? PAPER_SHAPE_FILL_NONE : color;
    if (ed.isActive('paperShape')) {
      runPaperFormatCommand(ed, (chain) =>
        chain.updatePaperShapeAttributes({ fill }),
      );
    }
    if (!isPaperShapeFillNone(fill)) {
      setPendingObjectColor(fill);
    }
  }

  function clearObjectFill() {
    const ed = editor.value;
    if (ed?.isActive('paperShape')) {
      runPaperFormatCommand(ed, (chain) =>
        chain.updatePaperShapeAttributes({ fill: PAPER_SHAPE_FILL_NONE }),
      );
    }
  }

  function setShapeBorderColor(color: string | null) {
    const ed = editor.value;
    if (!ed?.isActive('paperShape')) return;
    const borderColor = color && !isPaperShapeFillNone(color) ? color : null;
    runPaperFormatCommand(ed, (chain) =>
      chain.updatePaperShapeAttributes({ borderColor }),
    );
  }

  function setShapeBorderWidth(px: number) {
    const ed = editor.value;
    if (!ed?.isActive('paperShape')) return;
    const width = Math.max(0, Math.min(24, Math.round(px)));
    const attrs = ed.getAttributes('paperShape');
    const updates: Record<string, unknown> = {
      borderWidth: formatPaperShapeBorderWidth(width),
    };
    if (
      width > 0 &&
      (!attrs.borderColor ||
        isPaperShapeFillNone(String(attrs.borderColor ?? '')))
    ) {
      updates.borderColor = PAPER_DEFAULT_SHAPE_BORDER_COLOR;
    }
    if (width === 0) {
      updates.borderColor = null;
    }
    runPaperFormatCommand(ed, (chain) =>
      chain.updatePaperShapeAttributes(updates),
    );
  }

  function setShapeBorderStyle(style: PaperShapeBorderStyle) {
    const ed = editor.value;
    if (!ed?.isActive('paperShape')) return;
    runPaperFormatCommand(ed, (chain) =>
      chain.updatePaperShapeAttributes({ borderStyle: style }),
    );
  }

  function clearShapeBorder() {
    const ed = editor.value;
    if (!ed?.isActive('paperShape')) return;
    runPaperFormatCommand(ed, (chain) =>
      chain.updatePaperShapeAttributes({
        borderColor: null,
        borderWidth: '0px',
        borderStyle: 'solid',
      }),
    );
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

  function stepShapeSize(direction: 'up' | 'down') {
    const { width } = selectedShapeSizePx();
    setShapeSizePx(stepShapeSizePx(width, direction));
  }

  return {
    pendingObjectColor,
    isShapeSelected,
    selectedShapeAttrs,
    selectedShapeFill,
    selectedShapeFillIsNone,
    selectedShapeBorderColor,
    selectedShapeBorderWidthPx,
    selectedShapeBorderStyle,
    selectedShapeAlign,
    selectedShapeSizePx,
    insertShape,
    replaceShape,
    setObjectFill,
    clearObjectFill,
    setShapeBorderColor,
    setShapeBorderWidth,
    setShapeBorderStyle,
    clearShapeBorder,
    setShapeAlign,
    setShapeSizePx,
    stepShapeSize,
    setShapeImage,
    clearShapeImage,
  };
}
