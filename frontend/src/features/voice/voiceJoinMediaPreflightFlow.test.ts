// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { assertVoiceJoinMediaReady, requestAppTwoChoice } = vi.hoisted(() => ({
  assertVoiceJoinMediaReady: vi.fn(),
  requestAppTwoChoice: vi.fn(),
}));

vi.mock('@/features/voice/voiceJoinMediaPreflight', () => ({
  assertVoiceJoinMediaReady,
  VoiceJoinMediaPreflightError: class VoiceJoinMediaPreflightError extends Error {},
}));

vi.mock('@/utils/appDialogs', () => ({
  requestAppTwoChoice,
}));

import { VoiceJoinMediaPreflightError } from '@/features/voice/voiceJoinMediaPreflight';
import { runVoiceJoinMediaPreflightInteractive } from '@/features/voice/voiceJoinMediaPreflightFlow';

describe('runVoiceJoinMediaPreflightInteractive', () => {
  beforeEach(() => {
    assertVoiceJoinMediaReady.mockReset();
    requestAppTwoChoice.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns ready when preflight succeeds', async () => {
    assertVoiceJoinMediaReady.mockResolvedValue(undefined);
    await expect(runVoiceJoinMediaPreflightInteractive()).resolves.toBe(
      'ready',
    );
    expect(requestAppTwoChoice).not.toHaveBeenCalled();
  });

  it('retries after primary choice then succeeds', async () => {
    assertVoiceJoinMediaReady
      .mockRejectedValueOnce(
        new VoiceJoinMediaPreflightError('Microphone access was blocked.'),
      )
      .mockResolvedValueOnce(undefined);
    requestAppTwoChoice.mockResolvedValueOnce('primary');

    await expect(runVoiceJoinMediaPreflightInteractive()).resolves.toBe(
      'ready',
    );
    expect(assertVoiceJoinMediaReady).toHaveBeenCalledTimes(2);
    expect(requestAppTwoChoice).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryLabel: 'Retry',
        secondaryLabel: 'Join muted',
      }),
    );
  });

  it('returns join_muted on secondary choice', async () => {
    assertVoiceJoinMediaReady.mockRejectedValue(
      new VoiceJoinMediaPreflightError('No microphone was found.'),
    );
    requestAppTwoChoice.mockResolvedValueOnce('secondary');

    await expect(runVoiceJoinMediaPreflightInteractive()).resolves.toBe(
      'join_muted',
    );
  });

  it('returns cancelled on dismiss', async () => {
    assertVoiceJoinMediaReady.mockRejectedValue(
      new VoiceJoinMediaPreflightError('Interrupted.'),
    );
    requestAppTwoChoice.mockResolvedValueOnce(null);

    await expect(runVoiceJoinMediaPreflightInteractive()).resolves.toBe(
      'cancelled',
    );
  });
});
