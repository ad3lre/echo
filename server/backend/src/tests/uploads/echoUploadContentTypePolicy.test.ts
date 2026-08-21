import assert from 'node:assert/strict';
import {
  sanitizeEchoUploadContentType,
  sanitizeEchoUploadServeContentType,
} from '../../services/uploads/echoUploadContentTypePolicy';

function run(): void {
  assert.equal(
    sanitizeEchoUploadContentType('text/html').contentType,
    'application/octet-stream',
  );
  assert.equal(sanitizeEchoUploadContentType('text/html').coerced, true);
  assert.equal(
    sanitizeEchoUploadContentType('image/svg+xml').contentType,
    'application/octet-stream',
  );
  assert.equal(
    sanitizeEchoUploadContentType('image/png').contentType,
    'image/png',
  );
  assert.equal(sanitizeEchoUploadContentType('image/png').coerced, false);

  const poisoned = sanitizeEchoUploadServeContentType(
    'text/html',
    'avatars/user/abc.png',
  );
  assert.equal(poisoned.contentType, 'application/octet-stream');
  assert.equal(poisoned.coerced, true);

  const svgKey = sanitizeEchoUploadServeContentType('', 'emoji/icon.svg');
  assert.equal(svgKey.contentType, 'application/octet-stream');
  assert.equal(svgKey.coerced, true);

  console.log('echoUploadContentTypePolicy: ok');
}

run();
