import { describe, expect, it } from 'vitest';
import { isEchoAuthUserId, isEchoGraphId, isEchoUuid } from './echoIds';

describe('isEchoUuid', () => {
  it('accepts lowercase UUID v4-shaped strings', () => {
    expect(isEchoUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects non-UUID strings', () => {
    expect(isEchoUuid('not-a-uuid')).toBe(false);
    expect(isEchoUuid('')).toBe(false);
  });
});

describe('isEchoAuthUserId', () => {
  it('accepts legacy UUID and snowflake user ids', () => {
    expect(isEchoAuthUserId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isEchoAuthUserId('123456789012345')).toBe(true);
  });

  it('rejects mock-style ids', () => {
    expect(isEchoAuthUserId('u1')).toBe(false);
  });
});

describe('isEchoGraphId', () => {
  it('accepts UUIDs', () => {
    expect(isEchoGraphId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('trims whitespace before checking', () => {
    expect(isEchoGraphId('  550e8400-e29b-41d4-a716-446655440000  ')).toBe(
      true,
    );
  });

  it('accepts decimal snowflake strings in ADR range', () => {
    expect(isEchoGraphId('123456789012345')).toBe(true);
  });

  it('rejects too-short digit-only ids', () => {
    expect(isEchoGraphId('12345678901234')).toBe(false);
  });
});
