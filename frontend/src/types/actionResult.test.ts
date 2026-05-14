import { describe, expect, it } from 'vitest';
import { failResult, okResult, toFailResultFromUnknown } from './actionResult';

describe('actionResult', () => {
  it('okResult', () => {
    expect(okResult()).toEqual({ ok: true });
  });

  it('failResult', () => {
    const r = failResult('E', 'msg', true);
    expect(r.ok).toBe(false);
    expect(r.error).toEqual({ code: 'E', userMessage: 'msg', retryable: true });
  });

  it('toFailResultFromUnknown with Error', () => {
    const r = toFailResultFromUnknown(new Error('x'), 'C', 'base', false);
    expect(r.ok).toBe(false);
    expect(r.error?.userMessage).toContain('base');
    expect(r.error?.userMessage).toContain('x');
  });
});
