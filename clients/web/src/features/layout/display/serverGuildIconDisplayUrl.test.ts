import { describe, expect, it } from 'vitest';
import { serverGuildIconDisplayUrl } from '@/features/layout/display/serverGuildIconDisplayUrl';
import { iconEchoRounded } from '@/assets/branding';

describe('serverGuildIconDisplayUrl', () => {
  it('uses Echo default when empty or whitespace', () => {
    expect(serverGuildIconDisplayUrl('')).toBe(iconEchoRounded);
    expect(serverGuildIconDisplayUrl('   ')).toBe(iconEchoRounded);
    expect(serverGuildIconDisplayUrl(null)).toBe(iconEchoRounded);
    expect(serverGuildIconDisplayUrl(undefined)).toBe(iconEchoRounded);
  });

  it('uses Echo default for sentinel strings', () => {
    expect(serverGuildIconDisplayUrl('null')).toBe(iconEchoRounded);
    expect(serverGuildIconDisplayUrl('NULL')).toBe(iconEchoRounded);
    expect(serverGuildIconDisplayUrl('undefined')).toBe(iconEchoRounded);
    expect(serverGuildIconDisplayUrl('none')).toBe(iconEchoRounded);
  });

  it('uses Echo default for untrusted URL shapes', () => {
    expect(serverGuildIconDisplayUrl('javascript:alert(1)')).toBe(
      iconEchoRounded,
    );
    expect(serverGuildIconDisplayUrl('not a url')).toBe(iconEchoRounded);
  });

  it('preserves valid https guild icon URLs', () => {
    const u =
      'https://cdn.discordapp.com/icons/309897200747839488/312934876befcc67307b149a9a41f60a.png';
    expect(serverGuildIconDisplayUrl(u)).toBe(u);
  });

  it('prefixes bare relative paths so <img> resolves from site root, not the route', () => {
    expect(serverGuildIconDisplayUrl('echo-rounded-logo.png')).toBe(
      '/echo-rounded-logo.png',
    );
    expect(serverGuildIconDisplayUrl('./echo-uploads/x/y.png')).toBe(
      '/echo-uploads/x/y.png',
    );
  });

  it('treats malformed Discord guild icon URLs as default', () => {
    expect(
      serverGuildIconDisplayUrl(
        'https://cdn.discordapp.com/icons/309897200747839488/.png',
      ),
    ).toBe(iconEchoRounded);
    expect(
      serverGuildIconDisplayUrl('https://cdn.discordapp.com/icons/123456789/'),
    ).toBe(iconEchoRounded);
  });
});
