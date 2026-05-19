import { describe, expect, it } from 'vitest';
import { useMockDataModeOffComputed } from './useMockDataModeOffComputed';

describe('useMockDataModeOffComputed', () => {
  it('is always false', () => {
    const c = useMockDataModeOffComputed();
    expect(c.value).toBe(false);
  });
});
