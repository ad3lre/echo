import { EchoApiError } from '@/api/echo/transport';
import { requestAppAlert } from '@/utils/appDialogs';
import { echoT } from '@/i18n';
import { translateApiErrorBody } from '@/i18n/apiErrors';

export function isEchoUpgradeRequiredJoinError(e: unknown): boolean {
  return e instanceof EchoApiError && e.body.code === 'UPGRADE_REQUIRED';
}

export async function requestGuestExploreJoinBlockedModal(
  apiMessage?: string,
): Promise<void> {
  const hint = apiMessage?.trim();
  await requestAppAlert({
    title: echoT('dialogs.guestExploreJoin.title'),
    message: hint
      ? echoT('dialogs.guestExploreJoin.messageWithHint', { hint })
      : echoT('dialogs.guestExploreJoin.messageDefault'),
    confirmLabel: echoT('common.ok'),
  });
}

export function guestExploreJoinBlockedMessage(e: unknown): string | null {
  if (e instanceof EchoApiError) {
    return translateApiErrorBody(e.body);
  }
  return null;
}
