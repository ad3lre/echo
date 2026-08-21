type PinMode = 'pin' | 'unpin';

export function createPinToggleHandlers(
  submitPinToggle: (mode: PinMode, messageId: string) => void,
) {
  return {
    handlePinMessage: (mid: string) => submitPinToggle('pin', mid),
    handleUnpinMessage: (mid: string) => submitPinToggle('unpin', mid),
    unpinMessage: (mid: string) => submitPinToggle('unpin', mid),
  };
}
