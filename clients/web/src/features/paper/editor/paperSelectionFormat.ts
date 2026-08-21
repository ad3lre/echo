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
  bulletList: TriState;
  orderedList: TriState;
  letterSpacing: string | null;
  letterSpacingMixed: boolean;
  lineHeight: string | null;
  lineHeightMixed: boolean;
  textOutlineWidth: string | null;
  textOutlineColor: string | null;
  textOutlineMixed: boolean;
  indent: number;
  indentMixed: boolean;
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

function attrInRangeMixed(
  editor: Editor,
  from: number,
  to: number,
  markName: string,
  attrKey: string,
): { value: unknown | null; mixed: boolean } {
  const doc = editor.state.doc;
  const values = new Set<unknown>();
  const rangeFrom = Math.min(from, to);
  const rangeTo = Math.max(from, to);

  doc.nodesBetween(rangeFrom, rangeTo, (node, pos) => {
    if (!node.isText || !node.text?.length) return;
    const nodeFrom = Math.max(rangeFrom, pos);
    const nodeTo = Math.min(rangeTo, pos + node.nodeSize);
    if (nodeFrom >= nodeTo) return;
    const mark = node.marks.find((m) => m.type.name === markName);
    const v = mark?.attrs?.[attrKey] ?? null;
    values.add(v);
  });

  if (rangeFrom === rangeTo) {
    const marks = editor.state.doc.resolve(rangeFrom).marks();
    const mark = marks.find((m) => m.type.name === markName);
    return { value: mark?.attrs?.[attrKey] ?? null, mixed: false };
  }

  if (values.size === 0) return { value: null, mixed: false };
  if (values.size === 1) return { value: [...values][0], mixed: false };
  return { value: null, mixed: true };
}

function indentInSelection(
  editor: Editor,
  from: number,
  to: number,
): { value: number; mixed: boolean } {
  const indents = new Set<number>();
  const indentTypes = ['paragraph', 'heading', 'listItem'];
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (indentTypes.includes(node.type.name)) {
      const level = (node.attrs.indent as number | undefined) ?? 0;
      indents.add(level);
    }
  });
  if (indents.size === 0) return { value: 0, mixed: false };
  if (indents.size === 1)
    return { value: [...indents][0] as number, mixed: false };
  return { value: 0, mixed: true };
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
    bulletList: false,
    orderedList: false,
    letterSpacing: null,
    letterSpacingMixed: false,
    lineHeight: null,
    lineHeightMixed: false,
    textOutlineWidth: null,
    textOutlineColor: null,
    textOutlineMixed: false,
    indent: 0,
    indentMixed: false,
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

  let fontFamilyMixed = families.size > 1;
  let fontFamily = fontFamilyMixed ? '' : ([...families][0] ?? docDefaultFont);

  // Collapsed caret: prefer stored typing attributes over the surrounding text run.
  if (from === to) {
    const caretFam = editor.getAttributes('textStyle').fontFamily;
    fontFamily =
      typeof caretFam === 'string' && caretFam.trim()
        ? caretFam.trim()
        : docDefaultFont;
    fontFamilyMixed = false;
  }

  let textAlign: PaperSelectionFormatSnapshot['textAlign'] = 'left';
  if (aligns.size > 1) textAlign = 'mixed';
  else if (aligns.has('center')) textAlign = 'center';
  else if (aligns.has('right')) textAlign = 'right';
  else if (aligns.has('justify')) textAlign = 'justify';

  const letterSpacingResult = attrInRangeMixed(
    editor,
    from,
    to,
    'textStyle',
    'letterSpacing',
  );
  const lineHeightResult = attrInRangeMixed(
    editor,
    from,
    to,
    'textStyle',
    'lineHeight',
  );
  const textStrokeWidthResult = attrInRangeMixed(
    editor,
    from,
    to,
    'textStyle',
    'textStrokeWidth',
  );
  const textStrokeColorResult = attrInRangeMixed(
    editor,
    from,
    to,
    'textStyle',
    'textStrokeColor',
  );
  const indentResult = indentInSelection(editor, from, to);

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
    bulletList: editor.isActive('bulletList'),
    orderedList: editor.isActive('orderedList'),
    letterSpacing: (letterSpacingResult.value as string | null) ?? null,
    letterSpacingMixed: letterSpacingResult.mixed,
    lineHeight: (lineHeightResult.value as string | null) ?? null,
    lineHeightMixed: lineHeightResult.mixed,
    textOutlineWidth: (textStrokeWidthResult.value as string | null) ?? null,
    textOutlineColor: (textStrokeColorResult.value as string | null) ?? null,
    textOutlineMixed:
      textStrokeWidthResult.mixed || textStrokeColorResult.mixed,
    indent: indentResult.value,
    indentMixed: indentResult.mixed,
  };
}
