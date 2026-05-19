import assert from 'node:assert/strict';
import {
  parseEchoChannelWebhookExecuteQuery,
  translateSlackIncomingWebhookBody,
  translateGitHubWebhookBody,
} from '../services/echoChannelWebhookExecute';
import { serializeEchoRowForDiscordWebhookExecuteWait } from '../services/discordWebhookExecuteSerialization';
import type { EchoMessageRow } from '../domain/echoMessagesDal';

function run(): void {
  assert.deepEqual(parseEchoChannelWebhookExecuteQuery({}), {
    withComponents: true,
  });
  assert.deepEqual(
    parseEchoChannelWebhookExecuteQuery({
      wait: 'true',
      thread_id: 'abc',
      with_components: 'false',
    }),
    { wait: true, threadId: 'abc', withComponents: false },
  );

  const slack = translateSlackIncomingWebhookBody({ text: 'hi', username: 'bot' });
  assert.equal(slack?.content, 'hi');
  assert.equal(slack?.username, 'bot');
  assert.equal(translateSlackIncomingWebhookBody({ blocks: [] }), null);

  const gh = translateGitHubWebhookBody({
    comment: { body: 'lgtm' },
  });
  assert.equal(gh?.content, 'lgtm');

  const row: EchoMessageRow = {
    id: '1',
    channelId: 'ch',
    authorId: 'echo_internal_webhook_actor_v1',
    content: 'x',
    timestamp: new Date(0).toISOString(),
    sourceWebhookId: 'wh1',
    webhookUsername: 'Hooky',
    tts: true,
    messageFlags: 4,
    embeds: [{ title: 't' }],
    attachments: [],
  };
  const ser = serializeEchoRowForDiscordWebhookExecuteWait(row);
  assert.equal(ser.tts, true);
  assert.equal(ser.flags, 4);
  assert.deepEqual(ser.embeds, []);

  console.log('echoChannelWebhookExecute.unit: ok');
}

run();
