import type { Editor } from '@tiptap/core';

export type PaperSelectionColors = {
  textColor: string | null;
  textMixed: boolean;
  textIsDefault: boolean;
  highlightColor: string | null;
  highlightMixed: boolean;
  hasHighlight: boolean;
};

function collectMarkValues(
  editor: Editor,
  from: number,
  to: number,
  markName: string,
  attr: string,
): { values: Set<string>; anyUnset: boolean } {
  const values = new Set<string>();
  let anyUnset = false;
  const rangeFrom = Math.min(from, to);
  const rangeTo = Math.max(from, to);

  editor.state.doc.nodesBetween(rangeFrom, rangeTo, (node) => {
    if (!node.isText) return;
    const m = node.marks.find((x) => x.type.name === markName);
    if (!m) {
      anyUnset = true;
      return;
    }
    const v = m.attrs[attr];
    if (typeof v === 'string' && v.trim()) values.add(v.trim());
    else anyUnset = true;
  });

  if (rangeFrom === rangeTo) {
    const m = editor.state.doc
      .resolve(rangeFrom)
      .marks()
      .find((x) => x.type.name === markName);
    if (!m) anyUnset = true;
    else {
      const v = m.attrs[attr];
      if (typeof v === 'string' && v.trim()) values.add(v.trim());
      else anyUnset = true;
    }
  }

  return { values, anyUnset };
}

function defaultTextColorFromDom(editor: Editor): string | null {
  try {
    const dom = editor.view?.dom;
    if (
      !(dom instanceof HTMLElement) ||
      typeof getComputedStyle !== 'function'
    ) {
      return null;
    }
    const fg = getComputedStyle(dom).color;
    return fg || null;
  } catch {
    return null;
  }
}

export function analyzePaperSelectionColors(
  editor: Editor | null | undefined,
): PaperSelectionColors {
  const empty: PaperSelectionColors = {
    textColor: null,
    textMixed: false,
    textIsDefault: true,
    highlightColor: null,
    highlightMixed: false,
    hasHighlight: false,
  };
  if (!editor) return empty;

  const { from, to } = editor.state.selection;
  const text = collectMarkValues(editor, from, to, 'textStyle', 'color');
  const hi = collectMarkValues(editor, from, to, 'highlight', 'color');

  const textMixed =
    text.values.size > 1 || (text.values.size > 0 && text.anyUnset);
  const textIsDefault = text.values.size === 0 && text.anyUnset;
  const textColor = textMixed
    ? null
    : text.values.size === 1
      ? [...text.values][0]
      : textIsDefault
        ? defaultTextColorFromDom(editor)
        : null;

  const highlightMixed =
    hi.values.size > 1 || (hi.values.size > 0 && hi.anyUnset);
  const hasHighlight = hi.values.size > 0 && !highlightMixed;
  const highlightColor = highlightMixed
    ? null
    : hasHighlight
      ? [...hi.values][0]
      : null;

  return {
    textColor,
    textMixed,
    textIsDefault,
    highlightColor,
    highlightMixed,
    hasHighlight,
  };
}
