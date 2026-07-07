import { describe, expect, it } from 'vitest';
import {
  ensureDisplayStyleForOperatorLimits,
  normalizeKatexDisplaySpacing,
  normalizeKatexInput,
} from './normalizeKatexInput';

describe('normalizeKatexInput', () => {
  it('normalizes the invariant-set formula (golden)', () => {
    const raw =
      'I_{\\mathcal{D}i} := \\mathbb{S}^{\\mathbf{V}{i}} := {r \\in \\mathbb{S} \\mid \\varphi(v)(r) = r, \\ \\forall v \\in \\mathbf{V}_{i}}.';
    const want =
      'I_{\\mathcal{D}_i} := \\mathbb{S}^{\\mathbf{V}_i} := \\{r \\in \\mathbb{S} \\mid \\varphi(v)(r) = r, \\ \\forall v \\in \\mathbf{V}_{i}\\}.';
    expect(normalizeKatexInput(raw)).toBe(want);
  });

  it('normalizes the Z_univ / Z_2 formula (golden)', () => {
    const raw =
      'Z{\\text{univ}} := \\langle e, g \\rangle \\cong \\mathbb{Z}{2}.';
    const want =
      'Z_{\\text{univ}} := \\langle e, g \\rangle \\cong \\mathbb{Z}_{2}.';
    expect(normalizeKatexInput(raw)).toBe(want);
  });

  it('leaves \\mathbb{Z} alone when not followed by digit bracing', () => {
    const s = '\\mathbb{Z} \\oplus \\mathbb{Z}';
    expect(normalizeKatexInput(s)).toBe(s);
  });

  it('does not rewrite arbitrary := { without the set-builder prefix', () => {
    const s = 'x := {1,2}';
    expect(normalizeKatexInput(s)).toBe(s);
  });

  it('leaves already-correct set braces unchanged', () => {
    const s =
      'I_{\\mathcal{D}_i} := \\mathbb{S}^{\\mathbf{V}_i} := \\{r \\in \\mathbb{S} \\mid x\\}.';
    expect(normalizeKatexInput(s)).toBe(s);
  });

  it('maps multi-digit \\mathbb{Z}{n} to subscript with braces', () => {
    expect(normalizeKatexInput('\\mathbb{Z}{10}')).toBe('\\mathbb{Z}_{10}');
  });

  it('repairs pasted \\left{ and \\right} when the closing brace is not escaped', () => {
    const raw = String.raw`\left{ a \middle| b \right}.`;
    const want = String.raw`\left\{ a \middle| b \right\}.`;
    expect(normalizeKatexInput(raw)).toBe(want);
  });

  it('fixes mistaken \\ + space pairs into matrix row breaks (\\\\) inside matrix', () => {
    const raw = String.raw`\begin{matrix} a & b \ \ c & d \end{matrix}`;
    const want = String.raw`\begin{matrix} a & b\\c & d \end{matrix}`;
    expect(normalizeKatexInput(raw)).toBe(want);
  });

  it('does not rewrite \\ + space + \\forall outside matrix-like environments', () => {
    const s = 'r, \\ \\forall v';
    expect(normalizeKatexInput(s)).toBe(s);
  });

  it('fixes row breaks inside array environment bodies', () => {
    const raw = String.raw`\begin{array}{cc} 1 & 2 \ \ 3 & 4 \end{array}`;
    const want = String.raw`\begin{array}{cc} 1 & 2\\3 & 4 \end{array}`;
    expect(normalizeKatexInput(raw)).toBe(want);
  });
});

describe('normalizeKatexDisplaySpacing', () => {
  it('maps display-mode spacing \\\\ to \\quad outside matrix-like environments', () => {
    const s = 'r \\in S, \\\\ \\forall v';
    expect(normalizeKatexDisplaySpacing(s)).toBe('r \\in S, \\quad \\forall v');
  });

  it('preserves matrix row breaks when normalizing display spacing', () => {
    const raw = String.raw`\begin{matrix} a & b \\ c & d \end{matrix}`;
    expect(normalizeKatexDisplaySpacing(raw)).toBe(raw);
  });
});

describe('ensureDisplayStyleForOperatorLimits', () => {
  it('prepends \\displaystyle for inline integrals and sums with limits', () => {
    const latex = String.raw`\int_{-\infty}^{\infty} e^{-x^2}\,dx`;
    expect(ensureDisplayStyleForOperatorLimits(latex, false)).toBe(
      String.raw`\displaystyle ${latex}`,
    );
    expect(ensureDisplayStyleForOperatorLimits(latex, true)).toBe(latex);
  });

  it('leaves inline math without large-operator limits unchanged', () => {
    const latex = String.raw`\frac{1}{2} + x_i^2`;
    expect(ensureDisplayStyleForOperatorLimits(latex, false)).toBe(latex);
  });

  it('does not double-apply when \\displaystyle is already present', () => {
    const latex = String.raw`\displaystyle \sum_{i=1}^{n} x_i`;
    expect(ensureDisplayStyleForOperatorLimits(latex, false)).toBe(latex);
  });
});
