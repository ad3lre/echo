/**
 * Narrow heuristics so common LaTeX mistakes still render as intended in KaTeX.
 * Each rule is intentionally tight; extend only with tests. Order matters.
 */

/** KaTeX row breaks are `\\`. Pasted/markdown text often has `\ \` (two `\ ` spaces) instead. */
function fixDoubleBackslashSpaceRowBreaksInBody(body: string): string {
  return body.replace(/\s*\\\s+\\\s+/g, '\\\\');
}

const SIMPLE_MATRIX_LIKE_ENVS =
  'matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|smallmatrix|aligned|split|gathered|cases|rcases';

const SIMPLE_MATRIX_LIKE_ENV_RE = new RegExp(
  `\\\\begin\\{(${SIMPLE_MATRIX_LIKE_ENVS})\\}([\\s\\S]*?)\\\\end\\{\\1\\}`,
  'g',
);

const ARRAY_ENV_RE = /(\\begin\{array\}\{[^}]*\})([\s\S]*?)(\\end\{array\})/g;

const ALIGNEDAT_ENV_RE =
  /(\\begin\{alignedat\}\{[^}]*\})([\s\S]*?)(\\end\{alignedat\})/g;

/**
 * Turn mistaken `\ \` (and spacing variants) into `\\` row breaks inside matrix-like environments only.
 * Scoped so formulas like `, \ \forall` outside those envs stay unchanged.
 */
function fixMatrixLikeRowSeparators(latex: string): string {
  let s = latex.replace(
    SIMPLE_MATRIX_LIKE_ENV_RE,
    (_full, env: string, body: string) =>
      `\\begin{${env}}${fixDoubleBackslashSpaceRowBreaksInBody(body)}\\end{${env}}`,
  );
  s = s.replace(
    ARRAY_ENV_RE,
    (_full, head: string, body: string, tail: string) =>
      `${head}${fixDoubleBackslashSpaceRowBreaksInBody(body)}${tail}`,
  );
  s = s.replace(
    ALIGNEDAT_ENV_RE,
    (_full, head: string, body: string, tail: string) =>
      `${head}${fixDoubleBackslashSpaceRowBreaksInBody(body)}${tail}`,
  );
  return s;
}

/**
 * Inline KaTeX uses textstyle limits beside `\int`, `\sum`, etc. Auto-apply
 * `\displaystyle` so limits sit above/below the operator like other platforms.
 */
const INLINE_LARGE_OP_WITH_LIMITS_RE =
  /\\(?:oiiint|oiint|oint|iiiint|iiint|iint|idotsint|int|sum|prod|coprod|big(?:cup|cap|vee|wedge|uplus|sqcup|oplus|otimes|odot|circ))(?:\s*[\^_]|\s+\\limits\b)/;

export function ensureDisplayStyleForOperatorLimits(
  latex: string,
  displayMode: boolean,
): string {
  if (displayMode) return latex;
  if (/\\displaystyle\b/.test(latex)) return latex;
  if (!INLINE_LARGE_OP_WITH_LIMITS_RE.test(latex)) return latex;
  return `\\displaystyle ${latex}`;
}

function replaceOutsideMatrixLikeEnvs(
  latex: string,
  transform: (segment: string) => string,
): string {
  const envRe = new RegExp(
    `\\\\begin\\{(${SIMPLE_MATRIX_LIKE_ENVS})\\}[\\s\\S]*?\\\\end\\{\\1\\}|` +
      `\\\\begin\\{array\\}\\{[^}]*\\}[\\s\\S]*?\\\\end\\{array\\}|` +
      `\\\\begin\\{alignedat\\}\\{[^}]*\\}[\\s\\S]*?\\\\end\\{alignedat\\}`,
    'g',
  );
  const parts: string[] = [];
  let lastIndex = 0;
  for (const match of latex.matchAll(envRe)) {
    const index = match.index ?? 0;
    parts.push(transform(latex.slice(lastIndex, index)));
    parts.push(match[0]);
    lastIndex = index + match[0].length;
  }
  parts.push(transform(latex.slice(lastIndex)));
  return parts.join('');
}

/**
 * In display mode, bare `\\` and `\newline` are no-ops and spam strict warnings.
 * Outside matrix-like environments, treat `\\` + whitespace as horizontal space.
 */
export function normalizeKatexDisplaySpacing(latex: string): string {
  return replaceOutsideMatrixLikeEnvs(latex, (segment) => {
    let s = segment.replace(/\\newline\b/g, '\\quad');
    s = s.replace(/\\\\(\s+)/g, '\\quad$1');
    s = s.replace(/\\\\$/g, '');
    return s;
  });
}

export function normalizeKatexInput(latex: string): string {
  let s = latex;

  // 0) Pasted `\left{` / `\right}` (missing `\` before `{` / `}`) breaks `\middle|` fences
  s = s.replace(/\\left(?!\\)\{/g, '\\left\\{');
  s = s.replace(/\\right(?!\\)\}/g, '\\right\\}');
  // 0b) Common subscript typo
  s = s.replaceAll('\\mathcal{P}{i}', '\\mathcal{P}_{i}');

  // 1) Superscript \mathbf{V} with mistaken `{i}` grouping → subscript i on V
  s = s.replaceAll('^{\\mathbf{V}{i}}', '^{\\mathbf{V}_i}');

  // 2) Calligraphic D with `i` glued after it instead of subscript
  s = s.replaceAll('_{\\mathcal{D}i}', '_{\\mathcal{D}_i}');

  // 3) Set-builder: literal `{` after `:=` → escaped open brace (paired with rule 4)
  s = s.replaceAll(
    ':= {r \\in \\mathbb{S} \\mid',
    ':= \\{r \\in \\mathbb{S} \\mid',
  );

  // 4) Closing `}` before final period was meant to end the set, not only close `_{i}`
  s = s.replaceAll('\\mathbf{V}_{i}}.', '\\mathbf{V}_{i}\\}.');

  // 5) Name `univ` grouped next to Z instead of as subscript
  s = s.replaceAll('Z{\\text{univ}}', 'Z_{\\text{univ}}');

  // 6) `\mathbb{Z}{n}` → `\mathbb{Z}_{n}` (digits only; braces for multi-digit)
  s = s.replace(/\\mathbb{Z}\{(\d+)\}/g, '\\mathbb{Z}_{$1}');

  s = fixMatrixLikeRowSeparators(s);

  return s;
}
