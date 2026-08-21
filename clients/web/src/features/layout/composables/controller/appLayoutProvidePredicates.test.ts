import { describe, expect, it } from 'vitest';
import {
  resolveDiscordProfileImportPromptOpen,
  serverLooksDiscordImported,
  uiErrorBannerShowsCreateAccount,
} from './appLayoutProvidePredicates';

describe('resolveDiscordProfileImportPromptOpen', () => {
  const ready = {
    authed: true,
    guest: false,
    mockDataMode: false,
    promptDone: false,
    hasDiscordLink: true,
    alreadyImported: false,
    shouldOffer: true,
  };

  it('opens when a signed-in Discord-linked account still looks default', () => {
    expect(resolveDiscordProfileImportPromptOpen(ready)).toBe(true);
  });

  it('stays closed for guests, mock mode, and finished prompts', () => {
    expect(
      resolveDiscordProfileImportPromptOpen({ ...ready, guest: true }),
    ).toBe(false);
    expect(
      resolveDiscordProfileImportPromptOpen({ ...ready, mockDataMode: true }),
    ).toBe(false);
    expect(
      resolveDiscordProfileImportPromptOpen({ ...ready, promptDone: true }),
    ).toBe(false);
    expect(
      resolveDiscordProfileImportPromptOpen({
        ...ready,
        alreadyImported: true,
      }),
    ).toBe(false);
  });
});

describe('uiErrorBannerShowsCreateAccount', () => {
  it('shows for GUEST_FORBIDDEN and the create-account copy', () => {
    expect(
      uiErrorBannerShowsCreateAccount({
        code: 'GUEST_FORBIDDEN',
        message: 'nope',
      }),
    ).toBe(true);
    expect(
      uiErrorBannerShowsCreateAccount({
        message: 'Create an account to use this feature',
      }),
    ).toBe(true);
  });

  it('hides when there is no banner message', () => {
    expect(uiErrorBannerShowsCreateAccount(null)).toBe(false);
    expect(uiErrorBannerShowsCreateAccount({ code: 'X' })).toBe(false);
  });
});

describe('serverLooksDiscordImported', () => {
  it('is true only when discordGuildId is non-empty', () => {
    expect(serverLooksDiscordImported({ discordGuildId: 'g1' })).toBe(true);
    expect(serverLooksDiscordImported({ discordGuildId: '  ' })).toBe(false);
    expect(serverLooksDiscordImported(null)).toBe(false);
  });
});
