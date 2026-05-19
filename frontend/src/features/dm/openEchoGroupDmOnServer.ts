import { openEchoGroupDmChannel } from './echoDmCommandFacade';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
import { UIErrorBus } from '@/utils/uiErrorBus';

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
    UIErrorBus.emit({
      context: 'postEchoOpenGroupDm',
      severity: 'warning',
      userMessage:
        e instanceof Error && e.message.trim()
          ? e.message.trim()
          : 'Could not open the group DM. Try again.',
    });
  }
  return null;
}
