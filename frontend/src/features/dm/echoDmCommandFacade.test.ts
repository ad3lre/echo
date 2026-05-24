import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { echoT } from '@/i18n';
import { EchoApiError } from '@/api/echo/transport';
import * as echoSocialApi from '@/api/echo/social';
import {
  openEchoDirectDmChannel,
  openEchoGroupDmChannel,
} from './echoDmCommandFacade';

describe('openEchoDirectDmChannel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the trimmed channel id from the API response', async () => {
    vi.spyOn(echoSocialApi, 'postEchoOpenDm').mockResolvedValue({
      channelId: '  ch-123  ',
      peerUserId: 'p1',
    });
    const id = await openEchoDirectDmChannel('tok', 'p1', {
      timeoutMs: null,
      transientRetryDelayMs: 0,
    });
    expect(id).toBe('ch-123');
  });

  it('retries once after a transient 5xx (HTTP/2 blank-body) and succeeds', async () => {
    const transient = new EchoApiError(503, {
      code: 'UNKNOWN',
      message: '',
    });
    const spy = vi
      .spyOn(echoSocialApi, 'postEchoOpenDm')
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce({ channelId: 'ch-success', peerUserId: 'p1' });

    const id = await openEchoDirectDmChannel('tok', 'p1', {
      timeoutMs: null,
      transientRetryDelayMs: 0,
    });
    expect(id).toBe('ch-success');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('retries once after a TypeError network blip', async () => {
    const spy = vi
      .spyOn(echoSocialApi, 'postEchoOpenDm')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ channelId: 'ch-ok', peerUserId: 'p1' });

    const id = await openEchoDirectDmChannel('tok', 'p1', {
      timeoutMs: null,
      transientRetryDelayMs: 0,
    });
    expect(id).toBe('ch-ok');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on a 4xx error (e.g. NOT_FOUND, FORBIDDEN, CSRF_REQUIRED)', async () => {
    const spy = vi
      .spyOn(echoSocialApi, 'postEchoOpenDm')
      .mockRejectedValue(
        new EchoApiError(404, { code: 'NOT_FOUND', message: 'User not found' }),
      );
    await expect(
      openEchoDirectDmChannel('tok', 'p1', {
        timeoutMs: null,
        transientRetryDelayMs: 0,
      }),
    ).rejects.toBeInstanceOf(EchoApiError);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry an AbortError (user cancelled / timeout)', async () => {
    const ac = new AbortController();
    const abortErr = new DOMException('Aborted', 'AbortError');
    const spy = vi
      .spyOn(echoSocialApi, 'postEchoOpenDm')
      .mockRejectedValue(abortErr);

    await expect(
      openEchoDirectDmChannel('tok', 'p1', {
        signal: ac.signal,
        timeoutMs: null,
        transientRetryDelayMs: 0,
      }),
    ).rejects.toBe(abortErr);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('surfaces the second failure if the retry also fails', async () => {
    const first = new EchoApiError(503, { code: 'UNKNOWN', message: '' });
    const second = new EchoApiError(503, { code: 'UNKNOWN', message: '' });
    const spy = vi
      .spyOn(echoSocialApi, 'postEchoOpenDm')
      .mockRejectedValueOnce(first)
      .mockRejectedValueOnce(second);

    await expect(
      openEchoDirectDmChannel('tok', 'p1', {
        timeoutMs: null,
        transientRetryDelayMs: 0,
      }),
    ).rejects.toBe(second);
    expect(spy).toHaveBeenCalledTimes(2);
    /* The improved error message should not be the bare `UNKNOWN` placeholder. */
    expect(second.message).toBe(echoT('errors.api.serverUnavailable'));
  });
});

describe('openEchoGroupDmChannel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retries once after a transient 5xx and succeeds', async () => {
    const spy = vi
      .spyOn(echoSocialApi, 'postEchoOpenGroupDm')
      .mockRejectedValueOnce(
        new EchoApiError(502, { code: 'UNKNOWN', message: '' }),
      )
      .mockResolvedValueOnce({ channelId: 'g-ok' });
    const id = await openEchoGroupDmChannel(
      'tok',
      { memberUserIds: ['a', 'b', 'c'] },
      { timeoutMs: null, transientRetryDelayMs: 0 },
    );
    expect(id).toBe('g-ok');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 400 INVALID_BODY (validation surfaces immediately)', async () => {
    const spy = vi
      .spyOn(echoSocialApi, 'postEchoOpenGroupDm')
      .mockRejectedValue(
        new EchoApiError(400, {
          code: 'INVALID_BODY',
          message: 'memberUserIds array required',
        }),
      );
    await expect(
      openEchoGroupDmChannel(
        'tok',
        { memberUserIds: [] },
        { timeoutMs: null, transientRetryDelayMs: 0 },
      ),
    ).rejects.toBeInstanceOf(EchoApiError);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
