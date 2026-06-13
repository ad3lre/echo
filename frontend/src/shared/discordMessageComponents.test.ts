import { describe, expect, it } from 'vitest';
import {
  DISCORD_BUTTON_STYLE,
  DISCORD_MSG_FLAG_IS_COMPONENTS_V2,
  parseDiscordMessageComponents,
} from '@shared/discordMessageComponents';

describe('parseDiscordMessageComponents', () => {
  it('parses legacy action rows with buttons', () => {
    const parsed = parseDiscordMessageComponents([
      {
        type: 1,
        components: [
          {
            type: 2,
            style: DISCORD_BUTTON_STYLE.PRIMARY,
            label: 'Approve',
            custom_id: 'approve',
          },
          {
            type: 2,
            style: DISCORD_BUTTON_STYLE.LINK,
            label: 'Docs',
            url: 'https://example.com/docs',
          },
        ],
      },
    ]);

    expect(parsed).toEqual({
      componentsV2: false,
      textBlocks: [],
      actionRows: [
        {
          buttons: [
            {
              label: 'Approve',
              style: 1,
              customId: 'approve',
            },
            {
              label: 'Docs',
              style: 5,
              url: 'https://example.com/docs',
            },
          ],
        },
      ],
    });
  });

  it('parses components v2 text and nested action rows', () => {
    const parsed = parseDiscordMessageComponents(
      [
        { type: 10, content: '**Pick one**' },
        {
          type: 17,
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 2,
                  label: 'Later',
                  custom_id: 'later',
                },
              ],
            },
          ],
        },
      ],
      DISCORD_MSG_FLAG_IS_COMPONENTS_V2,
    );

    expect(parsed?.componentsV2).toBe(true);
    expect(parsed?.textBlocks).toEqual(['**Pick one**']);
    expect(parsed?.actionRows[0]?.buttons[0]?.label).toBe('Later');
  });

  it('returns null for invalid payloads', () => {
    expect(parseDiscordMessageComponents(null)).toBeNull();
    expect(
      parseDiscordMessageComponents([{ type: 1, components: [] }]),
    ).toBeNull();
    expect(
      parseDiscordMessageComponents([
        {
          type: 1,
          components: [{ type: 2, style: 5, label: 'No URL' }],
        },
      ]),
    ).toBeNull();
  });
});
