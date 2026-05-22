import { requestAppAlert } from '@/utils/appDialogs';
import { MAX_STARRED_SERVERS } from '@/utils/serverRailReorder';

/** Inform the user they cannot add another starred server to the main rail. */
export function showStarredServerLimitAlert(): Promise<void> {
  const n = MAX_STARRED_SERVERS;
  return requestAppAlert({
    title: 'Server rail is full',
    message: `You can pin up to ${n} servers to the server rail. Remove a pin from the rail before adding another.`,
    confirmLabel: 'OK',
  });
}
