// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { parseMessageContent } from '@/features/chat/markdown/messageBodyMarkdown';

describe('parseMessageContent split line styling', () => {
  it('does not render ms continuation line as heading after mid-word newline', () => {
    const text = `## 9. Use Common Sense

Not every bad decision has its own rule.

Staff may act against behavior that clearly har
ms the community even if it is not explicitly listed here.

## 10. Staff Decisions

Staff are expected to be fair and consistent`;
    const html = parseMessageContent(text);
    expect(html).not.toMatch(/<h[1-6][^>]*>\s*ms the community/i);
    expect(html).toMatch(/ms the community even if/i);
  });

  it('does not render numbered ms line as heading when prior line ends mid-word', () => {
    const text = `9. Use Common Sense

Not every bad decision has its own rule.

Staff may act against behavior that clearly har
ms the community even if it is not explicitly listed here.

10. Staff Decisions

Staff are expected to be fair and consistent`;
    const html = parseMessageContent(text);
    expect(html).not.toMatch(/<h[1-6][^>]*>\s*ms the community/i);
    expect(html).toMatch(/ms the community even if/i);
  });
});
