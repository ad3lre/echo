import { describe, expect, it } from 'vitest';
import {
  primaryFlowFailureSuggestsBackendUnreachable,
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

  it('returns false for unrelated flows without 5xx', () => {
    expect(
      primaryFlowFailureSuggestsBackendUnreachable(
        d({ flow: 'iconPrefetch', context: { httpStatus: 404 } }),
      ),
    ).toBe(false);
  });
});
