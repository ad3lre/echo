// @vitest-environment happy-dom

import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'fs';
import { parseMessageContent } from '@/features/chat/markdown/messageBodyMarkdown';

describe('debug numbered split html', () => {
  it('logs html', () => {
    const textNum = `9. Use Common Sense

Not every bad decision has its own rule.

Staff may act against behavior that clearly har
ms the community even if it is not explicitly listed here.

10. Staff Decisions

Staff are expected to be fair and consistent`;
    const textAtx = `## 9. Use Common Sense

Not every bad decision has its own rule.

Staff may act against behavior that clearly har
ms the community even if it is not explicitly listed here.

## 10. Staff Decisions

Staff are expected to be fair and consistent`;
    writeFileSync(
      '/tmp/echo-split-html-atx.txt',
      parseMessageContent(textAtx),
      'utf8',
    );
    writeFileSync(
      '/tmp/echo-split-html-num.txt',
      parseMessageContent(textNum),
      'utf8',
    );
  });
});
