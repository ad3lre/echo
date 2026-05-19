import { describe, expect, it, vi } from 'vitest';
import { ingestEchoSocketConnectError } from '../socketConnectErrorIngest';
import * as primaryFlow from '@/utils/primaryFlowFailure';

describe('ingestEchoSocketConnectError', () => {
  it('returns early on xhr poll error when reload guard triggers', () => {
    const tryReloadForXhrPollError = vi.fn(() => true);
    const report = vi
      .spyOn(primaryFlow, 'reportPrimaryFlowFailure')
      .mockImplementation(() => {});

    ingestEchoSocketConnectError(new Error('xhr poll error'), {
      devPortHint: '5174',
      restoreSessionFromApi: vi.fn(),
      tryReloadForXhrPollError,
    });

    expect(tryReloadForXhrPollError).toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
    report.mockRestore();
  });

  it('reports primary flow when not reloading', () => {
    const tryReloadForXhrPollError = vi.fn(() => false);
    const report = vi
      .spyOn(primaryFlow, 'reportPrimaryFlowFailure')
      .mockImplementation(() => {});

    ingestEchoSocketConnectError(new Error('network down'), {
      devPortHint: '5174',
      restoreSessionFromApi: vi.fn(),
      tryReloadForXhrPollError,
    });

    expect(report).toHaveBeenCalledWith(
      'socket.connect_error',
      expect.any(Error),
      { devPortHint: '5174' },
      expect.objectContaining({
        userMessage: expect.stringMatching(/realtime/i),
      }),
    );
    report.mockRestore();
  });

  it('skips primary flow when caller throttle suppresses it', () => {
    const tryReloadForXhrPollError = vi.fn(() => false);
    const report = vi
      .spyOn(primaryFlow, 'reportPrimaryFlowFailure')
      .mockImplementation(() => {});

    ingestEchoSocketConnectError(new Error('network down'), {
      devPortHint: '5174',
      restoreSessionFromApi: vi.fn(),
      tryReloadForXhrPollError,
      shouldReportPrimaryFlow: () => false,
    });

    expect(report).not.toHaveBeenCalled();
    report.mockRestore();
  });

  it('calls restoreSessionFromApi on 401/403 in message', () => {
    const tryReloadForXhrPollError = vi.fn(() => false);
    vi.spyOn(primaryFlow, 'reportPrimaryFlowFailure').mockImplementation(
      () => {},
    );
    const restore = vi.fn().mockResolvedValue(undefined);

    ingestEchoSocketConnectError(new Error('server error 401'), {
      devPortHint: '5174',
      restoreSessionFromApi: restore,
      tryReloadForXhrPollError,
    });

    expect(restore).toHaveBeenCalled();
  });
});
