import { describe, expect, it } from 'vitest';
import {
  findAllIdTokenMatches,
  linkTokenAppIcon,
  linkTokenChannel,
  linkTokenCustomEmoji,
  linkTokenCustomEmojiAnimated,
  linkTokenMessage,
  linkTokenRole,
  linkTokenServer,
  linkTokenUser,
} from './idTokens';

describe('linkToken* builders', () => {
  it('formats tokens', () => {
    expect(linkTokenUser('u1')).toBe('<@u1>'); // 5 chars
    expect(linkTokenChannel('c1')).toBe('<#c1>');
    expect(linkTokenRole('r1')).toBe('<@&r1>');
    expect(linkTokenServer('s1')).toBe('<$s1>');
    expect(linkTokenMessage('m1')).toBe('<m:m1>');
    expect(linkTokenCustomEmoji('wave', '99')).toBe('<:wave:99>');
    expect(linkTokenCustomEmojiAnimated('dance', '100')).toBe('<a:dance:100>');
    expect(linkTokenCustomEmoji('bad:name', '1')).toBe('<:bad_name:1>');
    expect(linkTokenAppIcon('message.svg')).toBe('<icon:message.svg>');
  });
});

describe('findAllIdTokenMatches', () => {
  it('finds user mention with optional !', () => {
    const hits = findAllIdTokenMatches('hi <@u1> and <@!u2>');
    expect(hits.map((h) => h.token)).toEqual([
      { kind: 'user', id: 'u1', rawLen: 5 },
      { kind: 'user', id: 'u2', rawLen: 6 },
    ]);
  });

  it('finds channel, role, server, message, static and animated emoji', () => {
    const text = '<#ch> <@&role> <$srv> <m:msgid> <:n:1> <a:n:2>';
    const kinds = findAllIdTokenMatches(text).map((h) => h.token.kind);
    expect(kinds).toEqual([
      'channel',
      'role',
      'server',
      'message',
      'emoji',
      'emoji',
    ]);
  });

  it('ignores non-tokens', () => {
    expect(findAllIdTokenMatches('no tokens here')).toEqual([]);
  });

  it('finds app icon tokens', () => {
    const text = 'x <icon:message.svg> y';
    const hits = findAllIdTokenMatches(text);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.token).toEqual({
      kind: 'appIcon',
      filename: 'message.svg',
      rawLen: '<icon:message.svg>'.length,
    });
  });
});
