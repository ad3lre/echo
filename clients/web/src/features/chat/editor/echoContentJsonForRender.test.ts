import { describe, expect, it } from 'vitest';
import {
  isEchoContentSchemaSupportedForRender,
  validateEchoContentJsonForRender,
} from './echoContentJsonForRender';

function validDoc() {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'hello' },
          { type: 'hardBreak' },
          { type: 'mentionEntity', attrs: { label: 'Ada' } },
        ],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text' }] }],
          },
        ],
      },
    ],
  };
}

describe('validateEchoContentJsonForRender', () => {
  it('accepts supported readonly TipTap document shapes', () => {
    const doc = validDoc();
    expect(validateEchoContentJsonForRender(doc)).toEqual({ ok: true, doc });
  });

  it('rejects invalid roots and node shapes', () => {
    expect(validateEchoContentJsonForRender(null)).toEqual({ ok: false });
    expect(validateEchoContentJsonForRender([])).toEqual({ ok: false });
    expect(validateEchoContentJsonForRender({ type: 'paragraph' })).toEqual({
      ok: false,
    });
    expect(
      validateEchoContentJsonForRender({
        type: 'doc',
        content: [{ type: 'script' }],
      }),
    ).toEqual({ ok: false });
    expect(
      validateEchoContentJsonForRender({
        type: 'doc',
        content: { type: 'paragraph' },
      }),
    ).toEqual({ ok: false });
    expect(
      validateEchoContentJsonForRender({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 42 }] }],
      }),
    ).toEqual({ ok: false });
  });

  it('rejects deeply nested or oversized content', () => {
    let node: Record<string, unknown> = { type: 'paragraph' };
    for (let i = 0; i < 82; i += 1) {
      node = { type: 'paragraph', content: [node] };
    }
    expect(
      validateEchoContentJsonForRender({ type: 'doc', content: [node] }),
    ).toEqual({ ok: false });

    expect(
      validateEchoContentJsonForRender({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'x'.repeat(300_000) }],
          },
        ],
      }),
    ).toEqual({ ok: false });
  });

  it('treats supported schema versions as a bounded range', () => {
    expect(isEchoContentSchemaSupportedForRender(undefined)).toBe(true);
    expect(isEchoContentSchemaSupportedForRender(1)).toBe(true);
    expect(isEchoContentSchemaSupportedForRender(0)).toBe(false);
    expect(isEchoContentSchemaSupportedForRender(Number.MAX_SAFE_INTEGER)).toBe(
      false,
    );
  });
});
