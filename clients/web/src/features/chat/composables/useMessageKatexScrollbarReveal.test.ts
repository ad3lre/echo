// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { katexDisplayScrollElement } from './useMessageKatexScrollbarReveal';

describe('katexDisplayScrollElement', () => {
  it('returns inner .katex when given a .katex-display wrapper', () => {
    document.body.innerHTML =
      '<span class="katex-display"><span class="katex">x</span></span>';
    const display = document.querySelector('.katex-display') as HTMLElement;
    const inner = document.querySelector(
      '.katex-display > .katex',
    ) as HTMLElement;
    expect(katexDisplayScrollElement(display)).toBe(inner);
  });

  it('returns the .katex element when it is the scroll target', () => {
    document.body.innerHTML =
      '<span class="katex-display"><span class="katex">x</span></span>';
    const inner = document.querySelector(
      '.katex-display > .katex',
    ) as HTMLElement;
    expect(katexDisplayScrollElement(inner)).toBe(inner);
  });

  it('returns null for unrelated elements', () => {
    document.body.innerHTML = '<span class="katex">inline</span>';
    const inline = document.querySelector('.katex') as HTMLElement;
    expect(katexDisplayScrollElement(inline)).toBeNull();
  });
});
