import { beforeEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({
  echoFetch: vi.fn(),
}));

const channelApi = vi.hoisted(() => ({
  patchEchoChannel: vi.fn(),
}));

const diagnostics = vi.hoisted(() => ({
  emitDiagnostic: vi.fn(),
  newSpanId: vi.fn(() => 'span-1'),
  newTraceId: vi.fn(() => 'trace-1'),
}));

vi.mock('./transport', () => transport);
vi.mock('./channels', () => channelApi);
vi.mock('@/observability/sessionDiagnostics', () => diagnostics);

import {
  createEchoRoleApi,
  deleteEchoMemberRoleAssignment,
  deleteEchoRoleApi,
  deleteEchoRoleCategory,
  fetchEchoCategoryPermissionOverwriteRows,
  fetchEchoChannelCapabilities,
  fetchEchoChannelPermissionOverwriteRows,
  fetchEchoMemberRoleAssignments,
  fetchEchoPermissionExplain,
  fetchEchoRoleCategories,
  fetchEchoRoleLinks,
  fetchEchoRoleUiBootstrap,
  fetchEchoServerCapabilities,
  fetchEchoServerRoleList,
  patchEchoCategoryPermissionOverrides,
  patchEchoChannelPermissionOverrides,
  patchEchoRole,
  patchEchoRoleCategory,
  patchEchoRolePermissions,
  postEchoAssignMemberRole,
  postEchoRoleCategory,
  putEchoCategoryPermissionOverwriteRows,
  putEchoChannelPermissionOverwriteRows,
  putEchoRoleCategoryOrder,
  putEchoRoleLinks,
  putEchoServerRoleOrder,
} from './permissions';

function lastEchoCall() {
  return transport.echoFetch.mock.calls.at(-1)!;
}

function parsedBody(call = lastEchoCall()) {
  return JSON.parse(String(call[2]?.body));
}

describe('Echo permissions API client', () => {
  beforeEach(() => {
    transport.echoFetch.mockReset();
    transport.echoFetch.mockResolvedValue({});
    channelApi.patchEchoChannel.mockReset();
    diagnostics.emitDiagnostic.mockReset();
    diagnostics.newSpanId.mockClear();
    diagnostics.newTraceId.mockClear();
  });

  it('fetches server and channel capability endpoints', async () => {
    const signal = new AbortController().signal;
    await fetchEchoServerCapabilities('tok', 'srv 1');
    expect(lastEchoCall()).toEqual(['tok', '/servers/srv%201/capabilities']);

    await fetchEchoRoleUiBootstrap('tok', 'srv/1');
    expect(lastEchoCall()).toEqual([
      'tok',
      '/servers/srv%2F1/role-ui-bootstrap',
    ]);

    await fetchEchoChannelCapabilities('tok', 'chan/1', { signal });
    expect(lastEchoCall()).toEqual([
      'tok',
      '/channels/chan%2F1/capabilities',
      { signal },
    ]);
  });

  it('patches roles with only explicit fields and keeps nullable icon/category clears', async () => {
    await patchEchoRole('tok', 'srv', 'role/1', {
      name: 'Mods',
      color: '#112233',
      darkColor: '#000000',
      lightColor: '#ffffff',
      separateThemeColors: true,
      hoist: true,
      defaultOnJoin: false,
      permissions: ['VIEW_CHANNEL'],
      roleCategoryId: null,
      roleIconUrl: null,
      roleIconEmojiId: 'emoji-1',
      roleType: 'authority',
    });

    expect(lastEchoCall()[1]).toBe('/servers/srv/roles/role%2F1');
    expect(lastEchoCall()[2]).toMatchObject({ method: 'PATCH' });
    expect(parsedBody()).toEqual({
      name: 'Mods',
      color: '#112233',
      darkColor: '#000000',
      lightColor: '#ffffff',
      separateThemeColors: true,
      hoist: true,
      defaultOnJoin: false,
      permissions: ['VIEW_CHANNEL'],
      roleCategoryId: null,
      roleIconUrl: null,
      roleIconEmojiId: 'emoji-1',
      roleType: 'authority',
    });

    await patchEchoRolePermissions('tok', 'srv', 'role', ['SEND_MESSAGES']);
    expect(parsedBody()).toEqual({ permissions: ['SEND_MESSAGES'] });
  });

  it('writes role ordering and role membership mutations', async () => {
    await putEchoServerRoleOrder('tok', 'srv', ['a', 'b'], {
      categoryId: 'cat-a',
    });
    expect(lastEchoCall()).toEqual([
      'tok',
      '/servers/srv/roles/order',
      {
        method: 'PUT',
        body: JSON.stringify({ roleIds: ['a', 'b'], categoryId: 'cat-a' }),
      },
    ]);

    await deleteEchoRoleApi('tok', 'srv', 'role/1');
    expect(lastEchoCall()).toEqual([
      'tok',
      '/servers/srv/roles/role%2F1',
      { method: 'DELETE' },
    ]);

    await postEchoAssignMemberRole('tok', 'srv', 'user/1', 'role/1');
    expect(lastEchoCall()).toEqual([
      'tok',
      '/servers/srv/members/user%2F1/roles',
      { method: 'POST', body: JSON.stringify({ roleId: 'role/1' }) },
    ]);

    await deleteEchoMemberRoleAssignment('tok', 'srv', 'user/1', 'role/1');
    expect(lastEchoCall()).toEqual([
      'tok',
      '/servers/srv/members/user%2F1/roles/role%2F1',
      { method: 'DELETE' },
    ]);
  });

  it('routes channel and category permission override updates', async () => {
    await patchEchoChannelPermissionOverrides('tok', 'chan', {
      viewChannel: true,
    });
    expect(channelApi.patchEchoChannel).toHaveBeenCalledWith('tok', 'chan', {
      permissionOverrides: { viewChannel: true },
    });

    await patchEchoCategoryPermissionOverrides('tok', 'srv', 'cat', null);
    expect(lastEchoCall()).toEqual([
      'tok',
      '/servers/srv/category-permission-overrides',
      {
        method: 'PATCH',
        body: JSON.stringify({ categoryId: 'cat', permissionOverrides: null }),
      },
    ]);
  });

  it('emits diagnostics around permission explain fetches', async () => {
    transport.echoFetch.mockResolvedValueOnce({ answer: 'ok' });
    await expect(
      fetchEchoPermissionExplain('tok', 'srv', {
        channelId: 'chan',
        traceMode: 'full',
        userId: 'user',
      }),
    ).resolves.toEqual({ answer: 'ok' });

    expect(lastEchoCall()).toEqual([
      'tok',
      '/servers/srv/permission-explain?channelId=chan&traceMode=full&targetUserId=user',
      {
        headers: {
          'x-diag-trace-id': 'trace-1',
          'x-diag-span-id': 'span-1',
        },
      },
    ]);
    expect(diagnostics.emitDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'start', traceId: 'trace-1' }),
    );
    expect(diagnostics.emitDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'success', traceId: 'trace-1' }),
    );

    transport.echoFetch.mockRejectedValueOnce(new Error('network down'));
    await expect(fetchEchoPermissionExplain('tok', 'srv')).rejects.toThrow(
      'network down',
    );
    expect(diagnostics.emitDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'fail',
        error: { message: 'network down' },
      }),
    );
  });

  it('maps permission overwrite rows across Echo API and UI shapes', async () => {
    transport.echoFetch.mockResolvedValueOnce({
      rows: [
        {
          targetType: 'everyone',
          partial: { VIEW_CHANNEL: true, SEND_MESSAGES: false },
        },
        {
          targetType: 'role',
          targetId: 'role-1',
          partial: { ATTACH_FILES: true, IGNORED: true },
        },
      ],
    });
    await expect(
      fetchEchoChannelPermissionOverwriteRows('tok', 'chan'),
    ).resolves.toEqual({
      rows: [
        {
          targetType: 'members',
          partial: { viewChannel: true, sendMessages: false },
        },
        {
          targetType: 'role',
          targetId: 'role-1',
          partial: { attachFiles: true },
        },
      ],
    });
    expect(lastEchoCall()[1]).toBe('/channels/chan/permission-overwrites');

    transport.echoFetch.mockResolvedValueOnce({
      rows: [{ targetType: 'member', targetId: 'user-1', partial: null }],
    });
    await expect(
      fetchEchoCategoryPermissionOverwriteRows('tok', 'srv', 'cat'),
    ).resolves.toEqual({
      rows: [{ targetType: 'member', targetId: 'user-1', partial: {} }],
    });
    expect(lastEchoCall()[1]).toBe(
      '/servers/srv/categories/cat/permission-overwrites',
    );

    await putEchoChannelPermissionOverwriteRows('tok', 'chan', [
      { targetType: 'members', partial: { viewChannel: true } },
      {
        targetType: 'role',
        targetId: 'role-1',
        partial: { attachFiles: false },
      },
    ]);
    expect(parsedBody()).toEqual({
      rows: [
        { targetType: 'members', partial: { VIEW_CHANNEL: true } },
        {
          targetType: 'role',
          targetId: 'role-1',
          partial: { ATTACH_FILES: false },
        },
      ],
    });

    await putEchoCategoryPermissionOverwriteRows('tok', 'srv', 'cat', [
      {
        targetType: 'member',
        targetId: 'user-1',
        partial: { mentionEveryone: true },
      },
    ]);
    expect(lastEchoCall()[1]).toBe(
      '/servers/srv/categories/cat/permission-overwrites',
    );
    expect(parsedBody()).toEqual({
      rows: [
        {
          targetType: 'member',
          targetId: 'user-1',
          partial: { MENTION_EVERYONE: true },
        },
      ],
    });
  });

  it('covers role categories, lists, and links endpoints', async () => {
    await createEchoRoleApi('tok', 'srv', {
      name: 'Helpers',
      color: '#123456',
      permissions: ['VIEW_CHANNEL'],
      syncWithCategoryDefaults: true,
    });
    expect(lastEchoCall()).toEqual([
      'tok',
      '/servers/srv/roles',
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'Helpers',
          color: '#123456',
          permissions: ['VIEW_CHANNEL'],
          syncWithCategoryDefaults: true,
        }),
      },
    ]);

    await fetchEchoMemberRoleAssignments('tok', 'srv');
    expect(lastEchoCall()[1]).toBe('/servers/srv/member-role-assignments');
    await fetchEchoServerRoleList('tok', 'srv');
    expect(lastEchoCall()[1]).toBe('/servers/srv/roles');
    await fetchEchoRoleCategories('tok', 'srv');
    expect(lastEchoCall()[1]).toBe('/servers/srv/role-categories');

    await postEchoRoleCategory('tok', 'srv', 'Staff');
    expect(lastEchoCall()).toEqual([
      'tok',
      '/servers/srv/role-categories',
      { method: 'POST', body: JSON.stringify({ name: 'Staff' }) },
    ]);

    await patchEchoRoleCategory('tok', 'srv', 'cat/1', {
      name: 'Staff',
      defaultPermissions: ['MANAGE_MESSAGES'],
      defaultHoist: true,
      defaultOnJoin: false,
      defaultRoleScope: 'global',
      defaultRoleType: 'authority',
      selfAssignableDefaults: true,
    });
    expect(lastEchoCall()[1]).toBe('/servers/srv/role-categories/cat%2F1');
    expect(lastEchoCall()[2]).toMatchObject({ method: 'PATCH' });

    await deleteEchoRoleCategory('tok', 'srv', 'cat/1');
    expect(lastEchoCall()).toEqual([
      'tok',
      '/servers/srv/role-categories/cat%2F1',
      { method: 'DELETE' },
    ]);

    await putEchoRoleCategoryOrder('tok', 'srv', ['cat-b', 'cat-a']);
    expect(lastEchoCall()).toEqual([
      'tok',
      '/servers/srv/role-categories/order',
      {
        method: 'PUT',
        body: JSON.stringify({ categoryIds: ['cat-b', 'cat-a'] }),
      },
    ]);

    await fetchEchoRoleLinks('tok', 'srv');
    expect(lastEchoCall()[1]).toBe('/servers/srv/role-links');

    await putEchoRoleLinks('tok', 'srv', 'anchor/1', [
      { linkedRoleId: 'linked', twoWay: true },
    ]);
    expect(lastEchoCall()).toEqual([
      'tok',
      '/servers/srv/roles/anchor%2F1/links',
      {
        method: 'PUT',
        body: JSON.stringify({
          links: [{ linkedRoleId: 'linked', twoWay: true }],
        }),
      },
    ]);
  });
});
