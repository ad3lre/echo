import { Honcho } from '@honcho-ai/sdk';
import { config } from '../../config';
import { HONCHO_FETCH_MS } from '../../constants/outboundHttp';

let client: Honcho | null = null;

export function isHonchoConfigured(): boolean {
  return config.honchoApiKey.trim().length > 0;
}

export function isHonchoActive(): boolean {
  return config.honchoEnabled && isHonchoConfigured();
}

export function getHonchoClient(): Honcho {
  if (!isHonchoConfigured()) {
    throw new Error('HONCHO_API_KEY not configured');
  }
  if (!client) {
    client = new Honcho({
      apiKey: config.honchoApiKey,
      workspaceId: config.honchoWorkspaceId,
      environment: config.honchoEnvironment,
      ...(config.honchoBaseUrl ? { baseURL: config.honchoBaseUrl } : {}),
      timeout: HONCHO_FETCH_MS,
    });
  }
  return client;
}

/** Test-only: reset memoized SDK client between cases. */
export function __resetHonchoClientForTests(): void {
  client = null;
}
