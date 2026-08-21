import {
  assertVoiceJoinMediaReady,
  VoiceJoinMediaPreflightError,
} from '@/features/voice/voiceJoinMediaPreflight';
import { echoVoiceJoinPreflightRetrySuffix } from '@/features/voice/mediaPermissionHints';
import { requestAppTwoChoice } from '@/features/layout/failures/appDialogs';

export type VoiceJoinMediaPreflightOutcome =
  | 'ready'
  | 'join_muted'
  | 'cancelled';

function preflightErrorMessage(e: unknown): string {
  if (e instanceof VoiceJoinMediaPreflightError) return e.message;
  if (e instanceof Error && e.message.trim()) return e.message.trim();
  return 'Microphone or audio output check failed.';
}

/**
 * Runs mic/output preflight with Retry / Join muted / Cancel until success or exit.
 * Use before joining voice unmuted so users can re-request permissions without leaving.
 */
export async function runVoiceJoinMediaPreflightInteractive(): Promise<VoiceJoinMediaPreflightOutcome> {
  for (;;) {
    try {
      await assertVoiceJoinMediaReady();
      return 'ready';
    } catch (e) {
      const detail = preflightErrorMessage(e);
      const choice = await requestAppTwoChoice({
        title: 'Microphone not ready',
        message: `${detail}\n\n${echoVoiceJoinPreflightRetrySuffix()}`,
        primaryLabel: 'Retry',
        secondaryLabel: 'Join muted',
        dismissLabel: 'Cancel',
      });
      if (choice === 'primary') continue;
      if (choice === 'secondary') return 'join_muted';
      return 'cancelled';
    }
  }
}
