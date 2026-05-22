/* @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { parseMessageContent, type IdTokenResolvers } from './useMarkdown';

describe('useMarkdown parse cache', () => {
  it('reuses cached output for stable resolver identity', () => {
    let calls = 0;
    const resolvers: IdTokenResolvers = {
      channelLabel: (id: string) => {
        calls += 1;
        return id === '123' ? 'general' : id;
      },
    };

    const input = 'hello <#123>';
    const first = parseMessageContent(input, undefined, resolvers);
    const second = parseMessageContent(input, undefined, resolvers);

    expect(first).toContain('#general');
    expect(second).toContain('#general');
    expect(calls).toBe(1);
  });

  it('invalidates cache when resolver identity changes', () => {
    let callsA = 0;
    let callsB = 0;
    const resolverA: IdTokenResolvers = {
      channelLabel: () => {
        callsA += 1;
        return 'alpha';
      },
    };
    const resolverB: IdTokenResolvers = {
      channelLabel: () => {
        callsB += 1;
        return 'beta';
      },
    };

    const input = 'jump <#42>';
    const outA = parseMessageContent(input, undefined, resolverA);
    const outB = parseMessageContent(input, undefined, resolverB);

    expect(outA).toContain('#alpha');
    expect(outB).toContain('#beta');
    expect(callsA).toBe(1);
    expect(callsB).toBe(1);
  });

  it('uses explicit _cacheVersion instead of object identity', () => {
    let calls = 0;
    const resolverV1: IdTokenResolvers = {
      _cacheVersion: 100,
      channelLabel: () => {
        calls += 1;
        return 'cached';
      },
    };
    const resolverV1Copy: IdTokenResolvers = {
      _cacheVersion: 100,
      channelLabel: () => {
        calls += 1;
        return 'cached';
      },
    };

    const input = 'test <#99>';
    parseMessageContent(input, undefined, resolverV1);
    expect(calls).toBe(1);

    const out2 = parseMessageContent(input, undefined, resolverV1Copy);
    expect(out2).toContain('#cached');
    expect(calls).toBe(1);
  });

  it('invalidates cache when _cacheVersion bumps', () => {
    let nameA = 'old-name';
    const resolverA: IdTokenResolvers = {
      _cacheVersion: 200,
      channelLabel: () => nameA,
    };

    const input = 'goto <#5>';
    const out1 = parseMessageContent(input, undefined, resolverA);
    expect(out1).toContain('#old-name');

    nameA = 'new-name';
    const resolverB: IdTokenResolvers = {
      _cacheVersion: 201,
      channelLabel: () => nameA,
    };
    const out2 = parseMessageContent(input, undefined, resolverB);
    expect(out2).toContain('#new-name');
  });

  it('renders custom emoji tokens from global resolver lookup', () => {
    const out = parseMessageContent('hey <:party_blob:987654321>', undefined, {
      customEmojiImageUrl: (id) =>
        id === '987654321' ? 'https://cdn.test/party_blob.webp' : undefined,
    });
    expect(out).toContain('class="emoji custom-emoji"');
    expect(out).toContain('src="https://cdn.test/party_blob.webp"');
  });

  it('re-parses when resolver cache version bumps (async emoji resolve)', () => {
    const input = 'hey <:wave:304238867010606080>';
    const resolversV0: IdTokenResolvers = {
      _cacheVersion: 0,
      customEmojiImageUrl: () => undefined,
    };
    const first = parseMessageContent(input, undefined, resolversV0);
    expect(first).toContain('mention--custom-emoji');

    const resolversV1: IdTokenResolvers = {
      _cacheVersion: 1,
      customEmojiImageUrl: (id) =>
        id === '304238867010606080'
          ? '/api/v1/echo/emoji/304238867010606080/asset'
          : undefined,
    };
    const second = parseMessageContent(input, undefined, resolversV1);
    expect(second).toContain('class="emoji custom-emoji"');
    expect(second).toContain('/api/v1/echo/emoji/304238867010606080/asset');
  });
});
