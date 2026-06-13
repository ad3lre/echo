import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MESSAGE_SEARCH_CONTROLLER = readFileSync(
  join(__dirname, '..', 'messageSearchController.ts'),
  'utf8',
);
const ECHO_HISTORY_ORCHESTRATION = readFileSync(
  join(__dirname, '..', 'echoHistoryOrchestration.ts'),
  'utf8',
);
const ECHO_HISTORY_CHANNEL_APPLY = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    '..',
    'services',
    'realtime',
    'echoHistoryChannelApply.ts',
  ),
  'utf8',
);
const ECHO_HISTORY_CHANNEL_APPLY_DOMAIN = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    '..',
    'features',
    'chat',
    'domain',
    'echoHistoryChannelApply.ts',
  ),
  'utf8',
);
const ECHO_WORKSPACE_LIFECYCLE_ORCHESTRATION = readFileSync(
  join(__dirname, '..', 'echoWorkspaceLifecycleOrchestration.ts'),
  'utf8',
);
const ECHO_REALTIME_UI_CONTROLLER_TRANSACTIONS = readFileSync(
  join(__dirname, '..', 'echoRealtimeUiControllerTransactions.ts'),
  'utf8',
);
const APP_LAYOUT_CONTROLLER = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    '..',
    'features',
    'layout',
    'composables',
    'createAppLayoutController.ts',
  ),
  'utf8',
);

describe('controller purity boundaries', () => {
  it('messageSearchController delegates search view-state derivation to messageSearchControllerState', () => {
    expect(MESSAGE_SEARCH_CONTROLLER).toContain(
      "from './messageSearchControllerState'",
    );

    const forbidden = [
      'applyFilters,',
      'buildFilterChips,',
      'categoriesToChannelList,',
      'channelNameByIdFromList,',
      'collectLocalSearchMessages,',
      'computeTotalPagesApiMode,',
      'computeTotalPagesClientMode,',
      'searchScopeHintFromFlags,',
      '< API_BATCH_LIMIT',
    ] as const;

    for (const marker of forbidden) {
      expect(
        MESSAGE_SEARCH_CONTROLLER.includes(marker),
        `messageSearchController should not inline view-model policy: ${marker}`,
      ).toBe(false);
    }
  });

  it('echoHistoryOrchestration routes history writes through channelMessageAuthority', () => {
    const forbidden = [
      /\bgetChannelIndex\s*\(/,
      /\.mergeBatch\s*\(/,
      /\bsyncChannelMessages\s*\(/,
    ] as const;

    for (const pattern of forbidden) {
      expect(
        pattern.test(ECHO_HISTORY_ORCHESTRATION),
        `echoHistoryOrchestration should not mutate message indexes directly: ${pattern}`,
      ).toBe(false);
    }

    expect(ECHO_HISTORY_ORCHESTRATION).toContain(
      '@/features/chat/domain/echoHistoryChannelApply',
    );
    expect(ECHO_HISTORY_CHANNEL_APPLY_DOMAIN).toContain(
      '@/services/realtime/echoHistoryChannelApply',
    );

    const applyRequired = [
      'replaceChannelMessagesFromHistory(',
      'prependChannelMessagesFromHistory(',
    ] as const;
    for (const marker of applyRequired) {
      expect(
        ECHO_HISTORY_CHANNEL_APPLY.includes(marker),
        `echoHistoryChannelApply should delegate through channelMessageAuthority: ${marker}`,
      ).toBe(true);
    }

    expect(ECHO_HISTORY_ORCHESTRATION).toContain(
      'insertChannelMessageFromHistory(',
    );
  });

  it('echoRealtimeUiControllerTransactions routes rollbacks through channelMessageAuthority', () => {
    const forbidden = [
      /\bgetChannelIndex\s*\(/,
      /\bsyncChannelMessages\s*\(/,
      /\bensureChannelBucket\s*\(/,
    ] as const;

    for (const pattern of forbidden) {
      expect(
        pattern.test(ECHO_REALTIME_UI_CONTROLLER_TRANSACTIONS),
        `echoRealtimeUiControllerTransactions should not mutate message buckets directly: ${pattern}`,
      ).toBe(false);
    }

    expect(ECHO_REALTIME_UI_CONTROLLER_TRANSACTIONS).toContain(
      'updateChannelMessageInBucket(',
    );
    expect(ECHO_REALTIME_UI_CONTROLLER_TRANSACTIONS).toContain(
      'insertChannelMessageFromHistory(',
    );
    expect(ECHO_REALTIME_UI_CONTROLLER_TRANSACTIONS).toContain(
      'restoreChannelMessageReactions(',
    );
  });

  it('useAppLayoutController keeps local state and adapter callbacks in helper modules', () => {
    const forbidden = [
      'const pfpBarExpanded = ref(false)',
      'const isSystemSettingsOpen = ref(false)',
      "const activeChannelId = ref('')",
      'const liveChannelCapabilitiesRefreshKey = ref(0)',
      'function handleExpandedProfileOpenServer(',
      'toggleMemberList: () => {',
      'toggleChannelPanel: () => {',
      'isServerUnread: (serverId: string) =>',
      'normalizeModerateMessageAuthorTarget(',
      'deriveHasGuildChannelChrome(',
      'computed(() => workspace.servers.value)',
      "computed(() => selectedServerEcho.value?.name ?? '')",
      'orderedOtherUserIds: () => workspace.users.value.map((u) => u.id)',
      'expandedProfileId: () => expandedProfile.value?.id ?? null',
      'currentUsername: () =>',
    ] as const;

    for (const marker of forbidden) {
      expect(
        APP_LAYOUT_CONTROLLER.includes(marker),
        `useAppLayoutController should delegate helper logic instead of inlining: ${marker}`,
      ).toBe(false);
    }
  });

  it('history and workspace lifecycle controllers delegate fallback and roster/server derivation', () => {
    const historyForbidden = [
      'const fromMessages = list?.[list.length - 1]?.id ?? null',
      'const fromAttention =',
      'list?.some((m) => m.id === messageId)',
    ] as const;

    for (const marker of historyForbidden) {
      expect(
        ECHO_HISTORY_ORCHESTRATION.includes(marker),
        `echoHistoryOrchestration should delegate fallback / presence checks: ${marker}`,
      ).toBe(false);
    }

    const lifecycleForbidden = [
      'workspace.servers.value.map((s) => s.id)',
      'workspace.users.value = workspace.users.value.filter(',
    ] as const;

    for (const marker of lifecycleForbidden) {
      expect(
        ECHO_WORKSPACE_LIFECYCLE_ORCHESTRATION.includes(marker),
        `echoWorkspaceLifecycleOrchestration should delegate roster/server derivation: ${marker}`,
      ).toBe(false);
    }
  });
});
