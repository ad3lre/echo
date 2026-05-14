import {
  channelOverridesToEchoPartial,
  echoPartialToChannelOverrides,
} from '@shared/rolePermissionBridge';
import { echoFetch } from './transport';
import type {
  EchoChannelCapabilitiesDto,
  EchoServerRoleDto,
  EchoPermissionOverwriteRowDto,
  EchoRolePatch,
  EchoRoleLinkDto,
  EchoRoleCategoryDto,
  EchoServerCapabilitiesDto,
  EchoRoleUiBootstrapDto,
  EchoPermissionExplainResponse,
} from './types';
import { patchEchoChannel } from './channels';
import {
  emitDiagnostic,
  newSpanId,
  newTraceId,
} from '@/observability/sessionDiagnostics';

export async function fetchEchoServerCapabilities(
  token: string,
  serverId: string,
): Promise<EchoServerCapabilitiesDto> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/capabilities`,
  );
}

export async function fetchEchoRoleUiBootstrap(
  token: string,
  serverId: string,
): Promise<EchoRoleUiBootstrapDto> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/role-ui-bootstrap`,
  );
}

export async function fetchEchoChannelCapabilities(
  token: string,
  channelId: string,
  options?: { signal?: AbortSignal },
): Promise<EchoChannelCapabilitiesDto> {
  return echoFetch(
    token,
    `/channels/${encodeURIComponent(channelId)}/capabilities`,
    {
      signal: options?.signal,
    },
  );
}

export async function patchEchoRole(
  token: string,
  serverId: string,
  roleId: string,
  patch: EchoRolePatch,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.color !== undefined) body.color = patch.color;
  if (patch.darkColor !== undefined) body.darkColor = patch.darkColor;
  if (patch.lightColor !== undefined) body.lightColor = patch.lightColor;
  if (patch.separateThemeColors !== undefined)
    body.separateThemeColors = patch.separateThemeColors;
  if (patch.hoist !== undefined) body.hoist = patch.hoist;
  if (patch.defaultOnJoin !== undefined)
    body.defaultOnJoin = patch.defaultOnJoin;
  if (patch.permissions !== undefined) body.permissions = patch.permissions;
  if (Object.prototype.hasOwnProperty.call(patch, 'roleCategoryId')) {
    body.roleCategoryId = patch.roleCategoryId ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'roleIconUrl')) {
    body.roleIconUrl = patch.roleIconUrl ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'roleIconEmojiId')) {
    body.roleIconEmojiId = patch.roleIconEmojiId ?? null;
  }
  if (patch.roleType !== undefined) body.roleType = patch.roleType;
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/roles/${encodeURIComponent(roleId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export async function patchEchoRolePermissions(
  token: string,
  serverId: string,
  roleId: string,
  permissions: string[],
): Promise<void> {
  return patchEchoRole(token, serverId, roleId, { permissions });
}

export async function putEchoServerRoleOrder(
  token: string,
  serverId: string,
  roleIds: string[],
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/roles/order`,
    {
      method: 'PUT',
      body: JSON.stringify({ roleIds }),
    },
  );
}

export async function deleteEchoRoleApi(
  token: string,
  serverId: string,
  roleId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/roles/${encodeURIComponent(roleId)}`,
    { method: 'DELETE' },
  );
}

export async function patchEchoChannelPermissionOverrides(
  token: string,
  channelId: string,
  permissionOverrides: Record<string, boolean> | null,
): Promise<void> {
  return patchEchoChannel(token, channelId, { permissionOverrides });
}

export async function patchEchoCategoryPermissionOverrides(
  token: string,
  serverId: string,
  categoryId: string,
  permissionOverrides: Record<string, boolean> | null,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/category-permission-overrides`,
    {
      method: 'PATCH',
      body: JSON.stringify({ categoryId, permissionOverrides }),
    },
  );
}

export async function fetchEchoPermissionExplain(
  token: string,
  serverId: string,
  opts?: {
    channelId?: string;
    traceMode?: 'full' | 'compressed';
    userId?: string;
  },
): Promise<EchoPermissionExplainResponse> {
  const traceId = newTraceId();
  const spanId = newSpanId();
  const q = new URLSearchParams();
  if (opts?.channelId) q.set('channelId', opts.channelId);
  if (opts?.traceMode) q.set('traceMode', opts.traceMode);
  if (opts?.userId) q.set('targetUserId', opts.userId);
  const qs = q.toString();
  emitDiagnostic({
    level: 'info',
    domain: 'perm',
    event: 'permission_explain_fetch',
    stage: 'start',
    traceId,
    spanId,
    context: {
      serverId,
      channelId: opts?.channelId,
      action: 'permission_explain',
    },
  });
  try {
    const response = await echoFetch<EchoPermissionExplainResponse>(
      token,
      `/servers/${encodeURIComponent(serverId)}/permission-explain${qs ? `?${qs}` : ''}`,
      {
        headers: {
          'x-diag-trace-id': traceId,
          'x-diag-span-id': spanId,
        },
      },
    );
    emitDiagnostic({
      level: 'info',
      domain: 'perm',
      event: 'permission_explain_fetch',
      stage: 'success',
      traceId,
      spanId,
      context: {
        serverId,
      },
    });
    return response;
  } catch (e) {
    emitDiagnostic({
      level: 'warn',
      domain: 'perm',
      event: 'permission_explain_fetch',
      stage: 'fail',
      traceId,
      spanId,
      error: { message: e instanceof Error ? e.message : String(e) },
      context: { serverId },
    });
    throw e;
  }
}

export async function fetchEchoChannelPermissionOverwriteRows(
  token: string,
  channelId: string,
): Promise<{ rows: EchoPermissionOverwriteRowDto[] }> {
  const data = await echoFetch<{
    rows: Array<{
      targetType: 'everyone' | 'role' | 'member';
      targetId?: string | null;
      partial: Record<string, unknown>;
    }>;
  }>(token, `/channels/${encodeURIComponent(channelId)}/permission-overwrites`);
  return {
    rows: (data.rows ?? []).map((row) => ({
      targetType: row.targetType,
      ...(row.targetType === 'everyone'
        ? {}
        : { targetId: row.targetId ?? null }),
      partial: echoPartialToChannelOverrides(row.partial ?? {}),
    })),
  };
}

export async function putEchoChannelPermissionOverwriteRows(
  token: string,
  channelId: string,
  rows: EchoPermissionOverwriteRowDto[],
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/channels/${encodeURIComponent(channelId)}/permission-overwrites`,
    {
      method: 'PUT',
      body: JSON.stringify({
        rows: rows.map((row) => ({
          targetType: row.targetType,
          ...(row.targetType === 'everyone' ? {} : { targetId: row.targetId }),
          partial: channelOverridesToEchoPartial(row.partial),
        })),
      }),
    },
  );
}

export async function fetchEchoCategoryPermissionOverwriteRows(
  token: string,
  serverId: string,
  categoryId: string,
): Promise<{ rows: EchoPermissionOverwriteRowDto[] }> {
  const data = await echoFetch<{
    rows: Array<{
      targetType: 'everyone' | 'role' | 'member';
      targetId?: string | null;
      partial: Record<string, unknown>;
    }>;
  }>(
    token,
    `/servers/${encodeURIComponent(serverId)}/categories/${encodeURIComponent(categoryId)}/permission-overwrites`,
  );
  return {
    rows: (data.rows ?? []).map((row) => ({
      targetType: row.targetType,
      ...(row.targetType === 'everyone'
        ? {}
        : { targetId: row.targetId ?? null }),
      partial: echoPartialToChannelOverrides(row.partial ?? {}),
    })),
  };
}

export async function putEchoCategoryPermissionOverwriteRows(
  token: string,
  serverId: string,
  categoryId: string,
  rows: EchoPermissionOverwriteRowDto[],
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/categories/${encodeURIComponent(categoryId)}/permission-overwrites`,
    {
      method: 'PUT',
      body: JSON.stringify({
        rows: rows.map((row) => ({
          targetType: row.targetType,
          ...(row.targetType === 'everyone' ? {} : { targetId: row.targetId }),
          partial: channelOverridesToEchoPartial(row.partial),
        })),
      }),
    },
  );
}

export async function createEchoRoleApi(
  token: string,
  serverId: string,
  body: {
    name: string;
    color?: string;
    permissions?: string[];
    hoist?: boolean;
    defaultOnJoin?: boolean;
    roleCategoryId?: string | null;
    roleIconUrl?: string | null;
    roleIconEmojiId?: string | null;
    roleType?: string;
  },
): Promise<{ roleId: string }> {
  return echoFetch(token, `/servers/${encodeURIComponent(serverId)}/roles`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchEchoMemberRoleAssignments(
  token: string,
  serverId: string,
): Promise<{ assignments: Record<string, string[]> }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/member-role-assignments`,
  );
}

export async function postEchoAssignMemberRole(
  token: string,
  serverId: string,
  targetUserId: string,
  roleId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/members/${encodeURIComponent(targetUserId)}/roles`,
    { method: 'POST', body: JSON.stringify({ roleId }) },
  );
}

export async function deleteEchoMemberRoleAssignment(
  token: string,
  serverId: string,
  targetUserId: string,
  roleId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/members/${encodeURIComponent(targetUserId)}/roles/${encodeURIComponent(roleId)}`,
    { method: 'DELETE' },
  );
}

export async function fetchEchoServerRoleList(
  token: string,
  serverId: string,
): Promise<{ roles: EchoServerRoleDto[] }> {
  return echoFetch(token, `/servers/${encodeURIComponent(serverId)}/roles`);
}

export async function fetchEchoRoleCategories(
  token: string,
  serverId: string,
): Promise<{ categories: EchoRoleCategoryDto[] }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/role-categories`,
  );
}

export async function postEchoRoleCategory(
  token: string,
  serverId: string,
  name: string,
): Promise<{ id: string }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/role-categories`,
    { method: 'POST', body: JSON.stringify({ name }) },
  );
}

export async function patchEchoRoleCategory(
  token: string,
  serverId: string,
  categoryId: string,
  name: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/role-categories/${encodeURIComponent(categoryId)}`,
    { method: 'PATCH', body: JSON.stringify({ name }) },
  );
}

export async function deleteEchoRoleCategory(
  token: string,
  serverId: string,
  categoryId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/role-categories/${encodeURIComponent(categoryId)}`,
    { method: 'DELETE' },
  );
}

export async function putEchoRoleCategoryOrder(
  token: string,
  serverId: string,
  categoryIds: string[],
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/role-categories/order`,
    {
      method: 'PUT',
      body: JSON.stringify({ categoryIds }),
    },
  );
}

export async function fetchEchoRoleLinks(
  token: string,
  serverId: string,
): Promise<{ roleLinks: EchoRoleLinkDto[] }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/role-links`,
  );
}

export async function putEchoRoleLinks(
  token: string,
  serverId: string,
  anchorRoleId: string,
  links: { linkedRoleId: string; twoWay: boolean }[],
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/roles/${encodeURIComponent(anchorRoleId)}/links`,
    {
      method: 'PUT',
      body: JSON.stringify({ links }),
    },
  );
}
