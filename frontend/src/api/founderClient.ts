import { API_BASE } from '@/config';
import { ApiError } from '@/api/client';

export type FounderUser = {
  id: string;
  username: string;
  email?: string;
  emailVerified: boolean;
  phone?: string;
  pendingPhone?: string;
  phoneVerified: boolean;
  displayName: string;
  pfp: string;
  status: 'online' | 'idle' | 'do_not_disturb' | 'offline';
  customStatus?: string;
  bannerImage?: string;
  bannerColor?: string;
  bannerRefractionEnabled?: boolean;
  bannerBlurEnabled?: boolean;
  bannerBlackoutEnabled?: boolean;
  createdAt: string;
  updatedAt?: string;
  isGuest?: boolean;
  guestPendingEmail?: string;
  guestMintedAt?: string;
  guestSuspendedUntil?: string;
  guestDeletedAt?: string;
  guestTotalMessages?: number;
  totpEnabled?: boolean;
  isDiscordShadow?: boolean;
  echoPlan?: 'free' | 'plus' | 'black';
  hasActiveSubscription?: boolean;
};

type FounderSessionResponse = {
  enabled: boolean;
  authenticated: boolean;
  username: string | null;
};

export type FounderDashboardPayload = {
  generatedAt: string;
  founder: {
    username: string | null;
    diagnosticsEnabled: boolean;
  };
  counts: {
    users: number;
    guests: number;
    verifiedEmails: number;
    bugReports: number;
  };
  health: {
    status: 'ok';
    timestamp: string;
    db: string;
    nats: string;
    backendStorageMode: string;
    useMockDb: boolean;
  };
  diagnostics: {
    enabled: boolean;
    sessionId: string;
    sessionDir: string;
  };
  monitoring: {
    files: Array<{
      name: string;
      relativePath: string;
      sizeBytes: number;
      updatedAt: string;
    }>;
    summary: {
      dashboardTitle: string;
      dashboardUid: string;
      panelTitles: string[];
      alerts: string[];
      recordingRules: string[];
    };
    metricsPreview: string;
  };
  localLogs: Array<{
    name: string;
    relativePath: string;
    sizeBytes: number;
    updatedAt: string;
    preview: string;
  }>;
  watcherTools: Array<{
    name: string;
    relativePath: string;
    sizeBytes: number;
    updatedAt: string;
  }>;
  bugReports: Array<{
    id: string;
    body: string;
    createdAt: string;
    reporter: {
      id: string;
      username: string;
      displayName: string;
      email?: string;
    };
    attachmentUrls: string[];
    clientMeta: unknown;
    traceJson: unknown;
  }>;
  users: FounderUser[];
};

type FounderLoginResponse = {
  ok: boolean;
  username: string;
};

async function parseError(res: Response): Promise<never> {
  let message = `${res.status} ${res.statusText}`;
  let code = 'UNKNOWN';
  try {
    const body = (await res.json()) as { code?: string; message?: string };
    if (typeof body?.message === 'string' && body.message.trim()) {
      message = body.message;
    }
    if (typeof body?.code === 'string' && body.code.trim()) {
      code = body.code;
    }
  } catch {
    /* ignore */
  }
  throw new ApiError(message, res.status, code);
}

async function founderFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1/founder${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    await parseError(res);
  }
  return res.json();
}

export function getFounderSession(): Promise<FounderSessionResponse> {
  return founderFetch<FounderSessionResponse>('/session', {
    method: 'GET',
  });
}

export function postFounderLogin(input: {
  username: string;
  password: string;
}): Promise<FounderLoginResponse> {
  return founderFetch<FounderLoginResponse>('/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function postFounderLogout(): Promise<{ ok: boolean }> {
  return founderFetch<{ ok: boolean }>('/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function getFounderDashboard(): Promise<FounderDashboardPayload> {
  return founderFetch<FounderDashboardPayload>('/dashboard', {
    method: 'GET',
  });
}
