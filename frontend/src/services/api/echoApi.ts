// Minimal echo API wrappers used by orchestration services.
export async function hydrateWorkspace(apiBase: string, token?: string) {
  const res = await fetch(`${apiBase}/workspace/hydrate`, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error('Failed to hydrate workspace');
  return res.json();
}

export async function joinServerWithInvite(
  apiBase: string,
  token: string,
  inviteCode: string,
) {
  const res = await fetch(`${apiBase}/servers/join/${inviteCode}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error('Failed to join server');
  return res.json();
}
