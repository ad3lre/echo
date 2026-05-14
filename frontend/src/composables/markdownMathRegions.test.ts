import { describe, expect, it } from 'vitest';
import {
  extractMarkdownMathRegions,
  injectRenderedMathRegions,
} from './markdownMathRegions';

describe('markdownMathRegions', () => {
  it('extracts inline and display math delimiters', () => {
    const out = extractMarkdownMathRegions(
      'Inline \\(a+b\\) and $c+d$ and block $$x^2 + y^2$$ done.',
    );
    expect(out.regions).toHaveLength(3);
    expect(out.regions[0]).toMatchObject({ latex: 'a+b', displayMode: false });
    expect(out.regions[1]).toMatchObject({ latex: 'c+d', displayMode: false });
    expect(out.regions[2]).toMatchObject({
      latex: 'x^2 + y^2',
      displayMode: true,
    });
    expect(out.text).toContain('@@ECHO_MATH_SLOT_0@@');
    expect(out.text).toContain('@@ECHO_MATH_SLOT_1@@');
    expect(out.text).toContain('@@ECHO_MATH_SLOT_2@@');
  });

  it('does not extract math inside fenced or inline code', () => {
    const out = extractMarkdownMathRegions(
      'Code `\\(x\\)`\n```txt\n$$y$$\n```\nMath \\(z\\)',
    );
    expect(out.regions).toHaveLength(1);
    expect(out.regions[0]!.latex).toBe('z');
    expect(out.text).toContain('`\\(x\\)`');
    expect(out.text).toContain('$$y$$');
  });

  it('does not extract $$ inside ```txt fence (regression: paste crash)', () => {
    const lf = `Not math: \`\\(x\\)\` and not math: \`$$y$$\`

\`\`\`txt
$$ also not math in a fence $$
\`\`\`
`;
    const crlf = lf.replace(/\n/g, '\r\n');
    for (const raw of [lf, crlf]) {
      const out = extractMarkdownMathRegions(raw);
      expect(out.regions, raw.slice(0, 40)).toHaveLength(0);
      expect(out.text).toContain('$$ also not math in a fence $$');
    }
  });

  it('does not treat plain currency text as inline math', () => {
    const out = extractMarkdownMathRegions(
      'Costs $5-$10 today and $20 tomorrow.',
    );
    expect(out.regions).toHaveLength(0);
    expect(out.text).toContain('$5-$10');
    expect(out.text).toContain('$20');
  });

  it('treats paired dollar-delimited digits as inline math', () => {
    const out = extractMarkdownMathRegions('The answer is $5$.');
    expect(out.regions).toHaveLength(1);
    expect(out.regions[0]).toMatchObject({ latex: '5', displayMode: false });
    expect(out.text).toContain('@@ECHO_MATH_SLOT_0@@');
  });

  it('extracts bare matrix environments as display math', () => {
    const out = extractMarkdownMathRegions(
      String.raw`Subgroups:
\begin{matrix}
a & b \\
c & d
\end{matrix}
done.`,
    );
    expect(out.regions).toHaveLength(1);
    expect(out.regions[0]).toMatchObject({
      displayMode: true,
    });
    expect(out.regions[0]!.latex).toContain('\\begin{matrix}');
    expect(out.regions[0]!.latex).toContain('\\end{matrix}');
    expect(out.text).toContain('@@ECHO_MATH_SLOT_0@@');
  });

  it('injects rendered html by token', () => {
    const html = '<p>@@ECHO_MATH_SLOT_0@@ and @@ECHO_MATH_SLOT_1@@</p>';
    const out = injectRenderedMathRegions(html, [
      { token: '@@ECHO_MATH_SLOT_0@@', html: '<span class="katex">a</span>' },
      { token: '@@ECHO_MATH_SLOT_1@@', html: '<span class="katex">b</span>' },
    ]);
    expect(out).toContain('<span class="katex">a</span>');
    expect(out).toContain('<span class="katex">b</span>');
  });
});
