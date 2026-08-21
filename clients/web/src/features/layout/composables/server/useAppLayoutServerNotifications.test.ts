import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import type { Server } from '@shared/types/server';
import { useAppLayoutServerNotifications } from './useAppLayoutServerNotifications';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';

vi.mock('@/features/layout/failures/controllerMissingAction', () => ({
  dispatchAppToast: vi.fn(),
}));

function makeWorkspace() {
  return {
    servers: ref<Server[]>([]),
    getServerNotificationLevel: vi.fn(() => 'all' as const),
    setServerNotificationLevel: vi.fn(),
  };
}

function makeServer(id: string, name: string): Server {
  return { id, name, imageUrl: '' };
}

describe('useAppLayoutServerNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the modal for a real guild server', () => {
    const selectedServer = computed(() => makeServer('guild-1', 'Guild'));
    const workspace = makeWorkspace();
    const { isServerNotificationSettingsOpen, openServerNotificationSettings } =
      useAppLayoutServerNotifications(workspace as any, selectedServer);

    openServerNotificationSettings();

    expect(isServerNotificationSettingsOpen.value).toBe(true);
    expect(dispatchAppToast).not.toHaveBeenCalled();
  });

  it('shows a toast instead of failing silently when no server is selected', () => {
    const selectedServer = computed((): Server | undefined => undefined);
    const workspace = makeWorkspace();
    const { isServerNotificationSettingsOpen, openServerNotificationSettings } =
      useAppLayoutServerNotifications(workspace as any, selectedServer);

    openServerNotificationSettings();

    expect(isServerNotificationSettingsOpen.value).toBe(false);
    expect(dispatchAppToast).toHaveBeenCalledWith(
      'Select a server before changing notification settings.',
      'warning',
    );
  });

  it('shows a toast instead of failing silently for Direct Messages', () => {
    const selectedServer = computed(() =>
      makeServer('echo', 'Direct Messages'),
    );
    const workspace = makeWorkspace();
    const { isServerNotificationSettingsOpen, openServerNotificationSettings } =
      useAppLayoutServerNotifications(workspace as any, selectedServer);

    openServerNotificationSettings();

    expect(isServerNotificationSettingsOpen.value).toBe(false);
    expect(dispatchAppToast).toHaveBeenCalledWith(
      'Notification settings are not available for Direct Messages.',
      'info',
    );
  });
});
