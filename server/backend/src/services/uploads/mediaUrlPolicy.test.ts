import { describe, expect, test } from 'bun:test';
import { mediaUrlPassesEchoPolicy } from './mediaUrlPolicy';

describe('mediaUrlPassesEchoPolicy GIF shortcut', () => {
  test('accepts known GIF provider CDN hosts over https', () => {
    expect(
      mediaUrlPassesEchoPolicy('https://media.tenor.com/abc123/tenor.gif'),
    ).toBe(true);
    expect(
      mediaUrlPassesEchoPolicy('https://media.giphy.com/media/x/giphy.gif'),
    ).toBe(true);
  });

  test('rejects arbitrary hosts that merely end in .gif or use format=gif', () => {
    expect(mediaUrlPassesEchoPolicy('https://attacker.gif')).toBe(false);
    expect(mediaUrlPassesEchoPolicy('https://attacker.gif/x.gif')).toBe(false);
    expect(mediaUrlPassesEchoPolicy('https://evil.example/x?format=gif')).toBe(
      false,
    );
    expect(mediaUrlPassesEchoPolicy('https://evil.example/a.gif')).toBe(false);
  });

  test('rejects lookalike hosts and non-https GIF provider URLs', () => {
    expect(
      mediaUrlPassesEchoPolicy('https://media.tenor.com.evil.example/a.gif'),
    ).toBe(false);
    expect(mediaUrlPassesEchoPolicy('http://media.tenor.com/a.gif')).toBe(
      false,
    );
    expect(mediaUrlPassesEchoPolicy('https://user:pw@evil.example/a.gif')).toBe(
      false,
    );
  });
});
