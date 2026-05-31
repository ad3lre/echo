import { describe, expect, it } from 'vitest';
import { shouldDismissIncomingChatToastForDmContext } from './incomingChatToastDmDismiss';

describe('shouldDismissIncomingChatToastForDmContext', () => {
  it('dismisses incoming chat message toasts in the DM rail', () => {
    expect(
      shouldDismissIncomingChatToastForDmContext({
        toastVariant: 'incoming_chat_message',
        isDmUiContext: true,
      }),
    ).toBe(true);
  });

  it('keeps incoming chat message toasts outside the DM rail', () => {
    expect(
      shouldDismissIncomingChatToastForDmContext({
        toastVariant: 'incoming_chat_message',
        isDmUiContext: false,
      }),
    ).toBe(false);
  });

  it('does not dismiss other toast variants in the DM rail', () => {
    expect(
      shouldDismissIncomingChatToastForDmContext({
        toastVariant: 'incoming_call',
        isDmUiContext: true,
      }),
    ).toBe(false);
    expect(
      shouldDismissIncomingChatToastForDmContext({
        toastVariant: 'default',
        isDmUiContext: true,
      }),
    ).toBe(false);
  });
});
