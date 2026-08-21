import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  signUploadReadToken,
  verifyUploadReadToken,
} from '../../services/uploads/uploadReadToken';

describe('uploadReadToken', () => {
  it('signs and verifies read tokens for a storage key', () => {
    const key = 'echo/channels/123/media/abc.png';
    const token = signUploadReadToken(key);
    assert.equal(verifyUploadReadToken(token, key), true);
    assert.equal(verifyUploadReadToken(token, `${key}x`), false);
  });

  it('rejects tampered tokens', () => {
    const token = signUploadReadToken('echo/avatars/u1/x.png');
    assert.equal(
      verifyUploadReadToken(`${token}x`, 'echo/avatars/u1/x.png'),
      false,
    );
  });
});
