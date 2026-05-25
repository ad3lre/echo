import type {
  AppToastAction,
  AppToastDetail,
} from '@/utils/controllerMissingAction';

export function shouldOpenToastMessageContextMenu(ev: {
  type: string;
  button: number;
  defaultPrevented?: boolean;
}): boolean {
  if (ev.defaultPrevented) return false;
  if (ev.type === 'contextmenu') return true;
  // Some desktop shells emit auxclick for secondary click.
  if (ev.type === 'auxclick') return ev.button === 2;
  return false;
}

export function canOpenToastMessageContextMenu(
  toast: AppToastDetail | null | undefined,
): boolean {
  return toast?.variant === 'incoming_chat_message';
}

export function resolveToastMessagePrimaryAction(
  actions: readonly AppToastAction[],
): AppToastAction | null {
  if (!actions.length) return null;
  return (
    actions.find((a) => a.id === 'open_message_channel') ?? actions[0] ?? null
  );
}

export function shouldHideToastPrimaryActionForQuickReply(
  toast: AppToastDetail | null | undefined,
  quickReplyText: string,
): boolean {
  if (toast?.variant !== 'incoming_chat_message') return false;
  if (!toast.quickReplyChannelId?.trim()) return false;
  return !quickReplyText.trim();
}
