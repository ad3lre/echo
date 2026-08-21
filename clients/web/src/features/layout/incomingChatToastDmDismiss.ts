export type IncomingChatToastVariant =
  | 'default'
  | 'incoming_call'
  | 'incoming_chat_message';

/** Hide incoming message toasts while the user is browsing the DM rail. */
export function shouldDismissIncomingChatToastForDmContext(input: {
  toastVariant: IncomingChatToastVariant | undefined;
  isDmUiContext: boolean;
}): boolean {
  return input.toastVariant === 'incoming_chat_message' && input.isDmUiContext;
}
