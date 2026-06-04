/**
 * Run: node --import tsx src/tests/discordMessageImportEmbeds.test.ts
 */
import assert from 'node:assert/strict';
import {
  mapDiscordApiEmbedToEcho,
  parseImportedEmbeds,
} from '../services/discordMessageImport';

async function main() {
  let failed = false;
  const run = (name: string, fn: () => void) => {
    try {
      fn();
      // eslint-disable-next-line no-console
      console.log(`ok ${name}`);
    } catch (e) {
      failed = true;
      // eslint-disable-next-line no-console
      console.error(`FAIL ${name}`, e);
    }
  };

  run('preserves full Discord embed description and fields', () => {
    const longDescription = 'Line one\n\nLine two '.repeat(40);
    const mapped = mapDiscordApiEmbedToEcho({
      title: 'Status update',
      description: longDescription,
      color: 0x5865f2,
      fields: [
        { name: 'Owner', value: 'Alice', inline: true },
        { name: 'Notes', value: 'Multi\nline\nvalue', inline: false },
      ],
      footer: {
        text: 'Updated just now',
        icon_url: 'https://cdn.discordapp.com/embed/avatars/0.png',
      },
      timestamp: '2026-06-01T12:00:00.000Z',
    });

    assert.equal(mapped?.description, longDescription);
    assert.equal(mapped?.fields?.length, 2);
    assert.equal(mapped?.fields?.[1]?.value, 'Multi\nline\nvalue');
    assert.equal(mapped?.footer?.text, 'Updated just now');
  });

  run('maps Discord video embed media onto image', () => {
    const mapped = mapDiscordApiEmbedToEcho({
      type: 'video',
      url: 'https://example.com/watch',
      title: 'Clip',
      video: {
        url: 'https://cdn.discordapp.com/video.mp4',
        width: 1280,
        height: 720,
      },
    });

    assert.equal(mapped?.image?.url, 'https://cdn.discordapp.com/video.mp4');
    assert.equal(mapped?.image?.width, 1280);
    assert.equal(mapped?.image?.height, 720);
  });

  run('returns undefined when embed array is empty', () => {
    assert.equal(parseImportedEmbeds([]), undefined);
  });

  process.exit(failed ? 1 : 0);
}

void main();
