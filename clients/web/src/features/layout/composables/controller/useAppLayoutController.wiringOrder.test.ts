import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Contract: layout controller setup order for voice / DM / chat / unread / realtime.
 * See docs/architecture/clientCharterLayoutReactiveGraphAuthority.md — update both when reordering.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WIRING_SRC = [
  'createAppLayoutController.ts',
  'wireAppLayoutDmAndShell.ts',
  'useAppLayoutDmAndShellEchoDm.ts',
  'useAppLayoutDmAndShellNavVoice.ts',
  'wireAppLayoutVoiceAndRealtime.ts',
  'useAppLayoutVoiceAndRealtimeLifecycle.ts',
  'useAppLayoutVoiceAndRealtimeChannels.ts',
  'useAppLayoutVoiceAndRealtimeRailLanding.ts',
  'useAppLayoutVoiceAndRealtimeSessionSocial.ts',
  'realtime/useAppLayoutRealtimeSession.ts',
  'rail/useAppLayoutServerRailAttention.ts',
  'voice/useAppLayoutCallVoiceLayoutBindings.ts',
  'moderation/useAppLayoutLandingGridNsfw.ts',
  'dm/useAppLayoutDmRailUnreadInputs.ts',
  'guest/useAppLayoutGuestBootstrap.ts',
  'voice/useAppLayoutVoiceShellChannelGuards.ts',
  'useAppLayoutMessagingProfilesSetup.ts',
  'messaging/useAppLayoutMessagingSearchSetup.ts',
  'dm/useAppLayoutMessagingGroupDmChrome.ts',
  'wireAppLayoutMessagingAndProfiles.ts',
]
  .map((file) =>
    readFileSync(
      join(__dirname, file.includes('/') ? '..' : '.', file),
      'utf8',
    ),
  )
  .join('\n');

const WIRING_ORDER_MARKERS = [
  'useAppLayoutEchoDmState({',
  'useAppLayoutEffectiveChannel({',
  'useAppLayoutOpenDmThread({',
  'createIsKnownDmChannelId({',
  'useAppLayoutShellNavigation({',
  'useAppLayoutVoiceChannelForParticipantsComputed({',
  'useAppLayoutCallVoiceBridge({',
  'useDmCallWithUserIdShellLogMirror(',
  'useEchoWorkspaceLifecycle({',
  'assignHydrateEchoFromApi(',
  'useEchoHistory(',
  'useAppLayoutRailLoadingDerived({',
  'useAppLayoutDmRailUnread({',
  'useChatMessages(',
  'useAppLayoutPinsIntegration({',
  'useAppLayoutRealtimeHostWiring({',
  'useAppLayoutRealtimeSocketBinding({',
  'wireDmCallSocketSubmitters({',
  'useAppLayoutProfilesDomain({',
  'useAppLayoutMentionAutocompleteUsers({',
  'useAppLayoutSearchIntegration({',
  'sealWithGroupDmAndNavigation({',
  'assembleAppLayoutControllerContext(',
] as const;

describe('useAppLayoutController wiring order', () => {
  it('keeps sequential setup markers for voice / DM / chat / unread / realtime', () => {
    const indices = WIRING_ORDER_MARKERS.map((m) => {
      const i = WIRING_SRC.indexOf(m);
      expect(i, `missing marker: ${m}`).toBeGreaterThanOrEqual(0);
      return i;
    });
    for (let k = 1; k < indices.length; k++) {
      expect(
        indices[k],
        `${WIRING_ORDER_MARKERS[k]} must appear after ${WIRING_ORDER_MARKERS[k - 1]}`,
      ).toBeGreaterThan(indices[k - 1]);
    }
  });
});
