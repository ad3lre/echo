/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import {
  ECHO_APP_TOAST_EVENT,
  dispatchAppToast,
  dispatchAppToastDetail,
  subscribeAppToasts,
} from './controllerMissingAction';

describe('controllerMissingAction toast bus', () => {
  it('defaults toast severity to info', () => {
    const fn = vi.fn();
    const off = subscribeAppToasts(fn);

    dispatchAppToastDetail({ message: 'Hello toast' });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]![0]).toMatchObject({
      message: 'Hello toast',
      severity: 'info',
    });
    off();
  });

  it('delivers extended severities to subscribers', () => {
    const fn = vi.fn();
    const off = subscribeAppToasts(fn);

    dispatchAppToast('Everything worked', 'success');
    dispatchAppToast('Something failed', 'error');

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn.mock.calls[0]![0]).toMatchObject({
      message: 'Everything worked',
      severity: 'success',
    });
    expect(fn.mock.calls[1]![0]).toMatchObject({
      message: 'Something failed',
      severity: 'error',
    });
    off();
  });

  it('uses expected app toast event name', () => {
    expect(ECHO_APP_TOAST_EVENT).toBe('echo-app-toast');
  });
});
