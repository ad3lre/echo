import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isEchoApiGlobalRateLimitExempt,
  isEchoApiReadRequest,
  isEchoReadStateWriteRequest,
} from '../../bootstrap/echoReadRateLimitPaths';

describe('echoReadRateLimitPaths', () => {
  it('classifies Echo GET reads', () => {
    assert.equal(
      isEchoApiReadRequest('GET', '/api/v1/echo/channels/abc/messages'),
      true,
    );
    assert.equal(
      isEchoApiReadRequest('GET', '/api/v1/echo/channels/read-state'),
      true,
    );
    assert.equal(
      isEchoApiReadRequest('PUT', '/api/v1/echo/channels/abc/messages'),
      false,
    );
  });

  it('classifies read-state PUT writes separately from generic mutations', () => {
    assert.equal(
      isEchoReadStateWriteRequest(
        'PUT',
        '/api/v1/echo/channels/1492135186257805312/read-state',
      ),
      true,
    );
    assert.equal(
      isEchoReadStateWriteRequest('PUT', '/api/v1/echo/channels/abc/messages'),
      false,
    );
    assert.equal(
      isEchoReadStateWriteRequest(
        'GET',
        '/api/v1/echo/channels/abc/read-state',
      ),
      false,
    );
  });

  it('exempts read-state PUT from the global mutation bucket', () => {
    assert.equal(
      isEchoApiGlobalRateLimitExempt(
        'PUT',
        '/api/v1/echo/channels/abc/read-state',
      ),
      true,
    );
    assert.equal(
      isEchoApiGlobalRateLimitExempt(
        'POST',
        '/api/v1/echo/channels/abc/messages',
      ),
      false,
    );
  });

  it('exempts GET /auth/me from the global mutation bucket', () => {
    assert.equal(
      isEchoApiGlobalRateLimitExempt('GET', '/api/v1/auth/me?recoverProbe=1'),
      true,
    );
    assert.equal(
      isEchoApiGlobalRateLimitExempt('PATCH', '/api/v1/auth/me'),
      false,
    );
  });

  it('exempts GET /system/instance-policy from the global mutation bucket', () => {
    assert.equal(
      isEchoApiGlobalRateLimitExempt('GET', '/api/v1/system/instance-policy'),
      true,
    );
    assert.equal(
      isEchoApiGlobalRateLimitExempt('POST', '/api/v1/system/instance-policy'),
      false,
    );
  });
});
