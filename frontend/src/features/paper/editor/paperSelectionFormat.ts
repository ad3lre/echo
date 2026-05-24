import type { Editor } from '@tiptap/core';
import {
  defaultFontPxForBlock,
  PAPER_BLOCK_DEFAULT_FONT_PX,
  readDocDefaultFontFamily,
} from '@/features/paper/editor/paperTypography';

export type TriState = boolean | 'mixed';

export type PaperHeadingState = 'paragraph' | 'h1' | 'h2' | 'h3' | 'mixed';

export type PaperSelectionFormatSnapshot = {
  heading: PaperHeadingState;
  fontSizePx: number | null;
  fontSizeMixed: boolean;
  fontSizeUsesDefault: boolean;
  fontSizeDefaultHint: string | null;
  fontFamily: string;
  fontFamilyMixed: boolean;
  bold: TriState;
  italic: TriState;
  underline: TriState;
  strike: TriState;
  textAlign: 'left' | 'center' | 'right' | 'justify' | 'mixed';
};

function parseFontSizePx(
  raw: unknown,
  blockType: string,
  level?: number,
): number {
  if (typeof raw === 'string' && raw.trim()) {
    const n = parseInt(raw.replace(/px$/i, ''), 10);
    if (!Number.isNaN(n)) return n;
  }
  return defaultFontPxForBlock(blockType, level);
}

function headingKey(nodeName: string, level?: number): PaperHeadingState {
  if (nodeName === 'heading') {
    if (level === 1) return 'h1';
    if (level === 2) return 'h2';
    if (level === 3) return 'h3';
  }
  return 'paragraph';
}

function blockContextAtPos(editor: Editor, pos: number) {
  const $pos = editor.state.doc.resolve(
    Math.max(0, Math.min(pos, editor.state.doc.content.size)),
  );
  for (let d = $pos.depth; d > 0; d--) {
    const n = $pos.node(d);
    if (n.type.name === 'heading' || n.type.name === 'paragraph') {
      return {
        type: n.type.name,
        level: n.attrs.level as number | undefined,
      };
    }
  }
  return { type: 'paragraph', level: undefined };
}

function markActiveInRange(
  editor: Editor,
  from: number,
  to: number,
  markName: string,
): TriState {
  const doc = editor.state.doc;
  let any = false;
  let all = true;
  const rangeFrom = Math.min(from, to);
  const rangeTo = Math.max(from, to);

  doc.nodesBetween(rangeFrom, rangeTo, (node, pos) => {
    if (!node.isText || !node.text?.length) return;
    const nodeFrom = Math.max(rangeFrom, pos);
    const nodeTo = Math.min(rangeTo, pos + node.nodeSize);
    if (nodeFrom >= nodeTo) return;
    const nodeHas = node.marks.some((m) => m.type.name === markName);
    if (nodeHas) any = true;
    else all = false;
  });

  if (rangeFrom === rangeTo) {
    const marks = editor.state.doc.resolve(rangeFrom).marks();
    const has = marks.some((m) => m.type.name === markName);
    return has;
  }

  if (!any) return false;
  return all ? true : 'mixed';
}

export function analyzePaperSelectionFormat(
  editor: Editor | null | undefined,
): PaperSelectionFormatSnapshot {
  const empty: PaperSelectionFormatSnapshot = {
    heading: 'paragraph',
    fontSizePx: PAPER_BLOCK_DEFAULT_FONT_PX.paragraph,
    fontSizeMixed: false,
    fontSizeUsesDefault: true,
    fontSizeDefaultHint: null,
    fontFamily: readDocDefaultFontFamily(null),
    fontFamilyMixed: false,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    textAlign: 'left',
  };
  if (!editor) return empty;

  const { from, to } = editor.state.selection;
  const docJson = editor.getJSON() as Record<string, unknown>;
  const docDefaultFont = readDocDefaultFontFamily(docJson);

  const headings = new Set<PaperHeadingState>();
  const fontSizes = new Set<number>();
  const families = new Set<string>();
  let anyExplicitFontSize = false;
  const aligns = new Set<string>();

  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'heading' || node.type.name === 'paragraph') {
      headings.add(
        headingKey(node.type.name, node.attrs.level as number | undefined),
      );
      const align = node.attrs.textAlign;
      if (typeof align === 'string') aligns.add(align);
    }
    if (node.isText) {
      const ctx = blockContextAtPos(editor, pos);
      const ts = node.marks.find((m) => m.type.name === 'textStyle');
      const rawSize = ts?.attrs.fontSize;
      if (typeof rawSize === 'string' && rawSize.trim()) {
        anyExplicitFontSize = true;
      }
      fontSizes.add(parseFontSizePx(rawSize, ctx.type, ctx.level));
      const fam = ts?.attrs.fontFamily;
      families.add(
        typeof fam === 'string' && fam.trim() ? fam.trim() : docDefaultFont,
      );
    }
  });

  if (headings.size === 0) {
    const ctx = blockContextAtPos(editor, from);
    headings.add(headingKey(ctx.type, ctx.level));
  }
  if (fontSizes.size === 0) {
    const ctx = blockContextAtPos(editor, from);
    fontSizes.add(defaultFontPxForBlock(ctx.type, ctx.level));
  }
  if (families.size === 0) families.add(docDefaultFont);

  const heading: PaperHeadingState =
    headings.size > 1 ? 'mixed' : ([...headings][0] ?? 'paragraph');

  const fontSizeMixed = fontSizes.size > 1;
  const fontSizePx = fontSizeMixed ? null : ([...fontSizes][0] ?? null);
  const fontSizeUsesDefault = !anyExplicitFontSize && !fontSizeMixed;
  let fontSizeDefaultHint: string | null = null;
  if (fontSizeUsesDefault && heading === 'h1') fontSizeDefaultHint = 'H1';
  else if (fontSizeUsesDefault && heading === 'h2') fontSizeDefaultHint = 'H2';
  else if (fontSizeUsesDefault && heading === 'h3') fontSizeDefaultHint = 'H3';
  else if (fontSizeUsesDefault) fontSizeDefaultHint = 'Body';

  const fontFamilyMixed = families.size > 1;
  const fontFamily = fontFamilyMixed
    ? ''
    : ([...families][0] ?? docDefaultFont);

  let textAlign: PaperSelectionFormatSnapshot['textAlign'] = 'left';
  if (aligns.size > 1) textAlign = 'mixed';
  else if (aligns.has('center')) textAlign = 'center';
  else if (aligns.has('right')) textAlign = 'right';
  else if (aligns.has('justify')) textAlign = 'justify';

  return {
    heading,
    fontSizePx,
    fontSizeMixed,
    fontSizeUsesDefault,
    fontSizeDefaultHint,
    fontFamily,
    fontFamilyMixed,
    bold: markActiveInRange(editor, from, to, 'bold'),
    italic: markActiveInRange(editor, from, to, 'italic'),
    underline: markActiveInRange(editor, from, to, 'underline'),
    strike: markActiveInRange(editor, from, to, 'strike'),
    textAlign,
  };
}
