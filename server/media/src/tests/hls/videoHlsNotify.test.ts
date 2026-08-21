import assert from 'node:assert/strict';
import {
  ECHO_VIDEO_HLS_NOTIFY_CHANNEL,
  shouldNotifyEchoVideoHlsWorker,
} from '../../hls/jobs/notify';

assert.equal(shouldNotifyEchoVideoHlsWorker('embedded'), false);
assert.equal(shouldNotifyEchoVideoHlsWorker('standalone'), true);
assert.equal(ECHO_VIDEO_HLS_NOTIFY_CHANNEL, 'echo_video_hls');

console.log('videoHlsNotify.test.ts: ok');
