import assert from 'node:assert/strict';
import {
  isCorruptedDiscordImportPfp,
  needsDiscordImportPfpRepair,
} from '../../services/discordImport/discordImportAvatarMirror';
import { parseDiscordUserIdFromAvatarCdnUrl } from '../../domain/discord/discordNormalized';
import { resolveDiscordUserIdForPfpBackfill } from '../../services/discordImport/discordImportAvatarPfpBackfill';

function run(): void {
  assert.equal(
    isCorruptedDiscordImportPfp(
      'https://cdn.discordapp.com/avatars/123456789012345678/abc.webp?size=128',
    ),
    true,
  );
  assert.equal(
    isCorruptedDiscordImportPfp(
      'https://cdn.discordapp.com/embed/avatars/2.png',
    ),
    true,
  );
  assert.equal(isCorruptedDiscordImportPfp('a_abc123def456'), true);
  assert.equal(
    isCorruptedDiscordImportPfp('0123456789abcdef0123456789abcdef'),
    true,
  );
  assert.equal(isCorruptedDiscordImportPfp('data:image/svg+xml,abc'), false);
  assert.equal(isCorruptedDiscordImportPfp(''), false);
  assert.equal(isCorruptedDiscordImportPfp('data:image/png;base64,abc'), false);

  assert.equal(needsDiscordImportPfpRepair('', '123456789012345678'), true);
  assert.equal(needsDiscordImportPfpRepair('', ''), false);
  assert.equal(
    needsDiscordImportPfpRepair(
      'https://cdn.discordapp.com/avatars/123456789012345678/abc.webp?size=128',
      '123456789012345678',
    ),
    true,
  );
  assert.equal(
    needsDiscordImportPfpRepair('https://echo.example/uploads/u1.webp', '123'),
    false,
  );

  assert.equal(
    parseDiscordUserIdFromAvatarCdnUrl(
      'https://cdn.discordapp.com/avatars/999888777666555444/a_abc.gif?size=64',
    ),
    '999888777666555444',
  );
  assert.equal(
    parseDiscordUserIdFromAvatarCdnUrl(
      'https://cdn.discordapp.com/embed/avatars/0.png',
    ),
    null,
  );

  assert.equal(
    resolveDiscordUserIdForPfpBackfill({
      pfp: 'https://cdn.discordapp.com/embed/avatars/0.png',
      shadowDiscordUserId: '123',
      linkedDiscordUserId: null,
    }),
    '123',
  );
  assert.equal(
    resolveDiscordUserIdForPfpBackfill({
      pfp: 'https://cdn.discordapp.com/avatars/555444333222111000/x.webp',
      shadowDiscordUserId: null,
      linkedDiscordUserId: null,
    }),
    '555444333222111000',
  );
}

run();
console.log('discordImportAvatarPfpBackfill.test.ts: ok');
