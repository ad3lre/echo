import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyRequest } from 'fastify';
import {
  sessionClientContextFromRequest,
  sessionLocationFromRequest,
} from './sessionClientContext';

function mockReq(
  headers: Record<string, string | string[] | undefined>,
  ip = '203.0.113.10',
): FastifyRequest {
  return {
    headers,
    ip,
  } as FastifyRequest;
}

describe('sessionLocationFromRequest', () => {
  it('builds label from Cloudflare headers', () => {
    const loc = sessionLocationFromRequest(
      mockReq({
        'cf-ipcity': 'London',
        'cf-region': 'England',
        'cf-ipcountry': 'GB',
      }),
    );
    assert.equal(loc, 'London, England, GB');
  });

  it('returns null without geo headers', () => {
    assert.equal(sessionLocationFromRequest(mockReq({})), null);
  });
});

describe('sessionClientContextFromRequest', () => {
  it('clips user agent and includes location', () => {
    const ctx = sessionClientContextFromRequest(
      mockReq({
        'user-agent': 'Mozilla/5.0 Chrome/120',
        'cf-ipcity': 'Paris',
        'cf-ipcountry': 'FR',
      }),
    );
    assert.equal(ctx.userAgent, 'Mozilla/5.0 Chrome/120');
    assert.equal(ctx.location, 'Paris, FR');
  });

  it('returns nulls when request is omitted', () => {
    assert.deepEqual(sessionClientContextFromRequest(undefined), {
      userAgent: null,
      location: null,
    });
  });
});
