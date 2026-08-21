import assert from 'node:assert/strict';
import { guessEchoUploadContentTypeFromKey } from './echoUploadServe';

assert.equal(
  guessEchoUploadContentTypeFromKey('echo/channels/c/u/clip/hls/master.m3u8'),
  'application/vnd.apple.mpegurl',
);
assert.equal(
  guessEchoUploadContentTypeFromKey('echo/channels/c/u/clip/hls/v0_seg001.m4s'),
  'video/iso.segment',
);
assert.equal(
  guessEchoUploadContentTypeFromKey('echo/channels/c/u/clip/hls/v0_init.mp4'),
  'video/mp4',
);

console.log('echoUploadServe.test.ts ok');
