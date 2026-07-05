/* @vitest-environment happy-dom */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ensureKatexReady,
  hasMarkdownSyntax,
  parseMessageContent,
  markdownMentionPassTestOnly,
} from './useMarkdown';

describe('useMarkdown with KaTeX', () => {
  beforeAll(async () => {
    await ensureKatexReady();
  });
  it('renders inline and display latex', () => {
    const inline = parseMessageContent('Math: \\(a+b\\) and $c+d$');
    const display = parseMessageContent('$$x^2+y^2$$');
    expect(inline).toContain('class="katex"');
    expect(
      (inline.match(/class="katex"/g) || []).length,
    ).toBeGreaterThanOrEqual(2);
    expect(display).toContain('katex-display');
  });

  it('renders numeric-only inline dollar math ($5$)', () => {
    const out = parseMessageContent('Value $5$.');
    expect(out).toContain('class="katex"');
    expect(out).not.toContain('katex-error');
  });

  it('preserves KaTeX inline style attributes after sanitize (layout)', () => {
    const out = parseMessageContent('\\(\\frac{1}{2}\\)');
    expect(out).toContain('class="katex"');
    expect(out).toMatch(/style="/);
  });

  it('renders inline integrals with limits above and below the integral sign', () => {
    const out = parseMessageContent(
      String.raw`$\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}$`,
    );
    expect(out).toContain('class="katex"');
    expect(out).not.toContain('katex-error');
    expect(out).toContain('large-op');
    expect(out).not.toContain('small-op');
  });

  it('keeps inline code delimiters literal', () => {
    const out = parseMessageContent('`\\(x\\)` and `$$y$$`');
    expect(out).toContain('\\(x\\)');
    expect(out).toContain('$$y$$');
    expect(out).not.toContain('katex-display');
  });

  it('keeps markdown mention/channel passes functional with latex', () => {
    const out = parseMessageContent('Ping #general and \\(x\\)', [
      {
        id: 'm1',
        kind: 'channel',
        label: 'general',
        start: 5,
        end: 13,
        channelId: 'c1',
      },
    ]);
    expect(out).toContain('mention--channel');
    expect(out).toContain('class="katex"');
  });

  it('sanitizes dangerous attributes in rendered output', () => {
    const out = parseMessageContent('[x](javascript:alert(1)) and \\(a+b\\)');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('class="katex"');
  });

  it('detects latex delimiters as markdown syntax trigger', () => {
    expect(hasMarkdownSyntax('\\(x\\)')).toBe(true);
    expect(hasMarkdownSyntax('$x$')).toBe(true);
    expect(hasMarkdownSyntax('$$x$$')).toBe(true);
    expect(hasMarkdownSyntax('\\[x\\]')).toBe(true);
    expect(hasMarkdownSyntax('Costs $5 today')).toBe(false);
  });

  it('does not twemoji-mutate inside katex subtree', () => {
    const html = '<p><span class="katex">🙂</span> outside 🙂</p>';
    const out = markdownMentionPassTestOnly.applyTwemojiOutsideKatex(html);
    expect(out).toContain('<span class="katex">🙂</span>');
    expect(out).toContain('<img');
  });

  it('keeps KaTeX inline SVG for \\\\middle| (tall set-builder bar) after sanitize', () => {
    const tex = String.raw`$$\mathcal{P}_{i} = \left\{ \bigcap_{s=1}^{m-1} T_{s,\sigma_{s}}(t) \;\middle|\; t \in T \right\}.$$`;
    const out = parseMessageContent(tex);
    expect(out).toContain('katex-display');
    expect(out).not.toContain('katex-error');
    expect(out).toMatch(/<svg[\s\S]*<path\b[^>]*\bd="/);
  });

  it('renders pasted matrix row separators as multiple rows (not one wide row)', () => {
    const raw = String.raw`$$\begin{matrix} a & b \ \ c & d \end{matrix}$$`;
    const out = parseMessageContent(raw);
    expect(out).toContain('katex-display');
    expect(out).not.toContain('katex-error');
    const mtr = (out.match(/<mtr>/g) || []).length;
    const hasMatrixTableMarkup = /class="[^"]*\bmtable\b/.test(out);
    expect(mtr >= 2 || hasMatrixTableMarkup).toBe(true);
  });

  it('renders bare matrix environments without explicit $$ delimiters', () => {
    const raw = String.raw`\begin{matrix}
\text{Subgroup} & \text{Type} \\
eg & \mathbb{Z}_2
\end{matrix}`;
    const out = parseMessageContent(raw);
    expect(out).toContain('katex-display');
    expect(out).not.toContain('katex-error');
  });

  it('normalizes common LaTeX typos before KaTeX (display)', () => {
    const inv =
      '$$I_{\\mathcal{D}i} := \\mathbb{S}^{\\mathbf{V}{i}} := {r \\in \\mathbb{S} \\mid \\varphi(v)(r) = r, \\ \\forall v \\in \\mathbf{V}_{i}}.$$';
    const outInv = parseMessageContent(inv);
    expect(outInv).toContain('katex-display');
    expect(outInv).not.toContain('katex-error');

    const z =
      '$$Z{\\text{univ}} := \\langle e, g \\rangle \\cong \\mathbb{Z}{2}.$$';
    const outZ = parseMessageContent(z);
    expect(outZ).toContain('katex-display');
    expect(outZ).not.toContain('katex-error');
  });

  it('renders common non-math latex text commands safely', () => {
    const out = parseMessageContent(String.raw`\subsection{Important Groups}
\textbf{Axiom.} Text with \textit{emphasis}, \emph{more emphasis}, and $D_4$.`);
    expect(out).toContain('<h2');
    expect(out).toContain('<strong>Axiom.</strong>');
    expect(out).toContain('<em>emphasis</em>');
    expect(out).toContain('class="katex"');
  });

  it('renders simple tabular environments as safe html tables', () => {
    const out = parseMessageContent(String.raw`\begin{center}
\begin{tabular}{c c c}
Subgroup & Type & Quotient \\
$eg$ & $\mathbb{Z}_2$ & $D_4$ \\
\end{tabular}
\end{center}`);
    expect(out).toContain('<table>');
    expect(out).toContain('<thead>');
    expect(out).toContain('<tbody>');
    expect(out).toContain('katex');
    expect(out).toContain('md-latex-center');
  });

  it('parses markdown after \\end{tabular} (marked needs a blank line after raw HTML blocks)', () => {
    const out = parseMessageContent(String.raw`\begin{tabular}{c}
a
\end{tabular}
**after table**`);
    expect(out).toContain('<table>');
    expect(out).toContain('<strong>after table</strong>');
    expect(out).not.toMatch(/\*\*after table\*\*/);
  });
});
