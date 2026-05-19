import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useServerSettingsDiscordImport } from './useServerSettingsDiscordImport';
import type { EchoDiscordImportState } from '@/api/echo/types';

const dispatchAppToastDetail = vi.hoisted(() => vi.fn());

vi.mock('@/utils/controllerMissingAction', () => ({
  dispatchAppToastDetail,
}));

vi.mock('@/api/echoClient', () => ({
  fetchEchoDiscordImportState: vi.fn(),
  postEchoDiscordImportStep: vi.fn(),
  postEchoDiscordImportRefreshFromExport: vi.fn(),
}));

vi.mock('@/stores/authSession', () => ({
  useAuthSessionStore: () => ({
    isAuthenticated: true,
    accessToken: 'test-token',
  }),
}));

import {
  fetchEchoDiscordImportState,
  postEchoDiscordImportStep,
} from '@/api/echoClient';

function baseState(
  overrides: Partial<EchoDiscordImportState> = {},
): EchoDiscordImportState {
  return {
    serverId: 'srv-1',
    sourceLabel: 'export',
    sourceDir: '/tmp/export',
    metadataImported: true,
    rolesImported: false,
    membersImported: false,
    channelsImported: false,
    metadataImportedAt: null,
    rolesImportedAt: null,
    membersImportedAt: null,
    channelsImportedAt: null,
    roleCount: 0,
    categoryCount: 0,
    channelCount: 0,
    discordToEchoUserMap: {},
    userMapEntryCount: 0,
    warnings: [],
    lastError: '',
    roleImportIssues: [],
    updatedAt: null,
    nextStep: 'roles',
    completedSteps: 1,
    preview: null,
    previewError: '',
    ...overrides,
  };
}

describe('useServerSettingsDiscordImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dispatchAppToastDetail.mockClear();
  });

  it('preserves localError after refreshState on step failure (toast + message)', async () => {
    const afterFailure = baseState({
      lastError: 'Discord role import could not restore role order: x',
      roleImportIssues: [
        {
          code: 'role_order_failed',
          detail:
            'Computed role order was not a valid permutation of this server’s roles.',
        },
      ],
    });

    let fetchN = 0;
    vi.mocked(fetchEchoDiscordImportState).mockImplementation(async () => {
      fetchN += 1;
      if (fetchN === 1) return { state: baseState() };
      return { state: afterFailure };
    });

    vi.mocked(postEchoDiscordImportStep).mockRejectedValueOnce(
      new Error('Discord role import could not restore role order: x'),
    );

    const serverId = ref('srv-1');
    const canManageServer = ref(true);
    const { runStep, localError, state } = useServerSettingsDiscordImport({
      serverId,
      canManageServer,
    });

    await nextTick();
    await runStep('roles');

    expect(localError.value).toBe(
      'Discord role import could not restore role order: x',
    );
    expect(state.value?.lastError).toBe(afterFailure.lastError);
    expect(state.value?.roleImportIssues).toHaveLength(1);
    expect(dispatchAppToastDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        message: 'Discord role import could not restore role order: x',
      }),
    );
  });
});
