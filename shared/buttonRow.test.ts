import { describe, expect, it } from 'vitest';
import {
  findAllButtonRowTokens,
  formatButtonRowToken,
  parseButtonRowShortcut,
  parseButtonRowToken,
} from './buttonRow';
import { DISCORD_BUTTON_STYLE } from './discordMessageComponents';

describe('buttonRow tokens', () => {
  it('formats and parses persisted tokens', () => {
    const token = formatButtonRowToken({ rowId: 'row-abc' });
    expect(token).toBe('![button: rowId=row-abc]');
    expect(parseButtonRowToken(token)).toEqual({ rowId: 'row-abc' });
  });

  it('parses single link button shortcut', () => {
    expect(
      parseButtonRowShortcut(
        '![button: label=Visit site, url=https://example.com/path]',
      ),
    ).toEqual({
      rowId: '',
      buttons: [
        {
          label: 'Visit site',
          style: DISCORD_BUTTON_STYLE.LINK,
          url: 'https://example.com/path',
        },
      ],
    });
  });

  it('parses single custom button shortcut', () => {
    expect(
      parseButtonRowShortcut('![button: label=Confirm, style=primary, id=ok]'),
    ).toEqual({
      rowId: '',
      buttons: [
        {
          label: 'Confirm',
          style: DISCORD_BUTTON_STYLE.PRIMARY,
          customId: 'ok',
        },
      ],
    });
  });

  it('parses multi-button row shortcut', () => {
    expect(
      parseButtonRowShortcut(
        '![buttonRow: buttons="Visit|link|https://a.com;Cancel|secondary|cancel_id"]',
      ),
    ).toEqual({
      rowId: '',
      buttons: [
        {
          label: 'Visit',
          style: DISCORD_BUTTON_STYLE.LINK,
          url: 'https://a.com',
        },
        {
          label: 'Cancel',
          style: DISCORD_BUTTON_STYLE.SECONDARY,
          customId: 'cancel_id',
        },
      ],
    });
  });

  it('finds tokens with offsets', () => {
    const plain = 'hi ![button: rowId=row-1] there';
    const found = findAllButtonRowTokens(plain);
    expect(found).toHaveLength(1);
    expect(found[0].rowId).toBe('row-1');
    expect(found[0].start).toBe(3);
  });
});
