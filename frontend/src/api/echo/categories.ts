import { echoFetch } from './transport';

export async function fetchEchoServerCategories(
  token: string,
  serverId: string,
): Promise<{ categories: { id: string; name: string; position: number }[] }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/categories`,
  );
}

export async function postEchoServerCategory(
  token: string,
  serverId: string,
  body: { name: string; position?: number },
): Promise<{ categoryId: string }> {
  return echoFetch(
    token,
    `/servers/${encodeURIComponent(serverId)}/categories`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export async function patchEchoServerCategory(
  token: string,
  serverId: string,
  categoryId: string,
  body: { name?: string; position?: number; siblingIndex?: number },
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/categories/${encodeURIComponent(categoryId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export async function deleteEchoServerCategory(
  token: string,
  serverId: string,
  categoryId: string,
): Promise<void> {
  await echoFetch<Record<string, unknown>>(
    token,
    `/servers/${encodeURIComponent(serverId)}/categories/${encodeURIComponent(categoryId)}`,
    { method: 'DELETE' },
  );
}
