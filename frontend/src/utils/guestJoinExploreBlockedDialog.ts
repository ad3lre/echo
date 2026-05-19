import { EchoApiError } from '@/api/echo/transport';
import { requestAppAlert } from '@/utils/appDialogs';

/** Server rejects Explore/directory joins for guest sessions (`echoServersRoutes.guestServerExploreForbidden`). */
export function isEchoUpgradeRequiredJoinError(e: unknown): boolean {
  return e instanceof EchoApiError && e.body.code === 'UPGRADE_REQUIRED';
}

/**
 * Modal shown when a guest (or account tier) cannot use Explore directory join.
 * Prefer this over a toast alone so the restriction is obvious.
 */
export async function requestGuestExploreJoinBlockedModal(
  apiMessage?: string,
): Promise<void> {
  const hint = apiMessage?.trim();
  await requestAppAlert({
    title: 'Can’t join from Explore with this account',
    message: hint
      ? `${hint}\n\nTo join listed servers from the directory, create a free Echo account with email (upgrade from your profile or the guest banner). You can still join a community if someone sends you an invite link.`
      : 'This account type can’t join servers from the public Explore directory. Create a free Echo account with email to join listed communities, or use an invite link from a member.',
    confirmLabel: 'OK',
  });
}
