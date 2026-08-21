export type DiscordProfileImportPromptInput = {
  authed: boolean;
  guest: boolean | undefined;
  mockDataMode: boolean;
  promptDone: boolean;
  hasDiscordLink: boolean;
  alreadyImported: boolean;
  shouldOffer: boolean;
};

/** One-time Discord profile-import prompt visibility (no sessionStorage). */
export function resolveDiscordProfileImportPromptOpen(
  input: DiscordProfileImportPromptInput,
): boolean {
  if (
    !input.authed ||
    input.guest ||
    input.mockDataMode ||
    input.promptDone ||
    !input.hasDiscordLink
  ) {
    return false;
  }
  if (input.alreadyImported) return false;
  return input.shouldOffer;
}

export type UiErrorBannerForCreateAccount = {
  message?: string;
  code?: string;
} | null;

export function uiErrorBannerShowsCreateAccount(
  banner: UiErrorBannerForCreateAccount,
): boolean {
  if (!banner?.message) return false;
  return (
    banner.code === 'GUEST_FORBIDDEN' ||
    banner.message.includes('Create an account to use this feature')
  );
}

export function serverLooksDiscordImported(
  server: { discordGuildId?: string } | null | undefined,
): boolean {
  return !!server?.discordGuildId?.trim();
}
