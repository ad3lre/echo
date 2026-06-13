import { describe, expect, it } from 'vitest';
import {
  mapEchoEmbedToDiscordApi,
  mapEchoEmbedsToDiscordApi,
} from '@shared/discordEmbedApi';
import type { Embed } from '@shared/types';

describe('discordEmbedApi', () => {
  it('maps full Discord embed shape from Echo rows', () => {
    const embed: Embed = {
      title: 'Deploy',
      description: '```\nok\n```',
      url: 'https://example.com/run/1',
      color: 0x5865f2,
      timestamp: '2026-06-01T12:00:00.000Z',
      provider: 'GitHub',
      author: {
        name: 'CI',
        url: 'https://example.com',
        icon_url: 'https://cdn.example/icon.png',
      },
      footer: {
        text: 'main',
        icon_url: 'https://cdn.example/footer.png',
      },
      thumbnail: { url: 'https://cdn.example/thumb.png' },
      image: { url: 'https://cdn.example/image.png', width: 400, height: 200 },
      fields: [
        { name: 'Status', value: '**pass**', inline: true },
        { name: 'Logs', value: 'line1\nline2', inline: false },
      ],
    };

    expect(mapEchoEmbedToDiscordApi(embed)).toEqual({
      title: 'Deploy',
      description: '```\nok\n```',
      url: 'https://example.com/run/1',
      color: 0x5865f2,
      timestamp: '2026-06-01T12:00:00.000Z',
      provider: { name: 'GitHub' },
      author: {
        name: 'CI',
        url: 'https://example.com',
        icon_url: 'https://cdn.example/icon.png',
      },
      footer: {
        text: 'main',
        icon_url: 'https://cdn.example/footer.png',
      },
      thumbnail: { url: 'https://cdn.example/thumb.png' },
      image: {
        url: 'https://cdn.example/image.png',
        width: 400,
        height: 200,
      },
      fields: [
        { name: 'Status', value: '**pass**', inline: true },
        { name: 'Logs', value: 'line1\nline2', inline: false },
      ],
    });
  });

  it('caps embed list length and skips Echo-only rows', () => {
    const rows = mapEchoEmbedsToDiscordApi(
      [{ title: 'first' }, { title: 'second' }],
      1,
    );
    expect(rows).toEqual([{ title: 'first' }]);

    const echoOnly = mapEchoEmbedsToDiscordApi([
      { echoJump: { channelId: 'a', messageId: 'b' } },
      { title: 'x' },
    ]);
    expect(echoOnly).toEqual([{ title: 'x' }]);
  });
});
