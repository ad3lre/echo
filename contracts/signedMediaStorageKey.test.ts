import assert from 'node:assert/strict';
import { test } from 'vitest';
import { extractStorageKeyFromMediaCdnUrl } from './mediaCdn';
import { ECHO_S3_PUBLIC_READ_THROUGH_PREFIX } from './echoS3ReadThrough';
import {
  extractStorageKeyFromEchoMediaUrl,
  ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX,
} from './echoUploadStorageKey';

test('relative signed CDN, local upload and S3 URLs exclude query and fragment', () => {
  const key = 'echo/channels/c1/file.png';
  const encoded = key.replace('file', '%66ile');
  for (const suffix of [
    '?t=secret#preview',
    '#preview',
    '?download=1&t=secret',
  ]) {
    assert.equal(
      extractStorageKeyFromMediaCdnUrl(`/v1/o/${encoded}${suffix}`),
      key,
    );
    for (const prefix of ['/v1/o/', ECHO_LOCAL_UPLOAD_PUBLIC_PREFIX]) {
      assert.equal(
        extractStorageKeyFromEchoMediaUrl(`${prefix}${encoded}${suffix}`),
        key,
      );
    }
  }
});
