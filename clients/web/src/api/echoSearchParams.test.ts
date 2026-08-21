import { describe, expect, it } from 'vitest';
import { buildEchoMessageSearchQueryString } from './echoSearchParams';

describe('buildEchoMessageSearchQueryString', () => {
  it('omits empty fields', () => {
    expect(buildEchoMessageSearchQueryString({})).toBe('');
  });

  it('includes q, filters, before, limit', () => {
    const qs = buildEchoMessageSearchQueryString({
      q: 'hello world',
      channelId: 'ch_1',
      authorId: 'u1',
      mentions: 'ada',
      before: 'msg_99',
      limit: 16,
      hasType: 'gif',
    });
    const sp = new URLSearchParams(qs);
    expect(sp.get('q')).toBe('hello world');
    expect(sp.get('channelId')).toBe('ch_1');
    expect(sp.get('authorId')).toBe('u1');
    expect(sp.get('mentions')).toBe('ada');
    expect(sp.get('before')).toBe('msg_99');
    expect(sp.get('limit')).toBe('16');
    expect(sp.get('hasType')).toBe('gif');
  });

  it('clamps limit to 1–50', () => {
    expect(
      new URLSearchParams(buildEchoMessageSearchQueryString({ limit: 0 })).get(
        'limit',
      ),
    ).toBe('1');
    expect(
      new URLSearchParams(
        buildEchoMessageSearchQueryString({ limit: 999 }),
      ).get('limit'),
    ).toBe('50');
  });
});
