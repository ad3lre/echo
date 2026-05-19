import { describe, expect, it } from 'vitest';
import type { MessageFailedCode } from '@shared/types';
import { realtimeMessageFailedUserMessage } from './realtimeMessageFailedUserMessage';

const ALL_CODES: MessageFailedCode[] = [
  'RATE_LIMIT',
  'SLOWMODE',
  'SPAM_FILTER',
  'VALIDATION',
  'FORBIDDEN',
  'PERSIST_FAILED',
  'E2EE_STORAGE_UNAVAILABLE',
  'UNAUTHENTICATED',
  'UNKNOWN_CHANNEL',
  'IDEMPOTENCY_EXPIRED',
  'GUEST_LIMIT',
  'GUEST_ABUSE_COOLDOWN',
];

describe('realtimeMessageFailedUserMessage', () => {
  it('covers every MessageFailedCode without throwing', () => {
    for (const code of ALL_CODES) {
      expect(realtimeMessageFailedUserMessage(code, '')).toBeTruthy();
      expect(
        realtimeMessageFailedUserMessage(code, '  server detail  '),
      ).toBeTruthy();
    }
  });

  it('RATE_LIMIT uses fixed copy regardless of detail', () => {
    expect(realtimeMessageFailedUserMessage('RATE_LIMIT', '')).toBe(
      'Too many actions. Wait a moment and try again.',
    );
    expect(realtimeMessageFailedUserMessage('RATE_LIMIT', 'ignored')).toBe(
      'Too many actions. Wait a moment and try again.',
    );
  });

  it('SPAM_FILTER prefers server detail when present', () => {
    expect(realtimeMessageFailedUserMessage('SPAM_FILTER', '')).toBe(
      'Spam filter blocked that message. Wait a bit and try again.',
    );
    expect(
      realtimeMessageFailedUserMessage('SPAM_FILTER', 'too many repeats'),
    ).toBe('too many repeats');
  });

  it('VALIDATION prefers raw detail when present', () => {
    expect(realtimeMessageFailedUserMessage('VALIDATION', '')).toBe(
      'That change was rejected.',
    );
    expect(realtimeMessageFailedUserMessage('VALIDATION', 'not_found')).toBe(
      'not_found',
    );
  });

  it('GUEST_LIMIT and GUEST_ABUSE_COOLDOWN fall back when detail empty', () => {
    expect(realtimeMessageFailedUserMessage('GUEST_LIMIT', '')).toBe(
      'Action temporarily blocked. Try again later.',
    );
    expect(realtimeMessageFailedUserMessage('GUEST_ABUSE_COOLDOWN', '')).toBe(
      'Action temporarily blocked. Try again later.',
    );
    expect(
      realtimeMessageFailedUserMessage('GUEST_LIMIT', 'custom reason'),
    ).toBe('custom reason');
  });
});
