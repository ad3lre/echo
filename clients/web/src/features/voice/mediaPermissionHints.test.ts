import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  echoCameraPermissionDeniedHint,
  echoMicPermissionDeniedHint,
  echoScreenCapturePermissionDeniedHint,
  echoVoiceJoinPreflightRetrySuffix,
} from './mediaPermissionHints';

vi.mock('@/platform/browserCompatibility', () => ({
  isWebKitDesktop: vi.fn(() => false),
}));

import { isWebKitDesktop } from '@/platform/browserCompatibility';

describe('mediaPermissionHints', () => {
  afterEach(() => {
    vi.mocked(isWebKitDesktop).mockReturnValue(false);
  });

  it('uses browser bar copy on web', () => {
    expect(echoMicPermissionDeniedHint()).toContain('browser bar');
    expect(echoCameraPermissionDeniedHint()).toContain('browser bar');
    expect(echoScreenCapturePermissionDeniedHint()).toContain('address bar');
    expect(echoVoiceJoinPreflightRetrySuffix()).toContain('browser bar');
  });

  it('uses System Settings copy on Mac desktop', () => {
    vi.mocked(isWebKitDesktop).mockReturnValue(true);
    expect(echoMicPermissionDeniedHint()).toContain(
      'System Settings → Privacy & Security → Microphone',
    );
    expect(echoCameraPermissionDeniedHint()).toContain(
      'System Settings → Privacy & Security → Camera',
    );
    expect(echoScreenCapturePermissionDeniedHint()).toContain(
      'System Settings → Privacy & Security → Screen Recording',
    );
    expect(echoVoiceJoinPreflightRetrySuffix()).toContain(
      'System Settings → Privacy & Security → Microphone',
    );
  });
});
