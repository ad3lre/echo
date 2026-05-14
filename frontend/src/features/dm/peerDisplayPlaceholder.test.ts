import { describe, expect, it } from 'vitest';
import { peerDisplayNamePlaceholder } from './peerDisplayPlaceholder';

describe('peerDisplayNamePlaceholder', () => {
  it('returns short ids unchanged', () => {
    expect(peerDisplayNamePlaceholder('abc')).toBe('abc');
    expect(peerDisplayNamePlaceholder('123456789012')).toBe('123456789012');
  });

  it('truncates long ids', () => {
    expect(peerDisplayNamePlaceholder('snowflake_123456789012345678')).toBe(
      'snowfl…5678',
    );
  });

  it('trims input', () => {
    expect(peerDisplayNamePlaceholder('  x  ')).toBe('x');
  });

  it('uses Member for empty', () => {
    expect(peerDisplayNamePlaceholder('')).toBe('Member');
    expect(peerDisplayNamePlaceholder('   ')).toBe('Member');
  });
});
