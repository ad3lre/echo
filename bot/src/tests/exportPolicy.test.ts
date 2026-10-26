import assert from 'node:assert/strict';
import { sanitizeInviteJson, shouldAutoExportGuild } from '../exportPolicy.js';

assert.equal(shouldAutoExportGuild('1', {}), false);
assert.equal(
  shouldAutoExportGuild('1', { ECHO_DISCORD_EXPORT_GUILD_ALLOWLIST: '2, 1' }),
  true,
);
assert.equal(
  shouldAutoExportGuild('3', { ECHO_DISCORD_EXPORT_GUILD_ALLOWLIST: '2, 1' }),
  false,
);
assert.equal(
  shouldAutoExportGuild('3', { ECHO_DISCORD_AUTO_EXPORT_ALL: '1' }),
  true,
);
const inv = { code: 'abc', url: 'https://discord.gg/abc', uses: 2 };
assert.deepEqual(sanitizeInviteJson(inv, {}), { uses: 2 });
assert.deepEqual(
  sanitizeInviteJson(inv, { ECHO_DISCORD_EXPORT_INVITE_CODES: '1' }),
  inv,
);
// eslint-disable-next-line no-console
console.log('exportPolicy.test: ok');
