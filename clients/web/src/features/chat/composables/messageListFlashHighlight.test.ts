/**
 * @vitest-environment happy-dom
 */

import { afterEach, describe, expect, it } from 'vitest';
import { flashMessageHighlightInRoot } from './messageListFlashHighlight';

describe('flashMessageHighlightInRoot', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('adds the highlight class on the next animation frame', async () => {
    const root = document.createElement('div');
    const row = document.createElement('div');
    row.id = 'message-abc';
    root.appendChild(row);
    document.body.appendChild(root);

    flashMessageHighlightInRoot(root, 'abc');
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    expect(row.classList.contains('message-highlight')).toBe(true);
  });

  it('no-ops when the root is missing', () => {
    expect(() => flashMessageHighlightInRoot(null, 'abc')).not.toThrow();
  });
});
