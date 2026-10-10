import assert from 'node:assert/strict';
import {
  runYoutubeSearchWithFallback,
  type YoutubeSearchItem,
} from './youtubeSearch';

const mirrorItem: YoutubeSearchItem = {
  id: 'abcdefghijk',
  title: 'Mirror result',
  channelTitle: 'Mirror',
  thumbnailUrl: null,
};

async function run(): Promise<void> {
  let fallbackCalls = 0;
  const fallback = async () => {
    fallbackCalls++;
    return [mirrorItem];
  };
  assert.deepEqual(
    await runYoutubeSearchWithFallback(async () => [], fallback),
    { items: [mirrorItem], source: 'invidious' },
  );
  assert.deepEqual(
    await runYoutubeSearchWithFallback(async () => {
      throw new Error('transport failed');
    }, fallback),
    { items: [mirrorItem], source: 'invidious' },
  );
  assert.equal(fallbackCalls, 2);
  assert.deepEqual(
    await runYoutubeSearchWithFallback(async () => [mirrorItem], fallback),
    { items: [mirrorItem], source: 'youtube' },
  );
  assert.equal(fallbackCalls, 2);
}

void run().then(() => console.log('YouTube provider fallback regressions: ok'));
