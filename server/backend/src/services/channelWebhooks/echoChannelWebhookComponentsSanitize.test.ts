import { describe, expect, test } from 'bun:test';
import { sanitizeWebhookComponents } from './echoChannelWebhookComponentsSanitize';

const row = (components: unknown[]) => ({ type: 1, components });

describe('sanitizeWebhookComponents', () => {
  test('keeps valid buttons and drops unknown keys', () => {
    const out = sanitizeWebhookComponents([
      {
        ...row([
          { type: 2, style: 1, label: 'Go', custom_id: 'go', evil: '<x>' },
          { type: 2, style: 5, label: 'Docs', url: 'https://example.com/a' },
        ]),
        extra: 1,
      },
    ]);
    expect(out).toEqual([
      {
        type: 1,
        components: [
          { type: 2, style: 1, label: 'Go', custom_id: 'go' },
          { type: 2, style: 5, label: 'Docs', url: 'https://example.com/a' },
        ],
      },
    ]);
  });

  test('rejects unsafe or userinfo link URLs', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,hi',
      'https://user:pw@example.com/',
      `https://example.com/${'a'.repeat(600)}`,
    ]) {
      expect(
        sanitizeWebhookComponents([
          row([{ type: 2, style: 5, label: 'x', url }]),
        ]),
      ).toEqual([]);
    }
  });

  test('caps rows, buttons, and string lengths', () => {
    const btn = (i: number) => ({
      type: 2,
      style: 2,
      label: 'L'.repeat(200),
      custom_id: 'c'.repeat(300) + i,
    });
    const rows = Array.from({ length: 8 }, () =>
      row(Array.from({ length: 9 }, (_, i) => btn(i))),
    );
    const out = sanitizeWebhookComponents(rows) as any[];
    expect(out.length).toBe(5);
    expect(out[0].components.length).toBe(5);
    expect(out[0].components[0].label.length).toBe(80);
    expect(out[0].components[0].custom_id.length).toBe(100);
  });

  test('drops unknown component types and bounds container depth', () => {
    expect(sanitizeWebhookComponents([{ type: 3, options: [] }])).toEqual([]);
    let nested: unknown = { type: 10, content: 'deep' };
    for (let i = 0; i < 10; i++) nested = { type: 17, components: [nested] };
    expect(sanitizeWebhookComponents([nested])).toEqual([]);
    expect(
      sanitizeWebhookComponents([
        { type: 17, components: [{ type: 10, content: 'hi' }, { type: 14 }] },
      ]),
    ).toEqual([
      {
        type: 17,
        components: [{ type: 10, content: 'hi' }, { type: 14 }],
      },
    ]);
  });
});
