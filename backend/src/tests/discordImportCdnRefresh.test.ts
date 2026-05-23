import assert from 'node:assert/strict';
import { discordCdnUrlStableKey } from '../domain/discordCdnUrls';
import {
  buildDiscordMediaRefreshUrlMap,
  buildDiscordMediaUrlIndexFromBotMessage,
} from '../services/discordImportCdnRefresh';
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

const expired =
  'https://cdn.discordapp.com/attachments/111/222/cat.png?ex=old&is=old&hm=dead';
const fresh =
  'https://cdn.discordapp.com/attachments/111/222/cat.png?ex=new&is=new&hm=live';

assert.equal(discordCdnUrlStableKey(expired), '/attachments/111/222/cat.png');
assert.equal(discordCdnUrlStableKey(expired), discordCdnUrlStableKey(fresh));

const freshIndex = buildDiscordMediaUrlIndexFromBotMessage({
  id: '999',
  attachments: [
    {
      url: fresh,
      proxy_url:
        'https://media.discordapp.net/attachments/111/222/cat.png?ex=new&is=new&hm=live',
      filename: 'cat.png',
      contentType: 'image/png',
    },
  ],
});
assert.equal(freshIndex.get('/attachments/111/222/cat.png'), fresh);

const urlMap = buildDiscordMediaRefreshUrlMap(
  row({
    attachments: [
      {
        url: expired,
        kind: 'image',
        filename: 'cat.png',
      },
    ],
  }),
  freshIndex,
);
assert.equal(urlMap.get(expired), fresh);

const noop = buildDiscordMediaRefreshUrlMap(
  row({
    attachments: [{ url: fresh, kind: 'image', filename: 'cat.png' }],
  }),
  freshIndex,
);
assert.equal(noop.size, 0);

console.log('discordImportCdnRefresh.test.ts: ok');
