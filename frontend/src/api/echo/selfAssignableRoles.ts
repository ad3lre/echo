import type {
  EchoSelfRolesConfig,
  EchoSelfRolesPanel,
} from '@shared/types/selfAssignableRoles';
import { echoFetch } from './transport';

export async function fetchEchoSelfRolesConfig(
  token: string,
  serverId: string,
): Promise<EchoSelfRolesConfig> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/self-roles-config`,
  );
}

export async function patchEchoSelfRolesConfig(
  token: string,
  serverId: string,
  updates: Partial<EchoSelfRolesConfig>,
): Promise<EchoSelfRolesConfig> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/self-roles-config`,
    { method: 'PATCH', body: JSON.stringify(updates) },
  );
}

export async function fetchEchoSelfRolesPanel(
  token: string,
  serverId: string,
): Promise<EchoSelfRolesPanel> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/self-roles-panel`,
  );
}

export async function postEchoSelfRoleToggle(
  token: string,
  serverId: string,
  roleId: string,
  assign: boolean,
): Promise<EchoSelfRolesPanel | null> {
  const res = await echoFetch<EchoSelfRolesPanel | Record<string, never>>(
    token,
    `/servers/${encodeURIComponent(serverId.trim())}/self-roles/toggle`,
    {
      method: 'POST',
      body: JSON.stringify({ roleId, assign }),
    },
  );
  if (res && typeof res === 'object' && 'categories' in res) {
    return res as EchoSelfRolesPanel;
  }
  return null;
}
