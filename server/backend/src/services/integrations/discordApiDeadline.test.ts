import assert from 'node:assert/strict';
import {
  discordBotCreateWebhook,
  discordBotFetchGuildChannels,
  discordBotFetchGuildName,
  discordBotIsMemberOfGuild,
  discordBotListChannelWebhooks,
  discordBotPostChannelMessage,
  fetchDiscordBotGuildIdsAll,
  fetchDiscordConnectionsCount,
  fetchDiscordGuildCount,
  fetchDiscordUserGuildsAll,
} from './discordApiClient';

async function run(): Promise<void> {
  const requests: string[] = [];
  const fetchImpl = async (
    input: Request | string | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    requests.push(String(input));
    assert.ok(
      init?.signal instanceof AbortSignal,
      'request must have deadline',
    );
    if (String(input).includes('/guilds/123?with_counts=false')) {
      return Response.json({ name: 'guild' });
    }
    if (String(input).includes('/webhooks') && init?.method === 'POST') {
      return Response.json({
        id: 'hook',
        url: 'https://discord.com/api/webhooks/hook',
      });
    }
    if (String(input).includes('/messages'))
      return new Response(null, { status: 204 });
    if (String(input).includes('/guilds/123')) return Response.json([]);
    if (String(input).includes('/webhooks')) return Response.json([]);
    return Response.json([]);
  };

  assert.equal(
    await discordBotIsMemberOfGuild('token', '123', fetchImpl),
    true,
  );
  assert.equal(
    await discordBotFetchGuildName('token', '123', fetchImpl),
    'guild',
  );
  assert.deepEqual(
    await discordBotFetchGuildChannels('token', '123', fetchImpl),
    [],
  );
  assert.deepEqual(
    await discordBotListChannelWebhooks('token', '456', fetchImpl),
    [],
  );
  assert.equal(
    (await discordBotCreateWebhook('token', '456', 'Echo', fetchImpl))?.id,
    'hook',
  );
  assert.equal(
    await discordBotPostChannelMessage('token', '456', 'hello', fetchImpl),
    true,
  );
  assert.equal(await fetchDiscordGuildCount('token', fetchImpl), 0);
  assert.deepEqual(
    await fetchDiscordBotGuildIdsAll('token', fetchImpl),
    new Set(),
  );
  assert.deepEqual(await fetchDiscordUserGuildsAll('token', fetchImpl), []);
  assert.equal(await fetchDiscordConnectionsCount('token', fetchImpl), 0);
  assert.equal(requests.length, 10);
}

void run().then(() => console.log('Discord API deadline regressions: ok'));
