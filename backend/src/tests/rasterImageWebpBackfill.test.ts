import assert from 'node:assert/strict';
import { webpStorageKeyForRasterKey } from '../services/rasterImageWebpBackfill';

function testWebpKeyMigration() {
  assert.equal(
    webpStorageKeyForRasterKey(
      'echo/channels/c1/u1/discord-import-media-123.png',
    ),
    'echo/channels/c1/u1/discord-import-media-123.webp',
  );
  assert.equal(
    webpStorageKeyForRasterKey('echo/avatars/u1/discord-import-avatar-1.jpeg'),
    'echo/avatars/u1/discord-import-avatar-1.webp',
  );
  assert.equal(
    webpStorageKeyForRasterKey('echo/channels/c1/u1/clip.gif'),
    null,
  );
  assert.equal(
    webpStorageKeyForRasterKey('echo/channels/c1/u1/already.webp'),
    null,
  );
}

async function main() {
  testWebpKeyMigration();
  console.log('rasterImageWebpBackfill.test.ts: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
