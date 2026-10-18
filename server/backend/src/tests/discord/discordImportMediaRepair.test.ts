import assert from 'node:assert/strict';
import {
  buildForceRestoreMediaPatchFromBotMessage,
  collectEchoMirroredDiscordImportStorageKeys,
} from '../../services/discordImport/discordImportMediaRepair';
import type { EchoMessageRow } from '../../domain/echoMessagesDal';

const baseRow = (): EchoMessageRow => ({
  id: '111',
  channelId: 'ch1',
  authorId: 'u1',
  content: 'hi',
  timestamp: new Date().toISOString(),
  bridgeSource: 'discord_import',
  attachments: [
    {
      url: '/api/v1/echo/uploads/files/echo/channels/ch1/u1/discord-import-media-abc123.png',
      kind: 'image',
      filename: 'pic.png',
      mimeType: 'image/png',
    },
  ],
});

{
  const keys = collectEchoMirroredDiscordImportStorageKeys(baseRow());
  assert.equal(keys.length, 1);
  assert.equal(keys[0], 'echo/channels/ch1/u1/discord-import-media-abc123.png');
}

{
  const patch = buildForceRestoreMediaPatchFromBotMessage(baseRow(), {
    id: '111',
    attachments: [
      {
        url: 'https://cdn.discordapp.com/attachments/1/2/pic.png?ex=abc',
        filename: 'pic.png',
        contentType: 'image/png',
        size: 12,
      },
    ],
  });
  assert.ok(Array.isArray(patch.attachments));
  assert.equal(patch.attachments!.length, 1);
  assert.match(
    patch.attachments![0]!.url,
    /^https:\/\/cdn\.discordapp\.com\/attachments\//,
  );
  assert.equal(patch.imageUrl, undefined);
}

console.log('discordImportMediaRepair.test: ok');
