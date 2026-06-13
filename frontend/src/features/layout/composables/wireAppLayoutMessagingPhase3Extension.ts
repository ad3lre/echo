import type { useReactionFavorites } from '@/composables/useReactionFavorites';
import type { useAppLayoutGroupDmManagement } from './useAppLayoutGroupDmManagement';
import type { useAppLayoutMemberPopoutChromeCallbacks } from './useAppLayoutMemberPopoutChromeCallbacks';
import type { useAppLayoutMessageActions } from './useAppLayoutMessageActions';
import type { useAppLayoutUserSettingsModalCallbacks } from './useAppLayoutUserSettingsModalCallbacks';

/**
 * Phase-3-only values spread into context assembly input alongside
 * `WireAppLayoutVoiceAndRealtimeResult`. Scalar locals stay on the open record;
 * nested composable bags are typed so `buildAppLayoutAssemblyDeps` can wire slices
 * without duplicating the phase-2 result type.
 */
export type WireAppLayoutMessagingPhase3Extension = Record<string, unknown> & {
  messageActions: ReturnType<typeof useAppLayoutMessageActions>;
  reactionFavorites: ReturnType<typeof useReactionFavorites>;
  groupDmActions: ReturnType<
    typeof useAppLayoutGroupDmManagement
  >['groupDmActions'];
  memberPopoutChromeCallbacks: ReturnType<
    typeof useAppLayoutMemberPopoutChromeCallbacks
  >;
  userSettingsModalCallbacks: ReturnType<
    typeof useAppLayoutUserSettingsModalCallbacks
  >;
};
