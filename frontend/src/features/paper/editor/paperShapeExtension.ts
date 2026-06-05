import { Node, mergeAttributes } from '@tiptap/core';
import { createPaperShapeNodeView } from '@/features/paper/editor/paperShapeNodeView';
import { insertPaperShapeAdjacent } from '@/features/paper/editor/paperShapeInsert';
import {
  alignWrapClass,
  hostInlineStyle,
  shapeInlineStyle,
} from '@/features/paper/editor/paperShapeUtils';

export type PaperShapeKind = 'rectangle' | 'circle' | 'triangle' | 'line';
export type PaperShapeAlign = 'left' | 'center' | 'right';

export const PAPER_DEFAULT_SHAPE_FILL = '#3b82f6';
export const PAPER_SHAPE_FILL_NONE = 'transparent';
export const PAPER_DEFAULT_SHAPE_BORDER_COLOR = '#111111';

export type PaperShapeBorderStyle = 'solid' | 'dashed' | 'dotted';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paperShape: {
      insertPaperShape: (attrs: {
        shape: PaperShapeKind;
        fill?: string;
        width?: string;
        height?: string;
        align?: PaperShapeAlign;
        adjacent?: boolean;
      }) => ReturnType;
      updatePaperShapeAttributes: (attrs: {
        fill?: string;
        width?: string;
        height?: string;
        align?: PaperShapeAlign;
        shape?: PaperShapeKind;
        imageSrc?: string | null;
        borderColor?: string | null;
        borderWidth?: string;
        borderStyle?: PaperShapeBorderStyle;
      }) => ReturnType;
    };
  }
}

export function defaultPaperShapeSize(shape: PaperShapeKind): {
  width: string;
  height: string;
} {
  if (shape === 'line') return { width: '160px', height: '4px' };
  return { width: '120px', height: '120px' };
}

function readAttrsFromElement(element: HTMLElement): {
  shape: PaperShapeKind;
  fill: string;
  width: string;
  height: string;
  align: PaperShapeAlign;
  imageSrc: string | null;
  borderColor: string | null;
  borderWidth: string;
  borderStyle: PaperShapeBorderStyle;
} {
  const inner =
    element.matches('[data-paper-shape]') &&
    !element.matches('[data-paper-shape-wrap]')
      ? element
      : (element.querySelector<HTMLElement>('[data-paper-shape]') ?? element);
  const shapeRaw = inner.getAttribute('data-paper-shape');
  const shape: PaperShapeKind =
    shapeRaw === 'circle' ||
    shapeRaw === 'triangle' ||
    shapeRaw === 'line' ||
    shapeRaw === 'rectangle'
      ? shapeRaw
      : 'rectangle';
  const defaults = defaultPaperShapeSize(shape);
  const alignRaw =
    element.getAttribute('data-paper-shape-align') ??
    inner.getAttribute('data-paper-shape-align');
  const align: PaperShapeAlign =
    alignRaw === 'left' || alignRaw === 'right' || alignRaw === 'center'
      ? alignRaw
      : 'center';
  const imageRaw =
    inner.getAttribute('data-paper-shape-image') ??
    element.getAttribute('data-paper-shape-image');
  const borderColorRaw =
    inner.getAttribute('data-paper-shape-border-color') ??
    element.getAttribute('data-paper-shape-border-color');
  const borderWidthRaw =
    inner.getAttribute('data-paper-shape-border-width') ?? '0';
  const borderStyleRaw = inner.getAttribute('data-paper-shape-border-style');
  const borderStyle: PaperShapeBorderStyle =
    borderStyleRaw === 'dashed' || borderStyleRaw === 'dotted'
      ? borderStyleRaw
      : 'solid';
  return {
    shape,
    fill:
      inner.getAttribute('data-paper-shape-fill') ?? PAPER_DEFAULT_SHAPE_FILL,
    width: inner.style.width || defaults.width,
    height: inner.style.height || defaults.height,
    align,
    imageSrc: imageRaw?.trim() ? imageRaw.trim() : null,
    borderColor: borderColorRaw?.trim() ? borderColorRaw.trim() : null,
    borderWidth: borderWidthRaw,
    borderStyle,
  };
}

/** Block-level vector shapes with optional text and background images. */
export const PaperShape = Node.create({
  name: 'paperShape',
  group: 'block paperShape',
  content: 'paragraph*',
  atom: false,
  draggable: true,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      shape: {
        default: 'rectangle',
        parseHTML: (element) => readAttrsFromElement(element).shape,
        renderHTML: (attributes) => ({
          'data-paper-shape': attributes.shape as string,
        }),
      },
      fill: {
        default: PAPER_DEFAULT_SHAPE_FILL,
        parseHTML: (element) => readAttrsFromElement(element).fill,
        renderHTML: (attributes) => ({
          'data-paper-shape-fill': attributes.fill as string,
        }),
      },
      width: {
        default: '120px',
        parseHTML: (element) => readAttrsFromElement(element).width,
        renderHTML: () => ({}),
      },
      height: {
        default: '120px',
        parseHTML: (element) => readAttrsFromElement(element).height,
        renderHTML: () => ({}),
      },
      align: {
        default: 'center',
        parseHTML: (element) => readAttrsFromElement(element).align,
        renderHTML: (attributes) => ({
          'data-paper-shape-align': attributes.align as string,
        }),
      },
      imageSrc: {
        default: null,
        parseHTML: (element) => readAttrsFromElement(element).imageSrc,
        renderHTML: (attributes) => {
          const src = attributes.imageSrc as string | null | undefined;
          if (!src?.trim()) return {};
          return { 'data-paper-shape-image': src.trim() };
        },
      },
      borderColor: {
        default: null,
        parseHTML: (element) => readAttrsFromElement(element).borderColor,
        renderHTML: (attributes) => {
          const color = attributes.borderColor as string | null | undefined;
          if (!color?.trim()) return {};
          return { 'data-paper-shape-border-color': color.trim() };
        },
      },
      borderWidth: {
        default: '0px',
        parseHTML: (element) => readAttrsFromElement(element).borderWidth,
        renderHTML: (attributes) => {
          const width = attributes.borderWidth as string | undefined;
          if (!width || width === '0px') return {};
          return { 'data-paper-shape-border-width': width };
        },
      },
      borderStyle: {
        default: 'solid',
        parseHTML: (element) => readAttrsFromElement(element).borderStyle,
        renderHTML: (attributes) => {
          const style = attributes.borderStyle as PaperShapeBorderStyle;
          if (!style || style === 'solid') return {};
          return { 'data-paper-shape-border-style': style };
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'div[data-paper-shape-wrap]' },
      { tag: 'div[data-paper-shape]' },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const shape = (node.attrs.shape as PaperShapeKind) ?? 'rectangle';
    const fill = (node.attrs.fill as string) ?? PAPER_DEFAULT_SHAPE_FILL;
    const width = (node.attrs.width as string) ?? '120px';
    const height = (node.attrs.height as string) ?? '120px';
    const align = (node.attrs.align as PaperShapeAlign) ?? 'center';
    const imageSrc = (node.attrs.imageSrc as string | null) ?? null;
    const borderColor = (node.attrs.borderColor as string | null) ?? null;
    const borderWidth = (node.attrs.borderWidth as string) ?? '0px';
    const borderStyle =
      (node.attrs.borderStyle as PaperShapeBorderStyle) ?? 'solid';
    const innerStyle = shapeInlineStyle(shape, fill, width, height, imageSrc, {
      color: borderColor,
      width: borderWidth,
      style: borderStyle,
    });
    const hostStyle = hostInlineStyle(width, height);

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        class: `paper-editor-shape-wrap ${alignWrapClass(align)}`,
        'data-paper-shape-wrap': '',
        'data-paper-shape-align': align,
      }),
      [
        'div',
        {
          class: 'paper-editor-shape-host',
          style: hostStyle,
        },
        [
          'div',
          {
            class: `paper-editor-shape paper-editor-shape--${shape}`,
            style: innerStyle,
            'data-paper-shape': shape,
            'data-paper-shape-fill': fill,
            ...(imageSrc ? { 'data-paper-shape-image': imageSrc } : {}),
            ...(borderColor
              ? { 'data-paper-shape-border-color': borderColor }
              : {}),
            ...(borderWidth !== '0px'
              ? { 'data-paper-shape-border-width': borderWidth }
              : {}),
            ...(borderStyle !== 'solid'
              ? { 'data-paper-shape-border-style': borderStyle }
              : {}),
          },
        ],
        ['div', { class: 'paper-editor-shape-content' }, 0],
      ],
    ];
  },

  addNodeView() {
    return createPaperShapeNodeView();
  },

  addCommands() {
    return {
      insertPaperShape:
        (attrs) =>
        ({ editor, commands }) => {
          const adjacent = attrs.adjacent !== false;
          if (adjacent && insertPaperShapeAdjacent(editor, attrs)) {
            return true;
          }
          const shape = attrs.shape ?? 'rectangle';
          const size = defaultPaperShapeSize(shape);
          return commands.insertContent({
            type: this.name,
            attrs: {
              shape,
              fill: attrs.fill ?? PAPER_DEFAULT_SHAPE_FILL,
              width: attrs.width ?? size.width,
              height: attrs.height ?? size.height,
              align: attrs.align ?? 'center',
            },
          });
        },
      updatePaperShapeAttributes:
        (attrs) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attrs),
    };
  },
});
