import { echoFetch } from './transport';
import type { EchoVcActivityKey } from '@shared/vcActivityCatalog';

export type EchoVcActivityPopularityItem = {
  activityKey: EchoVcActivityKey;
  openCount: number;
};

export type EchoYoutubeWatchTogetherUsageResponse = {
  redisAvailable: boolean;
  utcDay: string;
  userUsedSec: number;
  globalUsedSec: number;
  userBudgetSec: number;
  globalBudgetSec: number;
  browseCostSec: number;
};

export async function fetchEchoVcActivityPopularity(
  token: string,
): Promise<{ items: EchoVcActivityPopularityItem[] }> {
  return echoFetch(token, '/vc-activities/popularity');
}

export async function postEchoVcActivityOpen(
  token: string,
  activityKey: EchoVcActivityKey,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/vc-activities/${encodeURIComponent(activityKey)}/open`,
    { method: 'POST' },
  );
}

export async function fetchEchoYoutubeWatchTogetherUsage(
  token: string,
): Promise<EchoYoutubeWatchTogetherUsageResponse> {
  return echoFetch(token, '/vc-activities/youtube/usage');
}

export async function postEchoYoutubeWatchTogetherUsage(
  token: string,
  elapsedSec: number,
): Promise<EchoYoutubeWatchTogetherUsageResponse> {
  return echoFetch(token, '/vc-activities/youtube/usage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ elapsedSec }),
  });
}
