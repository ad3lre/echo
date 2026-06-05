import type { NodeViewRendererProps } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import {
  PAPER_DEFAULT_SHAPE_FILL,
  defaultPaperShapeSize,
  type PaperShapeAlign,
  type PaperShapeKind,
} from '@/features/paper/editor/paperShapeExtension';
import {
  alignWrapClass,
  computeShapeResize,
  formatPaperShapePx,
  parsePaperShapePx,
  shapeInlineStyle,
} from '@/features/paper/editor/paperShapeUtils';

type ResizeCorner = 'se' | 'e';

function readShapeAttrs(node: { attrs: Record<string, unknown> }): {
  shape: PaperShapeKind;
  fill: string;
  width: string;
  height: string;
  align: PaperShapeAlign;
} {
  const shape = (node.attrs.shape as PaperShapeKind) ?? 'rectangle';
  const defaults = defaultPaperShapeSize(shape);
  return {
    shape,
    fill: (node.attrs.fill as string) ?? PAPER_DEFAULT_SHAPE_FILL,
    width: (node.attrs.width as string) ?? defaults.width,
    height: (node.attrs.height as string) ?? defaults.height,
    align: (node.attrs.align as PaperShapeAlign) ?? 'center',
  };
}

function applyShapeDom(
  wrap: HTMLElement,
  host: HTMLElement,
  inner: HTMLElement,
  attrs: ReturnType<typeof readShapeAttrs>,
): void {
  wrap.className = `paper-editor-shape-wrap ${alignWrapClass(attrs.align)}`;
  wrap.dataset.paperShapeAlign = attrs.align;

  inner.className = `paper-editor-shape paper-editor-shape--${attrs.shape}`;
  inner.dataset.paperShape = attrs.shape;
  inner.dataset.paperShapeFill = attrs.fill;
  inner.style.cssText = shapeInlineStyle(
    attrs.shape,
    attrs.fill,
    attrs.width,
    attrs.height,
  );
}

export function createPaperShapeNodeView() {
  return ({ node, editor, getPos }: NodeViewRendererProps) => {
    let currentNode = node;
    const wrap = document.createElement('div');
    wrap.className = 'paper-editor-shape-wrap';
    wrap.dataset.paperShapeWrap = '';

    const host = document.createElement('div');
    host.className = 'paper-editor-shape-host';

    const inner = document.createElement('div');
    inner.className = 'paper-editor-shape';

    const handles: Partial<Record<ResizeCorner, HTMLButtonElement>> = {};

    function updateNodeMarkup(widthPx: number, heightPx: number) {
      const pos = getPos();
      if (typeof pos !== 'number') return;
      const attrs = readShapeAttrs(currentNode);
      editor.view.dispatch(
        editor.view.state.tr.setNodeMarkup(pos, undefined, {
          ...currentNode.attrs,
          width: formatPaperShapePx(widthPx),
          height: formatPaperShapePx(heightPx),
        }),
      );
    }

    function bindHandle(corner: ResizeCorner, cursor: string) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `paper-shape-handle paper-shape-handle--${corner}`;
      btn.setAttribute('aria-label', 'Resize shape');
      btn.style.cursor = cursor;
      btn.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const attrs = readShapeAttrs(currentNode);
        const startW = parsePaperShapePx(attrs.width, 120);
        const startH = parsePaperShapePx(attrs.height, 120);
        const startX = event.clientX;
        const startY = event.clientY;

        const onMove = (ev: MouseEvent) => {
          const next = computeShapeResize(
            attrs.shape,
            startW,
            startH,
            ev.clientX - startX,
            ev.clientY - startY,
            corner,
          );
          inner.style.width = formatPaperShapePx(next.width);
          inner.style.height = formatPaperShapePx(next.height);
        };

        const onUp = (ev: MouseEvent) => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          const next = computeShapeResize(
            attrs.shape,
            startW,
            startH,
            ev.clientX - startX,
            ev.clientY - startY,
            corner,
          );
          updateNodeMarkup(next.width, next.height);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      handles[corner] = btn;
      host.appendChild(btn);
    }

    host.appendChild(inner);
    bindHandle('se', 'nwse-resize');
    bindHandle('e', 'ew-resize');
    wrap.appendChild(host);

    applyShapeDom(wrap, host, inner, readShapeAttrs(currentNode));

    return {
      dom: wrap,
      update: (updatedNode: ProseMirrorNode) => {
        if (updatedNode.type.name !== 'paperShape') return false;
        currentNode = updatedNode;
        applyShapeDom(wrap, host, inner, readShapeAttrs(updatedNode));
        return true;
      },
    };
  };
}
