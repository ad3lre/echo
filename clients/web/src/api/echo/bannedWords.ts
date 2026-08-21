import { echoFetch } from './transport';
import type { EchoBannedWordsConfig } from '@shared/types/bannedWords';

export async function fetchEchoBannedWordsConfig(
  token: string,
  serverId: string,
): Promise<{ config: EchoBannedWordsConfig }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/banned-words/config`,
  );
}

export async function updateEchoBannedWordsConfig(
  token: string,
  serverId: string,
  body: Partial<EchoBannedWordsConfig>,
): Promise<{ config: EchoBannedWordsConfig }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/banned-words/config`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  );
}
