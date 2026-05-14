/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest';
import {
  UI_ERROR_EVENT,
  UIErrorBusEmit,
  subscribeUIErrors,
} from './uiErrorBus';

describe('uiErrorBus', () => {
  it('subscribe receives emit payload', () => {
    const fn = vi.fn();
    const off = subscribeUIErrors(fn);
    UIErrorBusEmit({
      context: 't',
      severity: 'error',
      userMessage: 'hello',
      code: 'X',
      retryable: true,
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]![0]).toMatchObject({
      context: 't',
      userMessage: 'hello',
      code: 'X',
    });
    off();
  });

  it('unsubscribe stops delivery', () => {
    const fn = vi.fn();
    const off = subscribeUIErrors(fn);
    off();
    UIErrorBusEmit({ context: 'c', severity: 'info', userMessage: 'n' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('uses expected event name', () => {
    expect(UI_ERROR_EVENT).toBe('echo-ui-error');
  });
});
