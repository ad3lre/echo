/**
 * Chat text E2EE was removed; voice/calls still use device bundles + LiveKit E2EE.
 * Legacy DB rows may still have ciphertext — clients get a placeholder, not decrypt.
 */

export const CHAT_E2EE_REMOVED_DETAIL =
  'Encrypted chat messages are no longer supported. Voice uses end-to-end encryption by default.';

export const LEGACY_ENCRYPTED_CHAT_MESSAGE_PLACEHOLDER =
  '[Encrypted message — chat encryption is no longer available]';

export function rowHasLegacyChatE2eeCiphertext(
  e2eeCiphertext: string | undefined | null,
): boolean {
  return typeof e2eeCiphertext === 'string' && e2eeCiphertext.trim().length > 0;
}

/** Display text for legacy encrypted chat rows; strips wire encryption from API/socket. */
export function contentForLegacyEncryptedChatRow(
  content: string,
  e2eeCiphertext: string | undefined | null,
): string {
  if (!rowHasLegacyChatE2eeCiphertext(e2eeCiphertext)) {
    return content;
  }
  if (content.trim()) {
    return content;
  }
  return LEGACY_ENCRYPTED_CHAT_MESSAGE_PLACEHOLDER;
}
