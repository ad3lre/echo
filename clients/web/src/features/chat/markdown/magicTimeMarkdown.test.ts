import { describe, expect, it } from 'vitest';
import {
  applyMagicTimeToPlaintext,
  replaceMagicTimePlaceholdersInHtml,
} from './magicTimeMarkdown';

describe('magicTimeMarkdown', () => {
  it('inserts placeholder after a 24h time and restores chip HTML', () => {
    const ctx = {
      messageTimestampIso: '2026-05-17T18:00:00.000Z',
      senderTimeZone: 'America/New_York',
      viewerTimeZone: 'Europe/Berlin',
      viewerLocale: 'en-US',
    };
    const { text, slots } = applyMagicTimeToPlaintext('Call at 15:30 ok', ctx);
    expect(text).toContain('\uE000MT');
    expect(slots.length).toBeGreaterThan(0);
    const html = replaceMagicTimePlaceholdersInHtml(
      `before${slots[0]!.placeholder}after`,
      slots,
    );
    expect(html).toContain('echo-magic-time-chip');
    expect(html).not.toContain(slots[0]!.placeholder);
  });

  it('handles 12h am/pm form', () => {
    const ctx = {
      messageTimestampIso: '2026-05-17T18:00:00.000Z',
      senderTimeZone: 'America/Los_Angeles',
      viewerTimeZone: 'UTC',
      viewerLocale: 'en-US',
    };
    const { slots } = applyMagicTimeToPlaintext('Meet 3pm tomorrow', ctx);
    expect(slots.length).toBeGreaterThan(0);
  });
});
