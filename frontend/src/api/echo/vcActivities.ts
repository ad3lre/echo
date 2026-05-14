import { echoFetch } from './transport';
import type { EchoVcActivityKey } from '@shared/vcActivityCatalog';

export type EchoVcActivityPopularityItem = {
  activityKey: EchoVcActivityKey;
  openCount: number;
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
