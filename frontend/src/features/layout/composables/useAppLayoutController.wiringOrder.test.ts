import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Contract: `useAppLayoutController` setup order for voice / DM / chat / unread / realtime.
 * See docs/architecture/clientCharterLayoutReactiveGraphAuthority.md — update both when reordering.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONTROLLER_SRC = readFileSync(
  join(__dirname, 'useAppLayoutController.ts'),
  'utf8',
);

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
] as const;

describe('useAppLayoutController wiring order', () => {
  it('keeps sequential setup markers for voice / DM / chat / unread / realtime', () => {
    const indices = WIRING_ORDER_MARKERS.map((m) => {
      const i = CONTROLLER_SRC.indexOf(m);
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
