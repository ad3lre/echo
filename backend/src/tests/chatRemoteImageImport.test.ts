import assert from 'node:assert/strict';
import { importChatRemoteImage } from '../services/chatRemoteImageImport';

async function testRejectsEmptyUrl() {
  const result = await importChatRemoteImage({
    pool: {} as never,
    userId: 'user-1',
    channelId: 'ch-1',
    sourceUrl: '   ',
    maxBytes: 8 * 1024 * 1024,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'INVALID_BODY');
}

async function testRejectsPrivateUrl() {
  const result = await importChatRemoteImage({
    pool: {} as never,
    userId: 'user-1',
    channelId: 'ch-1',
    sourceUrl: 'https://127.0.0.1/secret.png',
    maxBytes: 8 * 1024 * 1024,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'REMOTE_IMAGE_FETCH_FAILED');
}

async function testPassthroughTenorGifWithoutFetch() {
  const url = 'https://media.tenor.com/abc123/tenor.gif';
  const result = await importChatRemoteImage({
    pool: {} as never,
    userId: 'user-1',
    channelId: 'ch-1',
    sourceUrl: url,
    maxBytes: 8 * 1024 * 1024,
  });
  assert.equal(result.ok, true, result.ok ? '' : result.message);
  if (!result.ok) return;
  assert.equal(result.url, url);
  assert.equal(result.passthrough, true);
  assert.equal(result.storageKey, undefined);
}

async function main() {
  await testRejectsEmptyUrl();
  await testRejectsPrivateUrl();
  await testPassthroughTenorGifWithoutFetch();
  console.log('chatRemoteImageImport.test.ts: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
