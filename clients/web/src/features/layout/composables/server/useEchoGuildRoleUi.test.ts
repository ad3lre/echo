import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computed, effectScope } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import type * as EchoClientApi from '@/api/echoClient';
import { useEchoGuildRoleUi } from './useEchoGuildRoleUi';
import {
  deleteEchoMemberRoleAssignment,
  fetchEchoRoleUiBootstrap,
  postEchoAssignMemberRole,
} from '@/api/echoClient';
import type { Server } from '@shared/types/server';

vi.mock('@/api/echoClient', async (importOriginal) => {
  const actual = await importOriginal<typeof EchoClientApi>();
  return {
    ...actual,
    fetchEchoRoleUiBootstrap: vi.fn(),
    postEchoAssignMemberRole: vi.fn(),
    deleteEchoMemberRoleAssignment: vi.fn(),
  };
});

const serverId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

describe('useEchoGuildRoleUi member-list loading lifecycle', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.mocked(fetchEchoRoleUiBootstrap).mockReset();
    vi.mocked(postEchoAssignMemberRole).mockReset();
    vi.mocked(deleteEchoMemberRoleAssignment).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves loading to error on bootstrap failure', async () => {
    vi.mocked(fetchEchoRoleUiBootstrap).mockRejectedValueOnce(
      new Error('boom'),
    );
    const scope = effectScope();
    const roleUi = scope.run(() =>
      useEchoGuildRoleUi({
        serverStore: {
          selectedServerId: serverId,
          selectedServer: { id: serverId },
          servers: [{ id: serverId, ownerId: 'owner-1' }],
        } as any,
        authSession: {
          isAuthenticated: true,
          accessToken: 'token',
        } as any,
        workspace: {} as any,
        currentUser: computed(() => ({ id: 'owner-1' })),
        selectedServer: computed<Server | undefined>(() => ({
          id: serverId,
          name: 'Test Server',
          imageUrl: '',
          ownerId: 'owner-1',
        })),
      }),
    )!;

    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(fetchEchoRoleUiBootstrap).toHaveBeenCalled();
    expect(roleUi.echoRoleBootstrapStatus.value).toBe('error');
    expect(roleUi.isEchoRoleBootstrapLoading.value).toBe(false);
    scope.stop();
  });

  it('recovers from failed bootstrap on refresh', async () => {
    vi.mocked(fetchEchoRoleUiBootstrap)
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValueOnce({
        capabilities: {
          canManageRoles: false,
          canManageServer: false,
          canCreateChannel: false,
        },
        roles: [],
        roleCategories: [],
        assignments: {},
      } as any);

    const scope = effectScope();
    const roleUi = scope.run(() =>
      useEchoGuildRoleUi({
        serverStore: {
          selectedServerId: serverId,
          selectedServer: { id: serverId },
          servers: [{ id: serverId, ownerId: 'owner-1' }],
        } as any,
        authSession: {
          isAuthenticated: true,
          accessToken: 'token',
        } as any,
        workspace: {} as any,
        currentUser: computed(() => ({ id: 'owner-1' })),
        selectedServer: computed<Server | undefined>(() => ({
          id: serverId,
          name: 'Test Server',
          imageUrl: '',
          ownerId: 'owner-1',
        })),
      }),
    )!;

    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(roleUi.echoRoleBootstrapStatus.value).toBe('error');

    await roleUi.refreshEchoRoleData();
    expect(roleUi.echoRoleBootstrapStatus.value).toBe('ready');
    expect(roleUi.echoCapabilitiesForServerId.value).toBe(serverId);
    expect(roleUi.isEchoRoleBootstrapLoading.value).toBe(false);
    scope.stop();
  });

  it('applies member role toggles optimistically before the network settles', async () => {
    let resolveAssign: (() => void) | undefined;
    vi.mocked(fetchEchoRoleUiBootstrap).mockResolvedValueOnce({
      capabilities: {
        canManageRoles: true,
        canAssignRoles: true,
        canManageServer: false,
        canCreateChannel: false,
      },
      roles: [
        {
          id: 'role-a',
          name: 'Helper',
          color: '#fff',
          position: 1,
          permissions: [],
          isEveryone: false,
          isMembers: false,
        },
      ],
      roleCategories: [],
      assignments: { 'user-1': [] },
    } as any);
    vi.mocked(postEchoAssignMemberRole).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveAssign = () => resolve();
        }),
    );

    const scope = effectScope();
    const roleUi = scope.run(() =>
      useEchoGuildRoleUi({
        serverStore: {
          selectedServerId: serverId,
          selectedServer: { id: serverId, ownerId: 'owner-1' },
          servers: [{ id: serverId, ownerId: 'owner-1' }],
        } as any,
        authSession: {
          isAuthenticated: true,
          accessToken: 'token',
        } as any,
        workspace: {} as any,
        currentUser: computed(() => ({ id: 'owner-1' })),
        selectedServer: computed<Server | undefined>(() => ({
          id: serverId,
          name: 'Test Server',
          imageUrl: '',
          ownerId: 'owner-1',
        })),
      }),
    )!;

    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(roleUi.echoRoleBootstrapStatus.value).toBe('ready');

    const rm = roleUi.memberListRoleManagement.value;
    expect(rm?.enabled).toBe(true);
    const togglePromise = rm!.onToggleRole({
      targetUserId: 'user-1',
      roleId: 'role-a',
      assign: true,
    });

    expect(
      roleUi.memberListRoleManagement.value?.resolveAssignedRoleIds('user-1'),
    ).toEqual(['role-a']);

    resolveAssign?.();
    await togglePromise;
    expect(
      roleUi.memberListRoleManagement.value?.resolveAssignedRoleIds('user-1'),
    ).toEqual(['role-a']);
    scope.stop();
  });

  it('rolls back an optimistic role toggle when the request fails', async () => {
    vi.mocked(fetchEchoRoleUiBootstrap)
      .mockResolvedValueOnce({
        capabilities: {
          canManageRoles: true,
          canAssignRoles: true,
          canManageServer: false,
          canCreateChannel: false,
        },
        roles: [
          {
            id: 'role-a',
            name: 'Helper',
            color: '#fff',
            position: 1,
            permissions: [],
            isEveryone: false,
            isMembers: false,
          },
        ],
        roleCategories: [],
        assignments: { 'user-1': ['role-a'] },
      } as any)
      .mockResolvedValueOnce({
        capabilities: {
          canManageRoles: true,
          canAssignRoles: true,
          canManageServer: false,
          canCreateChannel: false,
        },
        roles: [
          {
            id: 'role-a',
            name: 'Helper',
            color: '#fff',
            position: 1,
            permissions: [],
            isEveryone: false,
            isMembers: false,
          },
        ],
        roleCategories: [],
        assignments: { 'user-1': ['role-a'] },
      } as any);
    vi.mocked(deleteEchoMemberRoleAssignment).mockRejectedValueOnce(
      new Error('forbidden'),
    );

    const scope = effectScope();
    const roleUi = scope.run(() =>
      useEchoGuildRoleUi({
        serverStore: {
          selectedServerId: serverId,
          selectedServer: { id: serverId, ownerId: 'owner-1' },
          servers: [{ id: serverId, ownerId: 'owner-1' }],
        } as any,
        authSession: {
          isAuthenticated: true,
          accessToken: 'token',
        } as any,
        workspace: {} as any,
        currentUser: computed(() => ({ id: 'owner-1' })),
        selectedServer: computed<Server | undefined>(() => ({
          id: serverId,
          name: 'Test Server',
          imageUrl: '',
          ownerId: 'owner-1',
        })),
      }),
    )!;

    await vi.runAllTimersAsync();
    await Promise.resolve();

    const rm = roleUi.memberListRoleManagement.value;
    await rm!.onToggleRole({
      targetUserId: 'user-1',
      roleId: 'role-a',
      assign: false,
    });

    expect(
      roleUi.memberListRoleManagement.value?.resolveAssignedRoleIds('user-1'),
    ).toEqual(['role-a']);
    scope.stop();
  });
});
