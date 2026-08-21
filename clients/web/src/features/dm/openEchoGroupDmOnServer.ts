import { EchoApiError } from '@/api/echo/transport';
import { openEchoGroupDmChannel } from './echoDmCommandFacade';
import { reportPrimaryFlowFailure } from '@/features/layout/failures/primaryFlowFailure';
import { UIErrorBus } from '@/features/layout/failures/uiErrorBus';

export type OpenEchoGroupDmParams = {
  name: string;
  /** Friend user IDs to include (excluding the current user). */
  memberIds: string[];
  currentUserId: string;
};

/** Session/auth + hydrate snapshot at call time — keeps layout shell from wrapping `openEchoGroupDmOnServer` inline. */
export type OpenEchoGroupDmSessionBridge = {
  getIsAuthenticated: () => boolean;
  getAccessToken: () => string | null | undefined;
  hydrateEchoFromApi: () => Promise<void>;
};

export function createOpenEchoGroupDmOnServerInvoker(
  session: OpenEchoGroupDmSessionBridge,
): (params: OpenEchoGroupDmParams) => Promise<string | null> {
  return (params) =>
    openEchoGroupDmOnServer({
      isAuthenticated: session.getIsAuthenticated(),
      accessToken: session.getAccessToken(),
      hydrateEchoFromApi: session.hydrateEchoFromApi,
      params,
    });
}

export async function openEchoGroupDmOnServer(opts: {
  isAuthenticated: boolean;
  accessToken: string | null | undefined;
  hydrateEchoFromApi: () => Promise<void>;
  params: OpenEchoGroupDmParams;
}): Promise<string | null> {
  const token = (opts.accessToken ?? '').trim();
  if (!opts.isAuthenticated) return null;
  const memberSet = new Set<string>([
    opts.params.currentUserId,
    ...opts.params.memberIds,
  ]);
  const memberUserIds = Array.from(memberSet);
  try {
    const channelId = await openEchoGroupDmChannel(token, {
      memberUserIds,
      name: opts.params.name,
    });
    if (channelId) {
      await opts.hydrateEchoFromApi();
      return channelId;
    }
  } catch (e) {
    reportPrimaryFlowFailure('postEchoOpenGroupDm', e, undefined, {
      showBanner: false,
    });
    const code =
      e instanceof EchoApiError && typeof e.body.code === 'string'
        ? e.body.code
        : undefined;
    UIErrorBus.emit({
      context: 'postEchoOpenGroupDm',
      severity: 'warning',
      userMessage:
        e instanceof Error && e.message.trim()
          ? e.message.trim()
          : 'Could not open the group DM. Try again.',
      ...(code ? { code } : {}),
    });
  }
  return null;
}
