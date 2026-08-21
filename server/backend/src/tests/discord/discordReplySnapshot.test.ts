import { parseDiscordMessageReference } from '../../services/discordBridge/discordReplySnapshot';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const camel = parseDiscordMessageReference({
  messageId: '123',
  channelId: '456',
});
assert(camel?.messageId === '123', 'camel messageId');
assert(camel?.channelId === '456', 'camel channelId');

const snake = parseDiscordMessageReference({
  message_id: '789',
  channel_id: '012',
});
assert(snake?.messageId === '789', 'snake messageId');
assert(snake?.channelId === '012', 'snake channelId');

assert(parseDiscordMessageReference(null) === undefined, 'null');
assert(parseDiscordMessageReference({}) === undefined, 'empty');

console.log('discordReplySnapshot.test: ok');
