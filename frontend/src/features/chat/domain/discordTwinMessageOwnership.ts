import type { MessageWithAuthor } from '@shared/types';

type TwinOwnFields = Pick<
  MessageWithAuthor,
  'authorId' | 'authorIsDiscordShadow' | 'authorDiscordUserId' | 'author'
>;

/**
 * Message counts as authored by the current Echo user for UI (edit/delete, scroll parity)
 * when it is their row or a Discord-import shadow row for the same linked Discord account.
 */
export function isEchoMessageLogicallyOwn(
  msg: TwinOwnFields,
  currentUserId: string | undefined,
  linkedDiscordUserId: string | undefined | null,
): boolean {
  const cur = currentUserId?.trim();
  if (!cur) return false;
  if (msg.authorId === cur) return true;
  const linked = linkedDiscordUserId?.trim();
  const twinDid = msg.authorDiscordUserId?.trim();
  if (!linked || !twinDid || twinDid !== linked) return false;
  const shadow =
    msg.authorIsDiscordShadow === true || msg.author?.isDiscordShadow === true;
  return shadow;
}
