import { describe, expect, it } from 'vitest';
import {
  countButtonRows,
  deriveMessageComponentsFromContentJson,
  walkButtonRows,
} from './buttonRowContentJson';
import {
  DISCORD_BUTTON_STYLE,
  DISCORD_COMPONENT_TYPE,
} from './discordMessageComponents';

describe('buttonRowContentJson', () => {
  const docWithRow = {
    type: 'doc',
    content: [
      {
        type: 'buttonRow',
        attrs: {
          rowId: 'row-1',
          buttons: [
            {
              label: 'Go',
              style: DISCORD_BUTTON_STYLE.LINK,
              url: 'https://example.com',
            },
            {
              label: 'Later',
              style: DISCORD_BUTTON_STYLE.SECONDARY,
              customId: 'later',
            },
          ],
        },
      },
    ],
  };

  it('walks button rows', () => {
    expect(countButtonRows(docWithRow)).toBe(1);
    expect(walkButtonRows(docWithRow)[0].rowId).toBe('row-1');
    expect(walkButtonRows(docWithRow)[0].buttons).toHaveLength(2);
  });

  it('derives Discord components', () => {
    const components = deriveMessageComponentsFromContentJson(docWithRow);
    expect(components).toEqual([
      {
        type: DISCORD_COMPONENT_TYPE.ACTION_ROW,
        components: [
          {
            type: DISCORD_COMPONENT_TYPE.BUTTON,
            style: DISCORD_BUTTON_STYLE.LINK,
            label: 'Go',
            url: 'https://example.com',
          },
          {
            type: DISCORD_COMPONENT_TYPE.BUTTON,
            style: DISCORD_BUTTON_STYLE.SECONDARY,
            label: 'Later',
            custom_id: 'later',
          },
        ],
      },
    ]);
  });
});
