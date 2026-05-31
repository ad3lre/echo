import assert from 'node:assert/strict';
import { applyEchoUploadServeSecurityHeaders } from '../services/echoUploadServe';

function run(): void {
  const mockReply = {
    headers: {} as Record<string, string>,
    header(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
  };

  applyEchoUploadServeSecurityHeaders(mockReply as never, {
    contentType: 'image/png',
    coerced: false,
  });
  assert.equal(mockReply.headers['x-content-type-options'], 'nosniff');
  assert.equal(mockReply.headers['content-disposition'], undefined);

  applyEchoUploadServeSecurityHeaders(mockReply as never, {
    contentType: 'application/octet-stream',
    coerced: true,
  });
  assert.equal(mockReply.headers['content-disposition'], 'attachment');

  console.log('echoUploadServe.security: ok');
}

run();
