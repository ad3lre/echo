# Math in messages (KaTeX / LaTeX)

Echo renders mathematical notation with **[KaTeX](https://katex.org/)**. Math is **handled before normal message formatting** runs on the same text, so dollar signs and backslashes inside formulas are not mistaken for Markdown. Everything outside the math regions can still use Markdown and a **small set of LaTeX-like text commands** for headings and simple layout (see [Text-style LaTeX commands](#text-style-latex-commands)).

This page covers **delimiters**, **engine behaviour**, **limits**, **what the extra text pass does**, and **what Echo does not try to do** compared with full LaTeX.

For how **Markdown** (bold, lists, links, spoilers, mentions) works in chat, open the **Message formatting** topic in the same help section.

---

## How math and formatting interact

Rough order for a normal message:

1. Mentions, highlights, and spoilers are prepared where they apply.
2. **Math regions** are found and temporarily replaced with safe placeholders so formatting does not break formulas.
3. A **narrow “text-style LaTeX” pass** runs on the remaining text (not inside those math placeholders).
4. The rest is interpreted as **Markdown**.
5. Placeholders are replaced with **KaTeX** output.
6. The final HTML is **sanitized** for safety; emoji styling does **not** run inside math output.

---

## Math delimiters

### Inline math

| Delimiter | Notes                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------- |
| `\(...\)` | Standard LaTeX-style inline math.                                                                   |
| `$...$`   | Single-dollar inline uses **conservative rules** (see [Single-dollar rules](#single-dollar-rules)). |

### Display math

| Delimiter             | Notes                                                                                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `\[ ... \]`           | One display block.                                                                                                                                                                                                                                                                                     |
| `$$ ... $$`           | Display; closing `$$` must match.                                                                                                                                                                                                                                                                      |
| **Bare environments** | If a line **starts** with `\begin{env}` for certain `env` values and the matching `\end{env}` exists, the **whole** block is treated as **one display math** region — useful for pasted `matrix`, `align`, etc. without wrapping in `$$`. See [Bare display environments](#bare-display-environments). |

### Always literal (not math)

- **Inline code** (backticks) — math syntax inside is **not** treated as math.
- **Fenced code blocks** — contents are skipped by the math scanner.

If you escape an opening delimiter (for example an odd number of `\` before `$`), it is treated as a **normal character**, not math.

---

## Single-dollar rules

Single `$` inline math is accepted only when the inner part:

- Has **no** newlines or backticks.
- Has **no stray** leading or trailing spaces in a way that disqualifies the span.
- Is **not** only digits, spaces, commas, dots, and minus (so prices like `Costs $5` stay plain text).
- The closing `$` is not immediately preceded by a space.

If no valid closing `$` is found, the `$` is shown as normal text.

---

## Bare display environments

At a **line start**, Echo recognizes these environment names for **bare** `\begin{env}...\end{env}` blocks (display math):

`matrix`, `pmatrix`, `bmatrix`, `Bmatrix`, `vmatrix`, `Vmatrix`, `smallmatrix`, `cases`, `aligned`, `align`, `align*`, `gather`, `gather*`, `multline`, `multline*`, `split`, `array`.

Other environments need normal math delimiters (`$$`, `\[`, or inline) unless Echo explicitly adds them later.

---

## Code and math

Inside **inline code** or **fenced code blocks**, `\(`, `\[`, `$`, `$$`, etc. are **literal** — use that to show math syntax without rendering it.

---

## Escaping `$` and `$$`

- Prefix with `\` when the usual escape rules apply (an escaped `$` does not start math).
- Putting `$` inside **code** is the most reliable way to show a literal dollar sign.

---

## KaTeX behaviour in Echo

Typical settings include:

| Behaviour                 | What it means for you                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------- |
| Invalid math              | Shown as a small **inline error** instead of breaking the whole message.                |
| Trusted / unsafe features | **Off** — no extra trust mode that would allow risky commands.                          |
| Strictness                | Non-fatal warnings only where relevant.                                                 |
| Output                    | HTML plus **MathML** where supported, for accessibility.                                |
| Size guards               | Very large operators or runaway macros are capped so one message cannot stall the page. |

Math styles are loaded **on demand** so the app stays light; math may appear briefly before fonts finish loading.

---

## Hard limits

| Limit                                           | Value               | If you go past it                                                                                      |
| ----------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| **LaTeX source** per math region                | **3000** characters | Truncated, with a short note in the output.                                                            |
| **Math regions** per message                    | **200**             | Extra regions are **not** rendered as math; the raw text is left for normal formatting where possible. |
| **Very deep** nested spoilers that contain math | Capped              | Deep nesting is simplified so the page stays responsive.                                               |

KaTeX’s own internal limits still apply on top of these.

---

## Supported commands (general)

Most **standard university-style math** (fractions, `\mathbb`, `\mathcal`, Greek letters, matrices, `\text{…}`, etc.) works if **KaTeX supports it**. The authoritative list is **[KaTeX supported functions](https://katex.org/docs/supported.html)**.

Echo does **not** ship a separate command list — anything KaTeX does not understand fails gracefully as above.

---

## Automatic typo fixes

Before KaTeX runs, Echo applies a **small set of pattern fixes** for common paste mistakes. This is **not** a full LaTeX checker. Examples:

- `\left{` → `\left\{`, `\right}` → `\right\}` when braces were pasted without backslashes.
- `\mathcal{P}{i}` → `\mathcal{P}_{i}`.
- `^{\mathbf{V}{i}}` → `^{\mathbf{V}_i}`.
- `_{\mathcal{D}i}` → `_{\mathcal{D}_i}`.
- Set-builder `:= {r \in \mathbb{S}` → `:= \{r \in \mathbb{S}` (paired fix).
- `\mathbf{V}_{i}}.` → `\mathbf{V}_{i}\}.`
- `Z{\text{univ}}` → `Z_{\text{univ}}`.
- `\mathbb{Z}{n}` (digits) → `\mathbb{Z}_{n}`.
- Inside **matrix-like environments only**, mistaken `\ \` row breaks are nudged toward proper `\\`.

If you need behaviour outside these fixes, write **valid KaTeX-compatible** input.

---

## Text-style LaTeX commands

**Outside** math placeholders, Echo looks for a **narrow** subset of LaTeX-like prose commands and turns them into ordinary headings, emphasis, or simple tables **before** Markdown runs. This is **not** a full LaTeX document system.

**Roughly supported (not exhaustive):**

- Headings: `\section{…}`, `\subsection{…}`, `\subsubsection{…}` → top-level headings.
- Inline: `\textbf{…}`, `\textit{…}`, `\emph{…}`, `\texttt{…}`.
- `\footnote[label]{body}` → small footnote-style text (simplified).
- `\url{https://...}` → link when the URL uses `http` or `https`.
- `\begin{tabular}...\end{tabular}` → **HTML table** (restricted column letters, rows split on `\\`, cells on `&`).
- `\begin{center}...\end{center}` → centered block.
- Spacing: `\quad`, `\qquad`; line breaks `\\`; `\hline` in table context.

**Not goals:** `\documentclass`, `\usepackage`, floats, bibliography, TikZ, chemistry packages, arbitrary environments, or PDF layout.

Fenced and inline **code** is skipped in this pass (same idea as for math).

---

## Styling in the app

- Wide display math can **scroll sideways** on small screens.
- Math uses **KaTeX fonts and sizing**.
- **Emoji** styling does **not** run inside math — do not rely on emoji inside formulas looking like chat emoji.

---

## Markdown interaction

- Math is **set aside** before Markdown sees special characters, so `**` inside `$$` does not become bold; math content is handled only by KaTeX.
- **Link syntax inside math** is part of the formula, not a Markdown link.

---

## Where Echo support **stops**

| Topic                                 | Boundary                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Full TeX / LaTeX**                  | Not supported — only what KaTeX implements, plus the small normalizers above.                           |
| **Trusted HTML from math**            | Disabled.                                                                                               |
| **`\usepackage` and add-on packages** | Not available beyond what KaTeX ships with.                                                             |
| **Chemistry macros**                  | Only if plain KaTeX can express them (e.g. `\ce` is not loaded by default).                             |
| **Arbitrary `\begin{env}`**           | Only the listed bare environments at line start, or math inside explicit `$$` / `\[` / `\(` delimiters. |
| **Huge macro packages**               | May hit expansion limits.                                                                               |
| **Copy/paste from PDFs**              | May insert odd characters; clean up manually if KaTeX complains.                                        |

Math is rendered **in the app** when you view a message (other Echo surfaces may behave differently).
