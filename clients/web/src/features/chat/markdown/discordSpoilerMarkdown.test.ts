import { describe, expect, it } from 'vitest';
import {
  findRawDiscordSpoilerRegions,
  buildTextWithSpoilerPlaceholders,
  makeSpoilerPlaceholderToken,
} from './discordSpoilerMarkdown';

describe('findRawDiscordSpoilerRegions', () => {
  it('pairs simple spoilers', () => {
    const r = findRawDiscordSpoilerRegions('a ||x|| b');
    expect(r).toHaveLength(1);
    expect(r[0]!.inner).toBe('x');
  });

  it('does not close at || inside inline code', () => {
    const s = '||a `||` b||';
    const r = findRawDiscordSpoilerRegions(s);
    expect(r).toHaveLength(1);
    expect(r[0]!.inner).toBe('a `||` b');
  });

  it('allows newlines inside spoiler', () => {
    const r = findRawDiscordSpoilerRegions('||a\nb||');
    expect(r).toHaveLength(1);
    expect(r[0]!.inner).toBe('a\nb');
  });

  it('ignores || inside fenced block', () => {
    const s = '```\n||x||\n```\nafter';
    const r = findRawDiscordSpoilerRegions(s);
    expect(r).toHaveLength(0);
  });

  it('does not hang when fence markers are not at line start (regression)', () => {
    const r = findRawDiscordSpoilerRegions('!```\n**a** `b`');
    expect(r).toHaveLength(0);
  });

  it('finds spoilers after !-escaped fence closer', () => {
    const r = findRawDiscordSpoilerRegions('!```\ninner\n```\n||after||');
    expect(r).toHaveLength(1);
    expect(r[0]!.inner).toBe('after');
  });
});

describe('buildTextWithSpoilerPlaceholders', () => {
  it('replaces regions with fixed-width tokens', () => {
    const regions = findRawDiscordSpoilerRegions('||a||');
    const out = buildTextWithSpoilerPlaceholders('||a||', regions);
    expect(out).toBe(makeSpoilerPlaceholderToken(0));
    expect(out.length).toBe(3);
  });
});
