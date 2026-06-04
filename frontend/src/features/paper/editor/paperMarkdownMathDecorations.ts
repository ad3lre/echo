import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { findComposerMarkdownStyleRanges } from '@/features/chat/editor/composerMarkdownDecorations';
import { getPaperMarkdownRenderInline } from '@/features/paper/editor/paperMarkdownRenderState';
import { extractMarkdownMathRegions } from '@/composables/markdownMathRegions';
import { renderMarkdownKatexSafeHtml } from '@/composables/markdownKatex';

export const paperMarkdownMathDecoKey = new PluginKey('paperMarkdownMathDeco');

type PaperMarkdownMathDecoState = {
  renderInline: boolean;
  decos: DecorationSet;
};

function buildInlineDecorationSet(doc: PMNode): Decoration[] {
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

    for (const span of extractMarkdownMathRegions(text).regions) {
      const html = renderMarkdownKatexSafeHtml(span.latex, span.displayMode);
      decos.push(
        Decoration.widget(
          base + span.start,
          () => {
            const el = document.createElement('span');
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
        Decoration.inline(base + span.start, base + span.end, {
          class: 'paper-math-source',
        }),
      );
    }
  });

  return decos;
}

function buildDecorationSet(doc: PMNode, renderInline: boolean): DecorationSet {
  if (!renderInline) return DecorationSet.empty;
  const decos = buildInlineDecorationSet(doc);
  return decos.length ? DecorationSet.create(doc, decos) : DecorationSet.empty;
}

export const PaperMarkdownMathDecorations = Extension.create({
  name: 'paperMarkdownMathDecorations',
  addProseMirrorPlugins() {
    return [
      new Plugin<PaperMarkdownMathDecoState>({
        key: paperMarkdownMathDecoKey,
        state: {
          init(_, { doc }) {
            const renderInline = getPaperMarkdownRenderInline();
            return {
              renderInline,
              decos: buildDecorationSet(doc, renderInline),
            };
          },
          apply(tr, pluginState, _old, newState) {
            const renderInline = getPaperMarkdownRenderInline();
            const shouldRebuild =
              tr.docChanged || pluginState.renderInline !== renderInline;
            if (!shouldRebuild) {
              return { ...pluginState, renderInline };
            }

            return {
              renderInline,
              decos: buildDecorationSet(newState.doc, renderInline),
            };
          },
        },
        props: {
          decorations(state) {
            const st = paperMarkdownMathDecoKey.getState(state) as
              | PaperMarkdownMathDecoState
              | undefined;
            return st?.decos ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
