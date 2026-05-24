import assert from 'node:assert/strict';
import {
  discordBridgeSyncStateKey,
  formatDiscordBridgeSyncNoticeContent,
  shouldPostDiscordBridgeSyncNotice,
} from '../services/discordBridgeSyncNotice';

async function run(): Promise<void> {
  assert.equal(discordBridgeSyncStateKey(false, false), '');
  assert.equal(discordBridgeSyncStateKey(true, false), 'i');
  assert.equal(discordBridgeSyncStateKey(false, true), 'o');
  assert.equal(discordBridgeSyncStateKey(true, true), 'io');

  assert.match(formatDiscordBridgeSyncNoticeContent(true, true), /both ways/);
  assert.match(
    formatDiscordBridgeSyncNoticeContent(true, false),
    /Discord → Echo/,
  );
  assert.match(
    formatDiscordBridgeSyncNoticeContent(false, true),
    /Echo → Discord/,
  );
  assert.equal(formatDiscordBridgeSyncNoticeContent(false, false), '');

  assert.equal(
    shouldPostDiscordBridgeSyncNotice(false, false, true, false),
    true,
  );
  assert.equal(
    shouldPostDiscordBridgeSyncNotice(true, false, true, true),
    true,
  );
  assert.equal(
    shouldPostDiscordBridgeSyncNotice(true, true, true, true),
    false,
  );
  assert.equal(
    shouldPostDiscordBridgeSyncNotice(true, false, false, false),
    false,
  );
  assert.equal(
    shouldPostDiscordBridgeSyncNotice(true, true, true, false),
    false,
  );
}

run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('discordBridgeSyncNotice.unit: ok');
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('discordBridgeSyncNotice.unit failed', err);
    process.exit(1);
  });
