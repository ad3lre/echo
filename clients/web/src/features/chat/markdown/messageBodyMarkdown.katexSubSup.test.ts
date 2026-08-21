/* @vitest-environment happy-dom */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ensureKatexReady,
  parseMessageContent,
} from '@/features/chat/markdown/useMarkdown';

describe('messageBodyMarkdown KaTeX sub+sup', () => {
  beforeAll(async () => {
    await ensureKatexReady();
  });

  it('keeps vlist top offsets for combined superscript and subscript', () => {
    const out = parseMessageContent('line\n$V^{15}_{(5)}$');
    expect(out).toContain('class="katex"');
    expect(out).toContain('msupsub');
    const tops = [...out.matchAll(/top:\s*-?[\d.]+em/g)].map((m) => m[0]);
    expect(tops.length).toBeGreaterThanOrEqual(2);
    expect(new Set(tops).size).toBeGreaterThanOrEqual(2);
  });
});
