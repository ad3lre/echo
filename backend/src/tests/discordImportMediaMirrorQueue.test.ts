import assert from 'node:assert/strict';
import { echoMessageRowNeedsDiscordMediaMirror } from '../services/discordImportMediaMirrorQueue';
import type { EchoMessageRow } from '../domain/echoMessagesDal';

function row(partial: Partial<EchoMessageRow>): EchoMessageRow {
  return {
    id: '1',
    channelId: 'ch',
    authorId: 'u',
    content: '',
    timestamp: new Date().toISOString(),
    ...partial,
  };
}

assert.equal(
  echoMessageRowNeedsDiscordMediaMirror(
    row({
      stickers: [
        {
          id: '816087792291282944',
          name: 'Sup',
          format: 'lottie',
          url: 'https://cdn.discordapp.com/stickers/816087792291282944.json',
        },
      ],
    }),
  ),
  false,
  'lottie-only messages should not need Discord media mirror',
);

assert.equal(
  echoMessageRowNeedsDiscordMediaMirror(
    row({
      stickers: [
        {
          id: '1485326810454429777',
          name: 'Seia Cute',
          format: 'png',
          url: 'https://cdn.discordapp.com/stickers/1485326810454429777.png',
        },
      ],
    }),
  ),
  true,
  'png stickers should still be mirrored',
);

assert.equal(
  echoMessageRowNeedsDiscordMediaMirror(
    row({
      stickers: [
        {
          id: '816087792291282944',
          name: 'Sup',
          format: 'lottie',
          url: 'https://cdn.discordapp.com/stickers/816087792291282944.json',
        },
        {
          id: '1485326810454429777',
          name: 'Seia Cute',
          format: 'png',
          url: 'https://cdn.discordapp.com/stickers/1485326810454429777.png',
        },
      ],
    }),
  ),
  true,
  'mixed sticker messages should mirror non-lottie assets',
);

console.log('discordImportMediaMirrorQueue.test.ts: ok');
