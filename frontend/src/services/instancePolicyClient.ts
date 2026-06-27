import type { InstancePolicyPublic } from '@shared/instancePolicy';
import { API_BASE } from '@/config';

export async function fetchInstancePolicyPublic(): Promise<InstancePolicyPublic | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/system/instance-policy`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as InstancePolicyPublic;
  } catch {
    return null;
  }
}
