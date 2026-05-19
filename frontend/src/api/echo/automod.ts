import { echoFetch } from './transport';
import type {
  AutomodAction,
  AutomodEffectiveCapabilities,
  AutomodNode,
  EchoAutomodRule,
} from '@shared/types/automod';

export async function fetchEchoAutomodCapabilities(
  token: string,
  serverId: string,
): Promise<AutomodEffectiveCapabilities> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/automod/effective-capabilities`,
  );
}

export async function fetchEchoAutomodRules(
  token: string,
  serverId: string,
): Promise<{ rules: EchoAutomodRule[] }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/automod/rules`,
  );
}

export async function createEchoAutomodRule(
  token: string,
  serverId: string,
  body: {
    name: string;
    icon?: string;
    enabled?: boolean;
    triggerType?: string;
    conditionTree: AutomodNode;
    actions: AutomodAction[];
    exemptRoleIds?: string[];
    exemptChannelIds?: string[];
    logChannelId?: string | null;
  },
): Promise<{ rule: EchoAutomodRule }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/automod/rules`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export async function updateEchoAutomodRule(
  token: string,
  serverId: string,
  ruleId: string,
  body: Partial<{
    name: string;
    icon: string;
    enabled: boolean;
    triggerType: string;
    conditionTree: AutomodNode;
    actions: AutomodAction[];
    exemptRoleIds: string[];
    exemptChannelIds: string[];
    logChannelId: string | null;
  }>,
): Promise<{ rule: EchoAutomodRule }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/automod/rules/${encodeURIComponent(ruleId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  );
}

export async function deleteEchoAutomodRule(
  token: string,
  serverId: string,
  ruleId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/automod/rules/${encodeURIComponent(ruleId)}`,
    { method: 'DELETE' },
  );
}

export async function reorderEchoAutomodRules(
  token: string,
  serverId: string,
  orderedIds: string[],
): Promise<{ rules: EchoAutomodRule[] }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/automod/rules/order`,
    {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds }),
    },
  );
}

export type AutomodTestAnnotation = {
  node: AutomodNode;
  matched: boolean;
  children?: AutomodTestAnnotation[];
};

export async function testEchoAutomodRule(
  token: string,
  serverId: string,
  ruleId: string,
  body: {
    sampleContent?: string;
    sampleChannelId?: string;
    sampleAuthorRoleIds?: string[];
    mentionCount?: number;
  },
): Promise<{
  annotation: AutomodTestAnnotation;
  wouldMatch: boolean;
  rule: EchoAutomodRule;
}> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/automod/rules/${encodeURIComponent(ruleId)}/test`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export async function fetchEchoAutomodRuleHits(
  token: string,
  serverId: string,
  ruleId: string,
  limit = 50,
): Promise<{
  hits: Array<{
    id: string;
    userId: string;
    channelId: string;
    messageId: string | null;
    outcome: string;
    createdAt: string;
  }>;
}> {
  const q = new URLSearchParams({ limit: String(limit) });
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/automod/rules/${encodeURIComponent(ruleId)}/hits?${q}`,
  );
}
