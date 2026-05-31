import { describe, expect, it } from 'vitest';
import {
  canOpenToastMessageContextMenu,
  resolveToastMessagePrimaryAction,
  shouldHideToastPrimaryActionForQuickReply,
  shouldOpenToastMessageContextMenu,
} from '@/features/layout/composables/toastMessageContextMenu';
import type { AppToastAction } from '@/utils/controllerMissingAction';

describe('toastMessageContextMenu', () => {
  it('opens menu on contextmenu events', () => {
    expect(
      shouldOpenToastMessageContextMenu({
        type: 'contextmenu',
        button: 2,
      }),
    ).toBe(true);
  });

  it('opens menu on auxclick right button', () => {
    expect(
      shouldOpenToastMessageContextMenu({
        type: 'auxclick',
        button: 2,
      }),
    ).toBe(true);
    expect(
      shouldOpenToastMessageContextMenu({
        type: 'auxclick',
        button: 1,
      }),
    ).toBe(false);
  });

  it('does not open when default already prevented', () => {
    expect(
      shouldOpenToastMessageContextMenu({
        type: 'contextmenu',
        button: 2,
        defaultPrevented: true,
      }),
    ).toBe(false);
  });

  it('only enables for incoming chat message toasts', () => {
    expect(canOpenToastMessageContextMenu({ message: 'x' })).toBe(false);
    expect(
      canOpenToastMessageContextMenu({
        message: 'x',
        variant: 'incoming_chat_message',
      }),
    ).toBe(true);
  });

  it('prefers open_message_channel as primary action', () => {
    const fallback: AppToastAction = {
      id: 'dismiss',
      label: 'Dismiss',
      run: () => {},
    };
    const open: AppToastAction = {
      id: 'open_message_channel',
      label: 'Open',
      run: () => {},
    };
    expect(resolveToastMessagePrimaryAction([fallback, open])).toBe(open);
    expect(resolveToastMessagePrimaryAction([fallback])).toBe(fallback);
    expect(resolveToastMessagePrimaryAction([])).toBeNull();
  });

  it('hides primary Open while quick-reply composer is shown', () => {
    expect(
      shouldHideToastPrimaryActionForQuickReply({
        message: 'x',
        variant: 'incoming_chat_message',
        quickReplyChannelId: 'dm-1',
      }),
    ).toBe(true);
  });

  it('keeps primary action for non-quick-reply toasts', () => {
    expect(
      shouldHideToastPrimaryActionForQuickReply({
        message: 'x',
        variant: 'incoming_chat_message',
      }),
    ).toBe(false);
    expect(
      shouldHideToastPrimaryActionForQuickReply({
        message: 'x',
        variant: 'default',
      }),
    ).toBe(false);
  });
});
