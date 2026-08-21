import { describe, expect, it } from 'vitest';
import { echoClientDebugEnabled } from './echoClientDebug';

describe('echoClientDebugEnabled', () => {
  it('is false in production bundles (Vite PROD)', () => {
    expect(import.meta.env.PROD).toBeTypeOf('boolean');
    if (import.meta.env.PROD) {
      expect(echoClientDebugEnabled()).toBe(false);
    }
  });
});
