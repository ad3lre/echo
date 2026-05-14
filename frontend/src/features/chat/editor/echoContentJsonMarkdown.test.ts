import { describe, expect, it } from 'vitest';
import { markdownFromEchoContentJson } from './echoContentJsonMarkdown';

describe('markdownFromEchoContentJson', () => {
  it('emits headings, bold, italic, strike, code', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Title' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'b',
              marks: [{ type: 'bold' }],
            },
            {
              type: 'text',
              text: 'i',
              marks: [{ type: 'italic' }],
            },
            {
              type: 'text',
              text: 'bi',
              marks: [{ type: 'bold' }, { type: 'italic' }],
            },
            {
              type: 'text',
              text: 's',
              marks: [{ type: 'strike' }],
            },
            { type: 'text', text: ' ', marks: [] },
            {
              type: 'text',
              text: 'c',
              marks: [{ type: 'code' }],
            },
          ],
        },
      ],
    };
    const md = markdownFromEchoContentJson(doc);
    expect(md).toContain('## Title');
    expect(md).toContain('**b**');
    expect(md).toContain('*i*');
    expect(md).toContain('***bi***');
    expect(md).toContain('~~s~~');
    expect(md).toContain('`c`');
  });

  it('falls back to empty for invalid root', () => {
    expect(markdownFromEchoContentJson({ type: 'paragraph' })).toBe('');
  });
});
