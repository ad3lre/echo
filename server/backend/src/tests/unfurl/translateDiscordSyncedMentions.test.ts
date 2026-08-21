import assert from 'node:assert/strict';
import { translateDiscordSyncedContentAndMentions } from '../../services/translateDiscordSyncedMentions';

async function run(): Promise<void> {
  const maps = {
    discordToEchoUser: new Map([['111', 'echo-user-1']]),
    discordToEchoChannel: new Map([['222', 'echo-ch-1']]),
    discordToEchoRole: new Map([['333', 'echo-role-1']]),
    echoUserDisplayName: new Map([['echo-user-1', 'Alice']]),
    echoChannelName: new Map([['echo-ch-1', 'general']]),
    echoRoleName: new Map([['echo-role-1', 'Mods']]),
  };

  const userOnly = translateDiscordSyncedContentAndMentions(
    'hey <@111> check this',
    maps,
  );
  assert.equal(userOnly.content, 'hey @Alice check this');
  assert.equal(userOnly.mentions?.length, 1);
  assert.equal(userOnly.mentions?.[0]?.kind, 'user');
  assert.equal(userOnly.mentions?.[0]?.userId, 'echo-user-1');
  assert.equal(userOnly.mentions?.[0]?.label, 'Alice');
  assert.equal(userOnly.mentions?.[0]?.start, 4);
  assert.equal(userOnly.mentions?.[0]?.end, 10);

  const multi = translateDiscordSyncedContentAndMentions(
    '<#222> ping <@&333> and <@111>',
    maps,
  );
  assert.equal(multi.content, '#general ping @Mods and @Alice');
  assert.equal(multi.mentions?.length, 3);

  const unknown = translateDiscordSyncedContentAndMentions(
    'unknown <@999>',
    maps,
  );
  assert.equal(unknown.content, 'unknown <@999>');
  assert.equal(unknown.mentions, undefined);

  const everyone = translateDiscordSyncedContentAndMentions(
    '@everyone hi',
    maps,
  );
  assert.equal(everyone.content, '@everyone hi');
  assert.equal(everyone.mentions?.[0]?.kind, 'everyone');

  console.log('translateDiscordSyncedMentions.test: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
