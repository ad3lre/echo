import { describe, expect, it } from 'vitest';
import {
  applyEchoCsrfFromAuthJson,
  clearEchoCsrfMemoryToken,
  echoCsrfHeaders,
  echoCsrfJsonHeaders,
  setEchoCsrfMemoryToken,
} from './echoCsrf';

describe('echoCsrfHeaders', () => {
  it('returns empty headers when no token is available', () => {
    clearEchoCsrfMemoryToken();
    expect(echoCsrfHeaders()).toEqual({});
  });

  it('returns X-CSRF-Token header when a memory token is set', () => {
    setEchoCsrfMemoryToken(' t1 ');
    expect(echoCsrfHeaders()).toEqual({ 'X-CSRF-Token': 't1' });
    clearEchoCsrfMemoryToken();
  });

  it('applies csrfToken from auth JSON and includes it in JSON headers', () => {
    clearEchoCsrfMemoryToken();
    applyEchoCsrfFromAuthJson({ csrfToken: 't2' });
    expect(echoCsrfJsonHeaders()).toEqual({
      'Content-Type': 'application/json',
      'X-CSRF-Token': 't2',
    });
    clearEchoCsrfMemoryToken();
  });
});
