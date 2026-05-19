/**
 * Modal query open/strip policy for URL deep links + desired History API search params.
 * Pure — no Vue refs.
 */

import type { AuthUserPublic } from '@/api/authClient';
import type { SettingsSection } from '@/features/settings/types';
import { isSettingsSectionVisibleForUser } from '@/features/settings/settingsSectionVisibility';
import type { ServerSettingsSection } from '@/features/server-settings/types';
import type { EchoModalQueries } from './urlNavigation';
import {
  parseGuildSettingsSectionFromQuery,
  parseUserSettingsSectionFromQuery,
} from './urlNavigation';

export type UserSettingsModalEffect =
  | { kind: 'closed' }
  | { kind: 'open'; initial: SettingsSection; active: SettingsSection };

export type GuildSettingsModalEffect =
  | { kind: 'closed' }
  | {
      kind: 'open';
      serverId: string;
      initial: ServerSettingsSection | null;
      active: ServerSettingsSection;
    };

export function planModalQueryEffectsFromUrl(params: {
  mq: EchoModalQueries;
  isAuthenticated: boolean;
  backendUser: AuthUserPublic | null | undefined;
  canOpenServerSettingsForServer: (serverId: string) => boolean;
}): {
  stripSettings: boolean;
  stripGuild: boolean;
  userSettings: UserSettingsModalEffect;
  guildSettings: GuildSettingsModalEffect;
} {
  const { mq, isAuthenticated, backendUser, canOpenServerSettingsForServer } =
    params;

  let stripSettings = false;
  let stripGuild = false;

  let userSettings: UserSettingsModalEffect = { kind: 'closed' };
  if (mq.settings) {
    const sec = parseUserSettingsSectionFromQuery(mq.settings);
    if (
      sec &&
      isAuthenticated &&
      isSettingsSectionVisibleForUser(sec, backendUser)
    ) {
      userSettings = { kind: 'open', initial: sec, active: sec };
    } else {
      stripSettings = true;
      userSettings = { kind: 'closed' };
    }
  }

  let guildSettings: GuildSettingsModalEffect = { kind: 'closed' };
  if (mq.guildSettingsServerId) {
    const sid = mq.guildSettingsServerId;
    const gsec = parseGuildSettingsSectionFromQuery(mq.guildSection);
    if (canOpenServerSettingsForServer(sid)) {
      guildSettings = {
        kind: 'open',
        serverId: sid,
        initial: gsec,
        active: gsec ?? 'Overview',
      };
    } else {
      stripGuild = true;
      guildSettings = { kind: 'closed' };
    }
  }

  return { stripSettings, stripGuild, userSettings, guildSettings };
}

export function buildModalSearchPatchFromState(params: {
  isSettingsModalOpen: boolean;
  isAuthenticated: boolean;
  settingsModalActiveSection: SettingsSection;
  isServerSettingsModalOpen: boolean;
  selectedServerId: string | null | undefined;
  serverSettingsModalActiveSection: ServerSettingsSection;
}): Partial<{
  settings: string | null;
  guild_settings: string | null;
  guild_section: string | null;
}> {
  const patch: Partial<{
    settings: string | null;
    guild_settings: string | null;
    guild_section: string | null;
  }> = {};
  if (params.isSettingsModalOpen && params.isAuthenticated) {
    patch.settings = params.settingsModalActiveSection;
  } else {
    patch.settings = null;
  }
  const sid = params.selectedServerId;
  if (params.isServerSettingsModalOpen && sid && sid !== 'echo') {
    patch.guild_settings = sid;
    patch.guild_section = params.serverSettingsModalActiveSection;
  } else {
    patch.guild_settings = null;
    patch.guild_section = null;
  }
  return patch;
}
