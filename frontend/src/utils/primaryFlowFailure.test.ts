import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EchoApiError } from '@/api/echo/transport';
import {
  isBenignPrimaryFlowError,
  isChannelScopedFetchFlow,
  primaryFlowFailureSuggestsBackendUnreachable,
  PRIMARY_FLOW_FAILURE_EVENT,
  reportPrimaryFlowFailure,
  type PrimaryFlowFailureDetail,
} from './primaryFlowFailure';

function d(
  partial: Partial<PrimaryFlowFailureDetail>,
): PrimaryFlowFailureDetail {
  return {
    flow: partial.flow ?? 'test',
    message: partial.message ?? 'x',
    ...partial,
  };
}

describe('isBenignPrimaryFlowError', () => {
  it('treats deleted channel and stale DM access as benign', () => {
    expect(
      isBenignPrimaryFlowError(
        new EchoApiError(404, {
          code: 'NOT_FOUND',
          message: 'This channel does not exist or was deleted.',
          detail: 'CHANNEL_NOT_FOUND',
        }),
        'fetchEchoChannelMessages',
      ),
    ).toBe(true);
    expect(
      isBenignPrimaryFlowError(
        new EchoApiError(403, {
          code: 'FORBIDDEN',
          message: 'Not a member',
          detail: 'GROUP_DM_NOT_MEMBER',
        }),
        'fetchEchoChannelPins',
      ),
    ).toBe(true);
  });

  it('treats view-denied prefetch errors as benign', () => {
    expect(
      isBenignPrimaryFlowError(
        new EchoApiError(403, {
          code: 'FORBIDDEN',
          message: 'Missing View Channel permission overwrite',
        }),
        'prefetchChannelHover',
      ),
    ).toBe(true);
  });

  it('treats AbortError as benign', () => {
    expect(
      isBenignPrimaryFlowError(new DOMException('aborted', 'AbortError')),
    ).toBe(true);
  });

  it('does not treat unrelated 404s as benign', () => {
    expect(
      isBenignPrimaryFlowError(
        new EchoApiError(404, {
          code: 'NOT_FOUND',
          message: 'User not found',
        }),
        'fetchEchoUserPublicProfile',
      ),
    ).toBe(false);
  });
});

describe('reportPrimaryFlowFailure', () => {
  const eventTarget = new EventTarget();

  beforeEach(() => {
    vi.stubGlobal('window', eventTarget);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not dispatch benign channel fetch failures', () => {
    const handler = vi.fn();
    window.addEventListener(PRIMARY_FLOW_FAILURE_EVENT, handler);
    try {
      reportPrimaryFlowFailure(
        'fetchEchoChannelMessages',
        new EchoApiError(404, {
          code: 'NOT_FOUND',
          message: 'This channel does not exist or was deleted.',
          detail: 'CHANNEL_NOT_FOUND',
        }),
        { cid: 'ch-deleted' },
      );
      expect(handler).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(PRIMARY_FLOW_FAILURE_EVENT, handler);
    }
  });

  it('suppresses banner for channel-scoped fetch flows but still dispatches', () => {
    const handler = vi.fn();
    window.addEventListener(PRIMARY_FLOW_FAILURE_EVENT, handler);
    try {
      reportPrimaryFlowFailure(
        'fetchEchoChannelMessages',
        new EchoApiError(503, {
          code: 'UNKNOWN',
          message: 'Service unavailable',
        }),
        { cid: 'ch-1' },
      );
      expect(handler).toHaveBeenCalledTimes(1);
      const detail = (handler.mock.calls[0]![0] as CustomEvent)
        .detail as PrimaryFlowFailureDetail;
      expect(detail.suppressBanner).toBe(true);
      expect(detail.context?.httpStatus).toBe(503);
    } finally {
      window.removeEventListener(PRIMARY_FLOW_FAILURE_EVENT, handler);
    }
  });

  it('still dispatches create-channel failures with suppressBanner when showBanner is false', () => {
    const handler = vi.fn();
    window.addEventListener(PRIMARY_FLOW_FAILURE_EVENT, handler);
    try {
      reportPrimaryFlowFailure(
        'createEchoChannel',
        new EchoApiError(409, {
          code: 'CONFLICT',
          message: 'Channel name taken',
        }),
        { sid: 's1' },
        { showBanner: false },
      );
      expect(handler).toHaveBeenCalledTimes(1);
      const detail = (handler.mock.calls[0]![0] as CustomEvent)
        .detail as PrimaryFlowFailureDetail;
      expect(detail.suppressBanner).toBe(true);
    } finally {
      window.removeEventListener(PRIMARY_FLOW_FAILURE_EVENT, handler);
    }
  });
});

describe('isChannelScopedFetchFlow', () => {
  it('includes message history and prefetch flows', () => {
    expect(isChannelScopedFetchFlow('fetchEchoChannelMessages')).toBe(true);
    expect(isChannelScopedFetchFlow('prefetchChannelHover')).toBe(true);
    expect(isChannelScopedFetchFlow('createEchoChannel')).toBe(false);
  });
});

describe('primaryFlowFailureSuggestsBackendUnreachable', () => {
  it('returns true for core outage flows', () => {
    expect(
      primaryFlowFailureSuggestsBackendUnreachable(
        d({ flow: 'restoreSessionFromApi' }),
      ),
    ).toBe(true);
    expect(
      primaryFlowFailureSuggestsBackendUnreachable(
        d({ flow: 'socket.connect_error' }),
      ),
    ).toBe(true);
    expect(
      primaryFlowFailureSuggestsBackendUnreachable(
        d({ flow: 'hydrateEchoFromApi' }),
      ),
    ).toBe(true);
    expect(
      primaryFlowFailureSuggestsBackendUnreachable(
        d({ flow: 'refreshEchoSocialFromApi' }),
      ),
    ).toBe(true);
  });

  it('returns true when context reports HTTP 5xx', () => {
    expect(
      primaryFlowFailureSuggestsBackendUnreachable(
        d({ flow: 'someOtherFlow', context: { httpStatus: 503 } }),
      ),
    ).toBe(true);
  });

  it('returns false when the failure was marked suppressBanner', () => {
    expect(
      primaryFlowFailureSuggestsBackendUnreachable(
        d({ flow: 'refreshEchoSocialFromApi', suppressBanner: true }),
      ),
    ).toBe(false);
  });

  it('returns false for unrelated flows without 5xx', () => {
    expect(
      primaryFlowFailureSuggestsBackendUnreachable(
        d({ flow: 'iconPrefetch', context: { httpStatus: 404 } }),
      ),
    ).toBe(false);
  });
});
