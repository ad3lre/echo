import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { findComposerMarkdownStyleRanges } from '@/features/chat/editor/composerMarkdownDecorations';
import { renderPaperKatexHtml } from '@/features/paper/editor/paperKatexRenderCache';

export const paperMarkdownMathDecoKey = new PluginKey('paperMarkdownMathDeco');

type MathSpan = {
  from: number;
  to: number;
  latex: string;
  displayMode: boolean;
};

function findMathSpansInText(text: string): MathSpan[] {
  const spans: MathSpan[] = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('$$', i)) {
      const end = text.indexOf('$$', i + 2);
      if (end !== -1) {
        spans.push({
          from: i,
          to: end + 2,
          latex: text.slice(i + 2, end),
          displayMode: true,
        });
        i = end + 2;
        continue;
      }
    }
    if (text.startsWith('\\[', i)) {
      const end = text.indexOf('\\]', i + 2);
      if (end !== -1) {
        spans.push({
          from: i,
          to: end + 2,
          latex: text.slice(i + 2, end),
          displayMode: true,
        });
        i = end + 2;
        continue;
      }
    }
    if (text.startsWith('\\(', i)) {
      const end = text.indexOf('\\)', i + 2);
      if (end !== -1) {
        spans.push({
          from: i,
          to: end + 2,
          latex: text.slice(i + 2, end),
          displayMode: false,
        });
        i = end + 2;
        continue;
      }
    }
    if (text[i] === '$' && text[i + 1] !== '$') {
      const end = text.indexOf('$', i + 1);
      if (end !== -1 && !/\s/.test(text[i + 1] ?? '')) {
        const body = text.slice(i + 1, end);
        if (body.length > 0 && !/\s/.test(body.at(-1) ?? '')) {
          spans.push({
            from: i,
            to: end + 1,
            latex: body,
            displayMode: false,
          });
          i = end + 1;
          continue;
        }
      }
    }
    i += 1;
  }
  return spans;
}

function buildDecorationSet(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text;
    const base = pos;

    for (const seg of findComposerMarkdownStyleRanges(text, [])) {
      if (seg.start >= seg.end) continue;
      decos.push(
        Decoration.inline(base + seg.start, base + seg.end, {
          class: seg.class,
        }),
      );
    }

    for (const span of findMathSpansInText(text)) {
      const html = renderPaperKatexHtml(span.latex, span.displayMode);
      decos.push(
        Decoration.widget(
          base + span.from,
          () => {
            const el = document.createElement(
              span.displayMode ? 'div' : 'span',
            );
            el.className = span.displayMode
              ? 'paper-math paper-math--display'
              : 'paper-math paper-math--inline';
            el.innerHTML = html;
            return el;
          },
          { side: -1 },
        ),
      );
      decos.push(
        Decoration.inline(base + span.from, base + span.to, {
          class: 'paper-math-source',
        }),
      );
    }
  });

  return decos.length ? DecorationSet.create(doc, decos) : DecorationSet.empty;
}

export const PaperMarkdownMathDecorations = Extension.create({
  name: 'paperMarkdownMathDecorations',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: paperMarkdownMathDecoKey,
        state: {
          init(_, { doc }) {
            return buildDecorationSet(doc);
          },
          apply(tr, pluginState, _old, newState) {
            if (!tr.docChanged) return pluginState;
            return buildDecorationSet(newState.doc);
          },
        },
        props: {
          decorations(state) {
            return paperMarkdownMathDecoKey.getState(state) as DecorationSet;
          },
        },
      }),
    ];
  },
});
