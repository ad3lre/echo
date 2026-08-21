import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  cameraPublishFailureUserMessage,
  isDisplayMediaFlowAbortedWithoutResult,
  screenShareFailureUserMessage,
  shouldStopScreenShareCapturePresetRetries,
  emitDedupedMediaCaptureUiFailure,
} from '@/features/voice/mediaCaptureErrors';
import { UIErrorBus } from '@/features/layout/failures/uiErrorBus';

describe('mediaCaptureErrors', () => {
  it('treats AbortError as display-media flow aborted without surfacing', () => {
    expect(
      isDisplayMediaFlowAbortedWithoutResult(
        new DOMException('', 'AbortError'),
      ),
    ).toBe(true);
  });

  it('does not treat NotAllowedError as silent abort', () => {
    expect(
      isDisplayMediaFlowAbortedWithoutResult(
        new DOMException('', 'NotAllowedError'),
      ),
    ).toBe(false);
  });

  it('maps screen share NotAllowedError to actionable copy', () => {
    const msg = screenShareFailureUserMessage(
      new DOMException('Permission denied', 'NotAllowedError'),
    );
    expect(msg).toContain('Screen Recording');
    expect(msg).toContain('address bar');
  });

  it('maps camera NotReadableError', () => {
    const msg = cameraPublishFailureUserMessage(
      new DOMException('Could not start video source', 'NotReadableError'),
    );
    expect(msg).toMatch(/in use|could not be opened/i);
  });

  it('stops screen share preset retries on permission errors', () => {
    expect(
      shouldStopScreenShareCapturePresetRetries(
        new DOMException('', 'NotAllowedError'),
      ),
    ).toBe(true);
    expect(
      shouldStopScreenShareCapturePresetRetries(
        new DOMException('', 'OverconstrainedError'),
      ),
    ).toBe(false);
  });

  describe('emitDedupedMediaCaptureUiFailure', () => {
    beforeEach(() => {
      vi.spyOn(UIErrorBus, 'emit').mockImplementation(() => {});
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('dedupes identical payloads within the window', () => {
      const spy = vi.mocked(UIErrorBus.emit);
      emitDedupedMediaCaptureUiFailure({
        context: 'voice.screen_share_start',
        userMessage: 'same',
      });
      emitDedupedMediaCaptureUiFailure({
        context: 'voice.screen_share_start',
        userMessage: 'same',
      });
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('allows a second emit after different message', () => {
      const spy = vi.mocked(UIErrorBus.emit);
      emitDedupedMediaCaptureUiFailure({
        context: 'voice.screen_share_start',
        userMessage: 'a',
      });
      emitDedupedMediaCaptureUiFailure({
        context: 'voice.screen_share_start',
        userMessage: 'b',
      });
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
});
