/**
 * VC Watch Together storage key helpers.
 * Run: node --import tsx server/backend/src/tests/voice/vcWatchTogetherStorageKey.test.ts
 */
import assert from 'node:assert/strict';
import {
  buildVcWatchTogetherGlobalStorageKey,
  parseVcWatchTogetherStorageKey,
  isVcWatchTogetherUploadStorageKey,
  vcWatchTogetherGlobalLibraryPrefix,
} from '../../../../../contracts/echoUploadStorageKey';

function run(): void {
  const globalKey = buildVcWatchTogetherGlobalStorageKey(
    'user-1',
    'abc-video.mp4',
  );
  assert.equal(globalKey, 'echo/vc-watch/u/user-1/abc-video.mp4');

  const legacyKey = 'echo/vc-watch/ch-9/user-1/old.mp4';
  assert.deepEqual(parseVcWatchTogetherStorageKey(globalKey), {
    kind: 'global',
    ownerUserId: 'user-1',
  });
  assert.deepEqual(parseVcWatchTogetherStorageKey(legacyKey), {
    kind: 'legacy',
    channelId: 'ch-9',
    ownerUserId: 'user-1',
  });
  assert.equal(isVcWatchTogetherUploadStorageKey(globalKey), true);
  assert.equal(isVcWatchTogetherUploadStorageKey(legacyKey), true);
  assert.equal(
    isVcWatchTogetherUploadStorageKey('echo/channels/x/u/f.mp4'),
    false,
  );
  assert.equal(
    vcWatchTogetherGlobalLibraryPrefix('user-1'),
    'echo/vc-watch/u/user-1/',
  );

  console.log('vcWatchTogetherStorageKey.test.ts ok');
}

run();
