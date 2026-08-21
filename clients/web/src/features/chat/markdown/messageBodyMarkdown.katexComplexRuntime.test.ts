/* @vitest-environment jsdom */
/**
 * Complex KaTeX runtime verification — stacked scripts, fraction clipping,
 * tall radicals, matrices, nested fractions, delimiters, and display overflow.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ensureKatexReady,
  parseMessageContent,
} from '@/features/chat/markdown/useMarkdown';

function injectStylesheet(css: string, id: string) {
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.className = 'message-text message-content';
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

function distinctVlistTops(html: string): number {
  return new Set([...html.matchAll(/top:\s*(-?[\d.]+)em/g)].map((m) => m[1]!))
    .size;
}

function msupsubCount(html: string): number {
  return (html.match(/class="msupsub"/g) || []).length;
}

/** Complex expressions covering common layout failure modes. */
const COMPLEX_CASES = {
  simultaneousSubSup: [
    ['V^{15}_{(5)}', 'inline'],
    ['x_i^2', 'inline'],
    ['a_{n}^{m+1}', 'inline'],
    ['\\sum_{i=1}^{n} x_i^2', 'display'],
    ['\\int_{0}^{\\infty} e^{-x^2}\\,dx', 'display'],
    ['{}_1^2H + {}_6^{12}C', 'inline'],
    ['\\mathbf{A}^{\\mathsf T}_{ij}', 'inline'],
  ],
  fractions: [
    ['\\frac{1}{2}', 'inline'],
    ['\\dfrac{x+1}{x-1}', 'inline'],
    ['\\frac{\\frac{a}{b}}{\\frac{c}{d}}', 'inline'],
    ['\\frac{\\sum_{k=1}^{n} k^2}{\\sqrt{n^3 + 1}}', 'display'],
    ['\\frac{\\partial^2 f}{\\partial x \\partial y}', 'display'],
    ['\\binom{n}{k}', 'inline'],
    ['\\tfrac{1}{2}+\\tfrac{3}{4}', 'inline'],
  ],
  tallGlyphs: [
    ['\\sqrt{\\frac{x^2 + y^2}{z^2}}', 'inline'],
    ['\\sqrt[3]{\\sum_{i=1}^{n} a_i^2}', 'inline'],
    ['\\left(\\frac{a}{b}\\right)^{n}', 'inline'],
    ['\\displaystyle \\sum_{i=1}^{n} \\frac{1}{i^2}', 'display'],
    ['\\displaystyle \\prod_{p\\text{ prime}} \\frac{1}{1-p^{-s}}', 'display'],
    ['\\lim_{x \\to 0} \\frac{\\sin x}{x}', 'display'],
  ],
  matrices: [
    [
      String.raw`\begin{pmatrix} a & b & c \\ d & e & f \\ g & h & i \end{pmatrix}`,
      'display',
    ],
    [String.raw`\begin{bmatrix} 1 & 0 \\ 0 & 1 \end{bmatrix}`, 'display'],
    [
      String.raw`\begin{vmatrix} x & y \\ z & w \end{vmatrix} = xw - yz`,
      'display',
    ],
    [
      String.raw`\begin{cases} x & \text{if } x \ge 0 \\ -x & \text{if } x < 0 \end{cases}`,
      'display',
    ],
  ],
  delimiters: [
    [
      String.raw`\mathcal{P}_{i} = \left\{ \bigcap_{s=1}^{m-1} T_{s,\sigma_{s}}(t) \;\middle|\; t \in T \right\}`,
      'display',
    ],
    [String.raw`\left\langle \frac{a}{b} \right\rangle`, 'display'],
    [String.raw`\left\| \sum_{i=1}^{n} v_i \right\|_2`, 'display'],
    [String.raw`\left[\frac{n}{k}\right]`, 'inline'],
  ],
  longHorizontal: [
    [
      String.raw`P(x) = a_0 + a_1 x + a_2 x^2 + a_3 x^3 + a_4 x^4 + a_5 x^5 + a_6 x^6 + a_7 x^7 + a_8 x^8 + a_9 x^9 + a_{10} x^{10}`,
      'display',
    ],
    [
      String.raw`\frac{\partial^{12} f}{\partial x^4 \partial y^4 \partial z^4} = \sum_{i,j,k} c_{ijk} x^i y^j z^k`,
      'display',
    ],
  ],
  accents: [
    ['\\hat{x}_i^2', 'inline'],
    ['\\vec{v}_{ij}^{\\mathsf T}', 'inline'],
    ['\\overline{AB}_{n}^{m}', 'inline'],
    ['\\widetilde{XYZ}_{abc}^{def}', 'inline'],
  ],
} as const;

function wrapInput(latex: string, mode: string): string {
  if (mode === 'display') return `$$${latex}$$`;
  return `$${latex}$`;
}

describe('KaTeX complex runtime — stacked scripts, clipping, tall math', () => {
  beforeAll(async () => {
    const katexCssCandidates = [
      path.resolve(
        process.cwd(),
        '../../node_modules/katex/dist/katex.min.css',
      ),
      path.resolve(process.cwd(), '../node_modules/katex/dist/katex.min.css'),
      path.resolve(process.cwd(), 'node_modules/katex/dist/katex.min.css'),
    ];
    const katexCssPath = katexCssCandidates.find((p) => fs.existsSync(p));
    if (!katexCssPath) {
      throw new Error(
        `katex.min.css not found (tried: ${katexCssCandidates.join(', ')})`,
      );
    }
    const katexCss = fs.readFileSync(katexCssPath, 'utf8');
    injectStylesheet(katexCss, 'katex-complex-runtime-css');
    injectStylesheet(
      `
.message-content .katex { padding: 0.14em 0.08em 0.22em; box-sizing: content-box; }
  .message-content .katex-display { display: block; max-width: 100%; overflow: hidden; margin: 0.35em 0; }
.message-content .katex-display > .katex {
  display: block; max-width: 100%; padding: 0.5em 0.25em 0.65em;
  overflow-x: auto; overflow-y: hidden;
}
.message-text { overflow: visible; overflow-wrap: break-word; word-break: break-word; }
`,
      'katex-complex-app-css',
    );
    await ensureKatexReady();
  });

  describe('simultaneous sub+sup — no stacked glyphs', () => {
    it.each(COMPLEX_CASES.simultaneousSubSup)('%s', (latex, mode) => {
      const out = parseMessageContent(wrapInput(latex, mode));
      expect(out).toContain('class="katex"');
      expect(out).not.toContain('katex-error');
      if (out.includes('msupsub')) {
        expect(msupsubCount(out)).toBeGreaterThan(0);
        expect(distinctVlistTops(out)).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('fractions — layout styles preserved, not clipped', () => {
    it.each(COMPLEX_CASES.fractions)('%s', (latex, mode) => {
      const out = parseMessageContent(wrapInput(latex, mode));
      expect(out).toContain('class="katex"');
      expect(out).not.toContain('katex-error');
      expect(out).toMatch(/style="/i);
      expect(out).toMatch(/class="[^"]*\bmfrac\b|class="[^"]*\bfrac-line\b/);

      const root = mount(out);
      const katex = root.querySelector('.katex') as HTMLElement;
      const msg = root.closest('.message-text') ?? root;
      expect(katex).toBeTruthy();
      expect(getComputedStyle(msg).overflow).toBe('visible');
      if (mode === 'display') {
        const inner = root.querySelector(
          '.katex-display > .katex',
        ) as HTMLElement;
        expect(inner).toBeTruthy();
        expect(getComputedStyle(inner).overflowY).toBe('hidden');
        const pad = getComputedStyle(inner).paddingTop;
        expect(parseFloat(pad)).toBeGreaterThan(0);
      }
      root.remove();
    });
  });

  describe('tall glyphs — radicals, sums, limits', () => {
    it.each(COMPLEX_CASES.tallGlyphs)('%s', (latex, mode) => {
      const out = parseMessageContent(wrapInput(latex, mode));
      expect(out).toContain('class="katex"');
      expect(out).not.toContain('katex-error');
      expect(out).toMatch(/style="/i);

      const root = mount(out);
      const struts = root.querySelectorAll('.strut');
      expect(struts.length).toBeGreaterThan(0);
      const vlist = root.querySelector('.vlist-t, .vlist');
      if (vlist) {
        expect(getComputedStyle(vlist as HTMLElement).display).not.toBe(
          'inline',
        );
      }
      root.remove();
    });
  });

  describe('matrices and cases — multi-row, not one collapsed line', () => {
    it.each(COMPLEX_CASES.matrices)('%s', (latex, _mode) => {
      const out = parseMessageContent(wrapInput(latex, 'display'));
      expect(out).toContain('katex-display');
      expect(out).not.toContain('katex-error');
      const mtr = (out.match(/<mtr>/g) || []).length;
      const hasMatrixTable = /class="[^"]*\bmtable\b/.test(out);
      expect(mtr >= 2 || hasMatrixTable).toBe(true);
    });
  });

  describe('stretchy delimiters — SVG or delim spans survive sanitize', () => {
    it.each(COMPLEX_CASES.delimiters)('%s', (latex, mode) => {
      const out = parseMessageContent(wrapInput(latex, mode));
      expect(out).toContain('class="katex"');
      expect(out).not.toContain('katex-error');
      const hasSvg = /<svg[\s\S]*<path\b/i.test(out);
      const hasDelim =
        /class="[^"]*\bdelimcenter\b/.test(out) ||
        /class="[^"]*\bmopen\b/.test(out);
      expect(hasSvg || hasDelim).toBe(true);
    });
  });

  describe('long display math — horizontal scroller, wrapper clips vertical bleed', () => {
    it.each(COMPLEX_CASES.longHorizontal)('%s', (latex, mode) => {
      const out = parseMessageContent(wrapInput(latex, mode));
      expect(out).toContain('katex-display');
      expect(out).not.toContain('katex-error');

      const root = mount(out);
      const wrap = root.querySelector('.katex-display') as HTMLElement;
      const inner = root.querySelector(
        '.katex-display > .katex',
      ) as HTMLElement;
      expect(wrap).toBeTruthy();
      expect(inner).toBeTruthy();
      expect(getComputedStyle(wrap).overflow).toBe('hidden');
      expect(getComputedStyle(inner).overflowX).toBe('auto');
      expect(getComputedStyle(inner).overflowY).toBe('hidden');
      root.remove();
    });
  });

  describe('accents with scripts — distinct offsets', () => {
    it.each(COMPLEX_CASES.accents)('%s', (latex, mode) => {
      const out = parseMessageContent(wrapInput(latex, mode));
      expect(out).toContain('class="katex"');
      expect(out).not.toContain('katex-error');
      if (out.includes('msupsub')) {
        expect(distinctVlistTops(out)).toBeGreaterThanOrEqual(2);
      }
    });
  });

  it('kitchen-sink display block combines fractions, scripts, sums, and matrices', () => {
    const tex = String.raw`
$$\begin{aligned}
\frac{\partial}{\partial t}\rho + \nabla\cdot(\rho\mathbf{v}) &= 0 \\
\int_V \nabla\cdot\mathbf{F}\,dV &= \oint_{\partial V}\mathbf{F}\cdot d\mathbf{S} \\
\mathbf{A}_{ij}^{k} &= \sum_{m=1}^{n} B_{im}^{k} C_{mj} + \epsilon_{ij}^{(k)} \\
\begin{pmatrix} \lambda_1 & 0 \\ 0 & \lambda_2 \end{pmatrix} &= Q^T A Q
\end{aligned}$$
`;
    const out = parseMessageContent(tex);
    expect(out).toContain('katex-display');
    expect(out).not.toContain('katex-error');
    expect(msupsubCount(out)).toBeGreaterThan(0);
    expect(distinctVlistTops(out)).toBeGreaterThanOrEqual(2);
    expect(out).toMatch(/class="[^"]*\bmfrac\b|class="[^"]*\bfrac-line\b/);
    expect((out.match(/<mtr>/g) || []).length).toBeGreaterThanOrEqual(2);

    const root = mount(out);
    const inner = root.querySelector('.katex-display > .katex') as HTMLElement;
    expect(getComputedStyle(inner).overflowX).toBe('auto');
    expect(getComputedStyle(inner).overflowY).toBe('hidden');
    root.remove();
  });
});
