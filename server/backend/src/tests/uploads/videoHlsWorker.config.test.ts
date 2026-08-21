import assert from 'node:assert/strict';
import { parseEchoVideoHlsWorker } from '../../config';

assert.equal(parseEchoVideoHlsWorker(undefined), 'embedded');
assert.equal(parseEchoVideoHlsWorker(''), 'embedded');
assert.equal(parseEchoVideoHlsWorker('embedded'), 'embedded');
assert.equal(parseEchoVideoHlsWorker('EMBEDDED'), 'embedded');
assert.equal(parseEchoVideoHlsWorker('standalone'), 'standalone');
assert.equal(parseEchoVideoHlsWorker('  standalone  '), 'standalone');

assert.throws(
  () => parseEchoVideoHlsWorker('external'),
  /Invalid ECHO_VIDEO_HLS_WORKER/,
);

console.log('videoHlsWorker.config.test.ts: ok');
