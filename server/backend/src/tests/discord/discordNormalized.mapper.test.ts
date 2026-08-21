import assert from 'node:assert/strict';
import {
  discordAvatarIdentityKey,
  mapDiscordUserToNormalized,
  parseDiscordAvatarHashFromCdnUrl,
  resolveDiscordAvatarForStorage,
} from '../../domain/discord/discordNormalized';

async function run(): Promise<void> {
  const n = mapDiscordUserToNormalized({
    id: '123',
    username: 'echo_user',
    global_name: 'Echo User',
    avatar: 'abcdef',
    email: 'a@b.c',
    verified: true,
    premium_type: 1,
  });
  assert.equal(n.v, 1);
  assert.equal(n.discordUserId, '123');
  assert.equal(n.username, 'echo_user');
  assert.equal(n.globalName, 'Echo User');
  assert.equal(n.avatarHash, 'abcdef');
  assert.ok(n.avatarUrl?.includes('cdn.discordapp.com'));
  assert.equal(n.emailPresent, true);
  assert.equal(n.premiumType, 1);
  assert.equal(n.guildCount, null);
  assert.equal(n.connectionsCount, null);
  assert.equal(n.bannerHash, null);
  assert.equal(n.bannerUrl, null);

  const withBanner = mapDiscordUserToNormalized({
    id: '456',
    username: 'banner_user',
    banner: 'abc123',
  });
  assert.equal(withBanner.bannerHash, 'abc123');
  assert.ok(withBanner.bannerUrl?.includes('cdn.discordapp.com/banners/'));

  const minimal = mapDiscordUserToNormalized({
    id: '999',
    username: 'minimal',
  });
  assert.equal(minimal.globalName, null);
  assert.equal(minimal.emailPresent, false);

  const fromHash = resolveDiscordAvatarForStorage('123456789012345678', 'abc');
  assert.ok(fromHash.startsWith('https://cdn.discordapp.com/avatars/'));
  assert.ok(fromHash.includes('/123456789012345678/'));

  const canonicalFromUrl = resolveDiscordAvatarForStorage(
    '123',
    'https://cdn.discordapp.com/avatars/123/x.webp?size=256',
  );
  assert.equal(
    canonicalFromUrl,
    'https://cdn.discordapp.com/avatars/123/x.webp?size=128',
  );

  assert.equal(
    parseDiscordAvatarHashFromCdnUrl(
      '123',
      'https://cdn.discordapp.com/avatars/123/a_abc.gif?size=64',
    ),
    'a_abc',
  );
  assert.equal(parseDiscordAvatarHashFromCdnUrl('999', canonicalFromUrl), null);

  assert.equal(
    discordAvatarIdentityKey(
      '123',
      'https://cdn.discordapp.com/avatars/123/x.webp?size=256',
    ),
    discordAvatarIdentityKey('123', 'x'),
  );

  const defaultAv = resolveDiscordAvatarForStorage('123456789012345678', null);
  assert.ok(defaultAv.startsWith('https://cdn.discordapp.com/embed/avatars/'));
}

void run()
  .then(() => {
    console.log('discordNormalized.mapper.test.ts: ok');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
