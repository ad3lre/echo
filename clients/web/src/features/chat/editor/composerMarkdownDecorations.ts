import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import {
  rawOffsetToEditorPos,
  serializeComposerDoc,
} from '@/features/chat/editor/composerModel';
import { findRawDiscordSpoilerRegions } from '@/features/chat/markdown/discordSpoilerMarkdown';
import {
  createEscapedMarkdownFenceWalkState,
  stepEscapedMarkdownFenceAtLine,
} from '@/features/chat/markdown/markdownFenceEscape';
import { mightHaveMarkdownSyntax } from '@/features/chat/markdown/messageBodyMarkdown';

/** Toggle live delimiter styling via transaction meta. */
export const composerMarkdownDecoKey = new PluginKey(
  'echoComposerMarkdownDeco',
);

type StyleSeg = { start: number; end: number; class: string };

const HR_LINE_RE =
  /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})\s*$/;
const ATX_HEADING_RE = /^ {0,3}(#{1,6})([ \t]+)(.*?)(?:[ \t]+#+\s*)?$/;
const BLOCKQUOTE_PREFIX_RE = /^ {0,3}((?:>[ \t]?)+)(.*)$/;
const UL_TASK_RE = /^(\s*)([-*+])(\s+)\[([ xX])\](\s+)(.*)$/;
const UL_RE = /^(\s*)([-*+])(\s+)(.*)$/;
const OL_RE = /^(\s*)(\d{1,9}\.)(\s+)(.*)$/;
const TABLE_ROW_RE = /^\s*\|.+$/;

function rangesOverlap(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): boolean {
  return a0 < b1 && b0 < a1;
}

function overlapsAny(
  s: number,
  e: number,
  blocks: readonly [number, number][],
): boolean {
  return blocks.some(([a, b]) => rangesOverlap(s, e, a, b));
}

function mergeBlocks(blocks: [number, number][]): [number, number][] {
  if (blocks.length === 0) return [];
  const sorted = [...blocks].sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  let cur = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i]!;
    if (n[0] <= cur[1]) cur = [cur[0], Math.max(cur[1], n[1])];
    else {
      out.push(cur);
      cur = n;
    }
  }
  out.push(cur);
  return out;
}

/** GFM-style fenced code blocks (``` / ~~~). Unclosed fence runs to EOF. */
function findFencedCodeBlockRanges(content: string): [number, number][] {
  const ranges: [number, number][] = [];
  let pos = 0;
  let blockStart = -1;
  let fenceChar: '`' | '~' = '`';
  let minCloseLen = 3;
  const escapedFence = createEscapedMarkdownFenceWalkState();

  while (pos <= content.length) {
    const nl = content.indexOf('\n', pos);
    const lineEnd = nl === -1 ? content.length : nl;
    const line = content.slice(pos, lineEnd);

    if (stepEscapedMarkdownFenceAtLine(line, escapedFence)) {
      if (nl === -1) break;
      pos = nl + 1;
      continue;
    }

    if (escapedFence.inEscapedFence) {
      if (nl === -1) break;
      pos = nl + 1;
      continue;
    }

    if (blockStart < 0) {
      const open = line.match(/^ {0,3}(`{3,}|~{3,})(?:[ \t]+[^\n]*)?$/);
      if (open) {
        const fence = open[1]!;
        fenceChar = fence[0] === '`' ? '`' : '~';
        minCloseLen = fence.length;
        blockStart = pos;
      }
    } else {
      const ok =
        fenceChar === '`'
          ? new RegExp(`^ {0,3}\`{${minCloseLen},}\\s*$`).test(line)
          : new RegExp(`^ {0,3}~{${minCloseLen},}\\s*$`).test(line);
      if (ok) {
        const blockEnd = nl === -1 ? content.length : nl + 1;
        ranges.push([blockStart, blockEnd]);
        blockStart = -1;
      }
    }

    if (nl === -1) break;
    pos = nl + 1;
  }
  if (blockStart >= 0) {
    ranges.push([blockStart, content.length]);
  }
  return ranges;
}

function lineOverlapsRange(
  lineStart: number,
  lineEnd: number,
  ranges: readonly [number, number][],
): boolean {
  return ranges.some(([a, b]) => lineStart < b && a < lineEnd);
}

function headingClassForDepth(depth: number): string {
  const d = Math.min(6, Math.max(1, depth));
  return `composer-md-h${d}`;
}

/**
 * compact: delimiters stay in the string but get muted; inner spans get semantic styling.
 * Mirrors much of split/full markdown preview (GFM + Echo extras): headings, lists, blockquotes,
 * fenced code, tables, links, highlights, footnote refs, and inline emphasis.
 * Skips regions covered by mentions and already-styled spans.
 */
export function findComposerMarkdownStyleRanges(
  content: string,
  mentionSpans: readonly { start: number; end: number }[],
): StyleSeg[] {
  const segs: StyleSeg[] = [];
  const occupied: [number, number][] = mentionSpans.map((m) => [
    m.start,
    m.end,
  ]);
  let mergedOccupied = mergeBlocks(occupied);

  const isFree = (s: number, e: number) => !overlapsAny(s, e, mergedOccupied);

  const occupy = (s: number, e: number) => {
    occupied.push([s, e]);
    mergedOccupied = mergeBlocks(occupied);
  };

  const fenceRanges = findFencedCodeBlockRanges(content);
  for (const [fs, fe] of fenceRanges) {
    if (!isFree(fs, fe)) continue;
    segs.push({ start: fs, end: fe, class: 'composer-md-code-block' });
    occupy(fs, fe);
  }

  for (const r of findRawDiscordSpoilerRegions(content)) {
    if (!isFree(r.start, r.end)) continue;
    segs.push({ start: r.start, end: r.start + 2, class: 'composer-md-delim' });
    segs.push({
      start: r.start + 2,
      end: r.end - 2,
      class: 'composer-md-spoiler',
    });
    segs.push({ start: r.end - 2, end: r.end, class: 'composer-md-delim' });
    occupy(r.start, r.end);
  }

  let lineStart = 0;
  while (lineStart <= content.length) {
    const nl = content.indexOf('\n', lineStart);
    const lineEnd = nl === -1 ? content.length : nl;
    const line = content.slice(lineStart, lineEnd);

    if (
      line.length > 0 &&
      !lineOverlapsRange(lineStart, lineEnd, fenceRanges)
    ) {
      if (HR_LINE_RE.test(line) && isFree(lineStart, lineEnd)) {
        segs.push({ start: lineStart, end: lineEnd, class: 'composer-md-hr' });
        occupy(lineStart, lineEnd);
      } else {
        const hm = line.match(ATX_HEADING_RE);
        if (hm && hm[1] && hm[2]) {
          const hashes = hm[1];
          const afterHash = hm[2];
          let titleRaw = hm[3] ?? '';
          titleRaw = titleRaw.replace(/\s+$/, '');
          titleRaw = titleRaw.replace(/\s+#+\s*$/, '');
          const leadLen = line.match(/^ {0,3}/)?.[0].length ?? 0;
          const hashStart = lineStart + leadLen;
          const delimEnd = hashStart + hashes.length + afterHash.length;
          const titleStart = delimEnd;
          const titleEnd = titleStart + titleRaw.length;
          if (
            titleRaw.length > 0 &&
            isFree(hashStart, titleEnd) &&
            titleEnd <= lineEnd
          ) {
            segs.push({
              start: hashStart,
              end: delimEnd,
              class: 'composer-md-delim',
            });
            segs.push({
              start: titleStart,
              end: titleEnd,
              class: headingClassForDepth(hashes.length),
            });
            occupy(hashStart, titleEnd);
          }
        } else {
          const bm = line.match(BLOCKQUOTE_PREFIX_RE);
          if (bm && bm[1] && bm[1].includes('>')) {
            const prefix = bm[1];
            const rest = bm[2] ?? '';
            const leadLen = line.match(/^ {0,3}/)?.[0].length ?? 0;
            const pStart = lineStart + leadLen;
            const pEnd = pStart + prefix.length;
            const rStart = pEnd;
            const rEnd = rStart + rest.length;
            if (isFree(pStart, pEnd)) {
              segs.push({
                start: pStart,
                end: pEnd,
                class: 'composer-md-delim',
              });
              if (rest.length > 0 && isFree(rStart, rEnd)) {
                segs.push({
                  start: rStart,
                  end: rEnd,
                  class: 'composer-md-blockquote',
                });
              }
              occupy(pStart, pEnd);
            }
          } else {
            const tm = line.match(UL_TASK_RE);
            if (tm) {
              const indent = tm[1] ?? '';
              const bullet = tm[2] ?? '';
              const spAfterBullet = tm[3] ?? '';
              const spAfterBox = tm[5] ?? '';
              const body = tm[6] ?? '';
              const bulletStart = lineStart + indent.length;
              const afterBullet =
                bulletStart + bullet.length + spAfterBullet.length;
              const boxStart = afterBullet;
              const boxEnd = afterBullet + 3;
              const bodyStart = boxEnd + spAfterBox.length;
              const bodyEnd = bodyStart + body.length;
              const markerEnd = bodyStart;
              if (isFree(bulletStart, markerEnd)) {
                segs.push({
                  start: bulletStart,
                  end: afterBullet,
                  class: 'composer-md-delim',
                });
                segs.push({
                  start: boxStart,
                  end: boxEnd,
                  class: 'composer-md-delim',
                });
                if (body.length > 0 && isFree(bodyStart, bodyEnd)) {
                  segs.push({
                    start: bodyStart,
                    end: bodyEnd,
                    class: 'composer-md-list-content',
                  });
                }
                occupy(bulletStart, markerEnd);
              }
            } else {
              const um = line.match(UL_RE);
              if (um && !HR_LINE_RE.test(line.trim())) {
                const indent = um[1] ?? '';
                const bullet = um[2] ?? '';
                const sp = um[3] ?? '';
                const body = um[4] ?? '';
                const bulletStart = lineStart + indent.length;
                const markEnd = bulletStart + bullet.length + sp.length;
                const bodyStart = markEnd;
                const bodyEnd = bodyStart + body.length;
                if (isFree(bulletStart, markEnd)) {
                  segs.push({
                    start: bulletStart,
                    end: markEnd,
                    class: 'composer-md-delim',
                  });
                  if (body.length > 0 && isFree(bodyStart, bodyEnd)) {
                    segs.push({
                      start: bodyStart,
                      end: bodyEnd,
                      class: 'composer-md-list-content',
                    });
                  }
                  occupy(bulletStart, markEnd);
                }
              } else {
                const om = line.match(OL_RE);
                if (om) {
                  const indent = om[1] ?? '';
                  const num = om[2] ?? '';
                  const sp = om[3] ?? '';
                  const body = om[4] ?? '';
                  const markStart = lineStart + indent.length;
                  const markEnd = markStart + num.length + sp.length;
                  const bodyStart = markEnd;
                  const bodyEnd = bodyStart + body.length;
                  if (isFree(markStart, markEnd)) {
                    segs.push({
                      start: markStart,
                      end: markEnd,
                      class: 'composer-md-delim',
                    });
                    if (body.length > 0 && isFree(bodyStart, bodyEnd)) {
                      segs.push({
                        start: bodyStart,
                        end: bodyEnd,
                        class: 'composer-md-list-content',
                      });
                    }
                    occupy(markStart, markEnd);
                  }
                } else if (
                  TABLE_ROW_RE.test(line) &&
                  (line.match(/\|/g) ?? []).length >= 2
                ) {
                  for (let c = lineStart; c < lineEnd; c++) {
                    if (content[c] === '|' && isFree(c, c + 1)) {
                      segs.push({
                        start: c,
                        end: c + 1,
                        class: 'composer-md-delim',
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    if (nl === -1) break;
    lineStart = nl + 1;
  }

  let cm: RegExpExecArray | null;

  /* --- inline code: `...` --- */
  const codeRe = /`([^`\n]+)`/g;
  while ((cm = codeRe.exec(content))) {
    const s = cm.index;
    const e = s + cm[0].length;
    if (!isFree(s, e)) continue;
    segs.push({ start: s, end: s + 1, class: 'composer-md-delim' });
    segs.push({ start: s + 1, end: e - 1, class: 'composer-md-code' });
    segs.push({ start: e - 1, end: e, class: 'composer-md-delim' });
    occupy(s, e);
  }

  /* --- images ![alt](url) --- */
  const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
  while ((cm = imgRe.exec(content))) {
    const s = cm.index;
    const e = s + cm[0].length;
    if (!isFree(s, e)) continue;
    const innerStart = s + 2;
    const innerEnd = innerStart + cm[1]!.length;
    const parenOpen = content.indexOf('(', innerEnd);
    const parenClose = e - 1;
    segs.push({ start: s, end: s + 2, class: 'composer-md-delim' });
    segs.push({
      start: innerStart,
      end: innerEnd,
      class: 'composer-md-link-text',
    });
    segs.push({
      start: innerEnd,
      end: parenOpen + 1,
      class: 'composer-md-delim',
    });
    segs.push({
      start: parenOpen + 1,
      end: parenClose,
      class: 'composer-md-link-url',
    });
    segs.push({ start: parenClose, end: e, class: 'composer-md-delim' });
    occupy(s, e);
  }

  /* --- links [text](url) --- */
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((cm = linkRe.exec(content))) {
    const s = cm.index;
    if (s > 0 && content[s - 1] === '!') continue;
    const e = s + cm[0].length;
    if (!isFree(s, e)) continue;
    const innerStart = s + 1;
    const innerEnd = innerStart + cm[1]!.length;
    const parenOpen = content.indexOf('(', innerEnd);
    const parenClose = e - 1;
    segs.push({ start: s, end: s + 1, class: 'composer-md-delim' });
    segs.push({
      start: innerStart,
      end: innerEnd,
      class: 'composer-md-link-text',
    });
    segs.push({
      start: innerEnd,
      end: parenOpen + 1,
      class: 'composer-md-delim',
    });
    segs.push({
      start: parenOpen + 1,
      end: parenClose,
      class: 'composer-md-link-url',
    });
    segs.push({ start: parenClose, end: e, class: 'composer-md-delim' });
    occupy(s, e);
  }

  /* --- footnote ref [^label] --- */
  const fnRe = /\[\^([^\]\s]+)\]/g;
  while ((cm = fnRe.exec(content))) {
    const s = cm.index;
    const e = s + cm[0].length;
    if (!isFree(s, e)) continue;
    segs.push({ start: s, end: s + 2, class: 'composer-md-delim' });
    segs.push({ start: s + 2, end: e - 1, class: 'composer-md-footnote-ref' });
    segs.push({ start: e - 1, end: e, class: 'composer-md-delim' });
    occupy(s, e);
  }

  /* --- autolink <http...> --- */
  const autoRe = /<((?:https?:\/\/|mailto:)[^>\s]+)>/gi;
  while ((cm = autoRe.exec(content))) {
    const s = cm.index;
    const e = s + cm[0].length;
    if (!isFree(s, e)) continue;
    segs.push({ start: s, end: s + 1, class: 'composer-md-delim' });
    segs.push({ start: s + 1, end: e - 1, class: 'composer-md-link-url' });
    segs.push({ start: e - 1, end: e, class: 'composer-md-delim' });
    occupy(s, e);
  }

  /* --- highlight ==...== (Echo / parseMessageContent preprocessor) --- */
  const hiRe = /==([^=\n]+?)==/g;
  while ((cm = hiRe.exec(content))) {
    const s = cm.index;
    const e = s + cm[0].length;
    if (!isFree(s, e)) continue;
    segs.push({ start: s, end: s + 2, class: 'composer-md-delim' });
    segs.push({ start: s + 2, end: e - 2, class: 'composer-md-highlight' });
    segs.push({ start: e - 2, end: e, class: 'composer-md-delim' });
    occupy(s, e);
  }

  /* --- bold **...** --- */
  const boldRe = /\*\*([^*\n]+?)\*\*/g;
  while ((cm = boldRe.exec(content))) {
    const s = cm.index;
    const e = s + cm[0].length;
    if (!isFree(s, e)) continue;
    segs.push({ start: s, end: s + 2, class: 'composer-md-delim' });
    segs.push({ start: s + 2, end: e - 2, class: 'composer-md-bold' });
    segs.push({ start: e - 2, end: e, class: 'composer-md-delim' });
    occupy(s, e);
  }

  /* --- underline __...__ (Discord; GFM uses ** for bold) --- */
  const underlineRe = /__([^_\n]+?)__/g;
  while ((cm = underlineRe.exec(content))) {
    const s = cm.index;
    const e = s + cm[0].length;
    if (!isFree(s, e)) continue;
    segs.push({ start: s, end: s + 2, class: 'composer-md-delim' });
    segs.push({ start: s + 2, end: e - 2, class: 'composer-md-underline' });
    segs.push({ start: e - 2, end: e, class: 'composer-md-delim' });
    occupy(s, e);
  }

  /* --- strike ~~...~~ --- */
  const strikeRe = /~~([^~\n]+?)~~/g;
  while ((cm = strikeRe.exec(content))) {
    const s = cm.index;
    const e = s + cm[0].length;
    if (!isFree(s, e)) continue;
    segs.push({ start: s, end: s + 2, class: 'composer-md-delim' });
    segs.push({ start: s + 2, end: e - 2, class: 'composer-md-strike' });
    segs.push({ start: e - 2, end: e, class: 'composer-md-delim' });
    occupy(s, e);
  }

  /* --- italic *...* (not part of **) --- */
  const italicRe = /\*([^*\n]+?)\*/g;
  while ((cm = italicRe.exec(content))) {
    const s = cm.index;
    const e = s + cm[0].length;
    if (content[s + 1] === '*') continue;
    if (!isFree(s, e)) continue;
    segs.push({ start: s, end: s + 1, class: 'composer-md-delim' });
    segs.push({ start: s + 1, end: e - 1, class: 'composer-md-italic' });
    segs.push({ start: e - 1, end: e, class: 'composer-md-delim' });
    occupy(s, e);
  }

  /* --- italic _..._ (not __) --- */
  const underRe = /_([^_\n]+?)_/g;
  while ((cm = underRe.exec(content))) {
    const s = cm.index;
    const e = s + cm[0].length;
    if (content[s - 1] === '_') continue;
    if (content[e] === '_') continue;
    if (!isFree(s, e)) continue;
    segs.push({ start: s, end: s + 1, class: 'composer-md-delim' });
    segs.push({ start: s + 1, end: e - 1, class: 'composer-md-italic' });
    segs.push({ start: e - 1, end: e, class: 'composer-md-delim' });
    occupy(s, e);
  }

  return segs;
}

function buildDecorationSet(doc: PMNode): DecorationSet {
  const { content, mentions } = serializeComposerDoc(doc);
  if (!content) return DecorationSet.empty;
  if (!mightHaveMarkdownSyntax(content) && mentions.length === 0) {
    return DecorationSet.empty;
  }

  const segs = findComposerMarkdownStyleRanges(
    content,
    mentions.map((m) => ({ start: m.start, end: m.end })),
  );

  const decos: Decoration[] = [];
  for (const seg of segs) {
    if (seg.start >= seg.end) continue;
    const from = rawOffsetToEditorPos(doc, seg.start);
    const to = rawOffsetToEditorPos(doc, seg.end);
    if (from >= to) continue;
    decos.push(Decoration.inline(from, to, { class: seg.class }));
  }

  return DecorationSet.create(doc, decos);
}

interface DecoPluginState {
  enabled: boolean;
  decos: DecorationSet;
}

function createComposerMarkdownDecorationPlugin() {
  return new Plugin<DecoPluginState>({
    key: composerMarkdownDecoKey,
    state: {
      init(): DecoPluginState {
        return { enabled: false, decos: DecorationSet.empty };
      },
      apply(tr, pluginState): DecoPluginState {
        const meta = tr.getMeta(composerMarkdownDecoKey) as
          | { enabled?: boolean }
          | undefined;
        let enabled = pluginState.enabled;
        if (meta && typeof meta.enabled === 'boolean') {
          enabled = meta.enabled;
        }

        if (!enabled) {
          return { enabled: false, decos: DecorationSet.empty };
        }

        const shouldRebuild =
          tr.docChanged || (meta && typeof meta.enabled === 'boolean');
        if (!shouldRebuild) {
          return pluginState;
        }

        return {
          enabled: true,
          decos: buildDecorationSet(tr.doc),
        };
      },
    },
    props: {
      decorations(state) {
        const st = composerMarkdownDecoKey.getState(state) as
          | DecoPluginState
          | undefined;
        return st?.decos ?? DecorationSet.empty;
      },
    },
  });
}

export const ComposerMarkdownDecorations = Extension.create({
  name: 'composerMarkdownDecorations',
  addProseMirrorPlugins() {
    return [createComposerMarkdownDecorationPlugin()];
  },
});
