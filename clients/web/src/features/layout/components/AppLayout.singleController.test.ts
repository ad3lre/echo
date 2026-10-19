import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * AppLayout must construct the layout controller once. A second
 * `useAppLayoutController()` call creates a split-brain shell: inject openers
 * mutate one `vcActivityUi` Ref while the chat/voice tree reads another, so the
 * Activities puzzle button appears to do nothing.
 */
const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'AppLayout.vue'),
  'utf8',
);

describe('AppLayout single layout controller', () => {
  it('calls useAppLayoutController exactly once and destructures that instance', () => {
    const calls = SRC.match(/useAppLayoutController\(\)/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(SRC).toContain('} = layoutController;');
    expect(SRC).not.toMatch(/\} = useAppLayoutController\(\);/);
  });
});
