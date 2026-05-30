import type { AuthUserPublic } from '@/api/authClient';
import { describe, expect, it } from 'vitest';
import {
  buildModalSearchPatchFromState,
  planModalQueryEffectsFromUrl,
} from './urlNavigationModalPolicy';

function testUser(partial: Partial<AuthUserPublic> = {}): AuthUserPublic {
  return {
    id: '1',
    username: 't',
    displayName: 'T',
    pfp: '',
    status: 'online',
    createdAt: '2020-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('planModalQueryEffectsFromUrl', () => {
  it('opens user settings when section valid and authenticated', () => {
    const r = planModalQueryEffectsFromUrl({
      mq: {
        settings: 'Account',
        guildSettingsServerId: null,
        guildSection: null,
        guildEventServerId: null,
        guildEventId: null,
      },
      isAuthenticated: true,
      backendUser: testUser({ hasActiveSubscription: false }),
      canOpenServerSettingsForServer: () => true,
    });
    expect(r.stripSettings).toBe(false);
    expect(r.userSettings.kind).toBe('open');
    if (r.userSettings.kind === 'open') {
      expect(r.userSettings.active).toBe('Account');
    }
  });

  it('strips settings when not authenticated', () => {
    const r = planModalQueryEffectsFromUrl({
      mq: {
        settings: 'Account',
        guildSettingsServerId: null,
        guildSection: null,
        guildEventServerId: null,
        guildEventId: null,
      },
      isAuthenticated: false,
      backendUser: null,
      canOpenServerSettingsForServer: () => true,
    });
    expect(r.stripSettings).toBe(true);
    expect(r.userSettings.kind).toBe('closed');
  });

  it('opens guild settings when allowed', () => {
    const r = planModalQueryEffectsFromUrl({
      mq: {
        settings: null,
        guildSettingsServerId: 'srv1',
        guildSection: null,
        guildEventServerId: null,
        guildEventId: null,
      },
      isAuthenticated: true,
      backendUser: null,
      canOpenServerSettingsForServer: (id) => id === 'srv1',
    });
    expect(r.stripGuild).toBe(false);
    expect(r.guildSettings.kind).toBe('open');
    if (r.guildSettings.kind === 'open') {
      expect(r.guildSettings.serverId).toBe('srv1');
      expect(r.guildSettings.active).toBe('Overview');
    }
  });

  it('strips guild when cannot open', () => {
    const r = planModalQueryEffectsFromUrl({
      mq: {
        settings: null,
        guildSettingsServerId: 'srv1',
        guildSection: null,
        guildEventServerId: null,
        guildEventId: null,
      },
      isAuthenticated: true,
      backendUser: null,
      canOpenServerSettingsForServer: () => false,
    });
    expect(r.stripGuild).toBe(true);
    expect(r.guildSettings.kind).toBe('closed');
  });
});

describe('buildModalSearchPatchFromState', () => {
  it('embeds settings and guild when modals open', () => {
    const p = buildModalSearchPatchFromState({
      isSettingsModalOpen: true,
      isAuthenticated: true,
      settingsModalActiveSection: 'Account',
      isServerSettingsModalOpen: true,
      selectedServerId: 'srv',
      serverSettingsModalActiveSection: 'Roles',
    });
    expect(p.settings).toBe('Account');
    expect(p.guild_settings).toBe('srv');
    expect(p.guild_section).toBe('Roles');
  });

  it('clears guild keys when echo selected', () => {
    const p = buildModalSearchPatchFromState({
      isSettingsModalOpen: false,
      isAuthenticated: true,
      settingsModalActiveSection: 'Account',
      isServerSettingsModalOpen: true,
      selectedServerId: 'echo',
      serverSettingsModalActiveSection: 'Overview',
    });
    expect(p.guild_settings).toBeNull();
    expect(p.guild_section).toBeNull();
  });
});
