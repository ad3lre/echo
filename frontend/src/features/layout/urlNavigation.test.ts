import { describe, expect, it } from 'vitest';
import {
  formatAppPathname,
  isAppNavPath,
  isForgotPasswordPath,
  isResetPasswordPath,
  mergeModalSearchParams,
  parseAppPathname,
  parseLegalDocPath,
  parseGuildSettingsSectionFromQuery,
  parseModalQueries,
  parseUserSettingsSectionFromQuery,
  parsedPathFromMainSurface,
  shouldReplaceHistoryLeavingExploreForDmPath,
  stripBasePath,
  withBasePath,
} from './urlNavigation';
import type { NavState } from './mainSurface';

describe('stripBasePath / withBasePath', () => {
  it('strips subpath base', () => {
    expect(stripBasePath('/app/channels/@me', '/app/')).toBe('/channels/@me');
    expect(withBasePath('/channels/@me', '/app/')).toBe('/app/channels/@me');
  });
  it('no-ops for root base', () => {
    expect(stripBasePath('/channels/@me', '/')).toBe('/channels/@me');
    expect(withBasePath('/explore', '/')).toBe('/explore');
  });
});

describe('parseLegalDocPath', () => {
  it('maps /legal/{slug} to tab ids', () => {
    expect(parseLegalDocPath('/legal/terms', '/')).toBe('terms');
    expect(parseLegalDocPath('/legal/privacy', '/')).toBe('privacy');
    expect(parseLegalDocPath('/legal/community', '/')).toBe('community');
    expect(parseLegalDocPath('/legal/attributions', '/')).toBe('attributions');
  });

  it('respects base path', () => {
    expect(parseLegalDocPath('/app/legal/terms', '/app/')).toBe('terms');
  });

  it('returns null for unknown or partial paths', () => {
    expect(parseLegalDocPath('/legal', '/')).toBe(null);
    expect(parseLegalDocPath('/legal/other', '/')).toBe(null);
    expect(parseLegalDocPath('/channels/@me', '/')).toBe(null);
  });
});

describe('parseAppPathname / formatAppPathname round-trip', () => {
  const base = '/';

  it('explore', () => {
    const p = parseAppPathname('/explore', base);
    expect(p).toEqual({ kind: 'explore' });
    expect(formatAppPathname(p, base)).toBe('/explore');
  });

  it('dm idle', () => {
    const p = parseAppPathname('/channels/@me', base);
    expect(p).toEqual({ kind: 'dm_idle' });
    expect(formatAppPathname(p, base)).toBe('/channels/@me');
  });

  it('dm friends / notifications / legacy requests', () => {
    expect(parseAppPathname('/channels/@me/friends', base)).toEqual({
      kind: 'dm_friends',
    });
    expect(parseAppPathname('/channels/@me/notifications', base)).toEqual({
      kind: 'dm_notifications',
    });
    expect(parseAppPathname('/channels/@me/requests', base)).toEqual({
      kind: 'dm_idle',
    });
    expect(formatAppPathname({ kind: 'dm_friends' }, base)).toBe(
      '/channels/@me/friends',
    );
    expect(formatAppPathname({ kind: 'dm_notifications' }, base)).toBe(
      '/channels/@me/notifications',
    );
  });

  it('dm thread with c/ prefix', () => {
    const id = 'dm-user123';
    const p = parseAppPathname(
      `/channels/@me/c/${encodeURIComponent(id)}`,
      base,
    );
    expect(p).toEqual({ kind: 'dm_thread', channelId: id });
    expect(formatAppPathname(p, base)).toBe(
      `/channels/@me/c/${encodeURIComponent(id)}`,
    );
  });

  it('dm thread two-segment (legacy)', () => {
    const id = 'snowflake-id-only';
    const p = parseAppPathname(`/channels/@me/${encodeURIComponent(id)}`, base);
    expect(p).toEqual({ kind: 'dm_thread', channelId: id });
  });

  it('guild server + channel', () => {
    const p = parseAppPathname('/channels/srv1/general', base);
    expect(p).toEqual({
      kind: 'guild',
      serverId: 'srv1',
      channelId: 'general',
    });
    expect(
      formatAppPathname(
        p as { kind: 'guild'; serverId: string; channelId: string },
        base,
      ),
    ).toBe('/channels/srv1/general');
  });

  it('encodes special characters in guild ids', () => {
    const p = { kind: 'guild' as const, serverId: 'a/b', channelId: 'c d' };
    const path = formatAppPathname(p, base);
    expect(path).toBe('/channels/a%2Fb/c%20d');
    expect(parseAppPathname(path, base)).toEqual({
      kind: 'guild',
      serverId: 'a/b',
      channelId: 'c d',
    });
  });

  it('preserves plus signs in path segments', () => {
    expect(parseAppPathname('/channels/a+b/c+d', base)).toEqual({
      kind: 'guild',
      serverId: 'a+b',
      channelId: 'c+d',
    });
  });

  it('parses public invite short path /{vanity} as guild with empty channel', () => {
    expect(parseAppPathname('/server1', base)).toEqual({
      kind: 'guild',
      serverId: 'server1',
      channelId: '',
    });
    expect(parseAppPathname('/my-guild', base)).toEqual({
      kind: 'guild',
      serverId: 'my-guild',
      channelId: '',
    });
  });

  it('parses reserved single-segment paths as unknown', () => {
    expect(parseAppPathname('/legal', base)).toEqual({
      kind: 'unknown',
      raw: '/legal',
    });
    expect(parseAppPathname('/assets', base)).toEqual({
      kind: 'unknown',
      raw: '/assets',
    });
  });

  it('treats malformed encoded vanity paths as unknown instead of throwing', () => {
    expect(parseAppPathname('/%', base)).toEqual({
      kind: 'unknown',
      raw: '/%',
    });
  });

  it('treats malformed encoded guild paths as unknown instead of throwing', () => {
    expect(parseAppPathname('/channels/%/general', base)).toEqual({
      kind: 'unknown',
      raw: '/channels/%/general',
    });
    expect(parseAppPathname('/channels/srv/%', base)).toEqual({
      kind: 'unknown',
      raw: '/channels/srv/%',
    });
  });

  it('treats malformed encoded DM paths as unknown instead of throwing', () => {
    expect(parseAppPathname('/channels/@me/c/%', base)).toEqual({
      kind: 'unknown',
      raw: '/channels/@me/c/%',
    });
    expect(parseAppPathname('/channels/@me/%', base)).toEqual({
      kind: 'unknown',
      raw: '/channels/@me/%',
    });
  });
});

describe('isResetPasswordPath / isForgotPasswordPath / isAppNavPath', () => {
  it('detects reset password', () => {
    expect(isResetPasswordPath('/reset-password', '/')).toBe(true);
    expect(isAppNavPath('/reset-password', '/')).toBe(false);
  });
  it('detects forgot password', () => {
    expect(isForgotPasswordPath('/forgot-password', '/')).toBe(true);
    expect(isAppNavPath('/forgot-password', '/')).toBe(false);
  });
  it('allows channels and explore', () => {
    expect(isAppNavPath('/channels/@me', '/')).toBe(true);
    expect(isAppNavPath('/explore', '/')).toBe(true);
    expect(isAppNavPath('/', '/')).toBe(true);
  });
  it('treats single-segment vanity invite paths as app nav', () => {
    expect(isAppNavPath('/my-guild', '/')).toBe(true);
    expect(isAppNavPath('/server1', '/')).toBe(true);
  });
  it('excludes reserved top-level slugs from vanity short paths', () => {
    expect(isAppNavPath('/reset-password', '/')).toBe(false);
    expect(isAppNavPath('/forgot-password', '/')).toBe(false);
    expect(isAppNavPath('/channels', '/')).toBe(false);
    expect(isAppNavPath('/assets', '/')).toBe(false);
  });
});

describe('modal queries', () => {
  it('parseModalQueries', () => {
    expect(parseModalQueries('?settings=Discord&foo=1')).toEqual({
      settings: 'Discord',
      guildSettingsServerId: null,
      guildSection: null,
    });
    expect(
      parseModalQueries('?guild_settings=s1&guild_section=Overview'),
    ).toEqual({
      settings: null,
      guildSettingsServerId: 's1',
      guildSection: 'Overview',
    });
  });

  it('mergeModalSearchParams preserves unrelated keys', () => {
    const s = mergeModalSearchParams('?emailVerified=1', {
      settings: 'Profile',
    });
    const sp = new URLSearchParams(s.replace(/^\?/, ''));
    expect(sp.get('emailVerified')).toBe('1');
    expect(sp.get('settings')).toBe('Profile');
  });

  it('mergeModalSearchParams removes when null', () => {
    const s = mergeModalSearchParams('?settings=Discord&x=1', {
      settings: null,
    });
    const sp = new URLSearchParams(s.replace(/^\?/, ''));
    expect(sp.has('settings')).toBe(false);
    expect(sp.get('x')).toBe('1');
  });
});

describe('parseUserSettingsSectionFromQuery / parseGuildSettingsSectionFromQuery', () => {
  it('parses known user sections', () => {
    expect(parseUserSettingsSectionFromQuery('Discord')).toBe('Discord');
    expect(parseUserSettingsSectionFromQuery('Friends')).toBe('Friends');
    expect(
      parseUserSettingsSectionFromQuery(encodeURIComponent('Voice & Video')),
    ).toBe('Voice & Video');
    expect(
      parseUserSettingsSectionFromQuery(encodeURIComponent('Terms & policies')),
    ).toBe('Terms & policies');
    expect(
      parseUserSettingsSectionFromQuery(encodeURIComponent('Formatting guide')),
    ).toBe('Formatting guide');
    expect(parseUserSettingsSectionFromQuery('Accessibility')).toBe(
      'Accessibility',
    );
    expect(parseUserSettingsSectionFromQuery('Desktop')).toBe('Desktop');
    expect(parseUserSettingsSectionFromQuery('Nope')).toBeNull();
    expect(parseUserSettingsSectionFromQuery('%')).toBeNull();
  });
  it('parses known guild sections', () => {
    expect(parseGuildSettingsSectionFromQuery('Overview')).toBe('Overview');
    expect(parseGuildSettingsSectionFromQuery('Events')).toBe('Events');
    expect(parseGuildSettingsSectionFromQuery('Structure')).toBe('Structure');
    expect(parseGuildSettingsSectionFromQuery('Members')).toBe('Members');
    expect(parseGuildSettingsSectionFromQuery('Applications')).toBe('Access');
    expect(parseGuildSettingsSectionFromQuery('Access')).toBe('Access');
    expect(parseGuildSettingsSectionFromQuery('Discord')).toBe('Discord');
    expect(parseGuildSettingsSectionFromQuery('Banned%20Words')).toBe(
      'Banned Words',
    );
    expect(parseGuildSettingsSectionFromQuery('Audit%20Log')).toBe('Audit Log');
    expect(parseGuildSettingsSectionFromQuery('Nope')).toBeNull();
    expect(parseGuildSettingsSectionFromQuery('%')).toBeNull();
  });
});

describe('parsedPathFromMainSurface', () => {
  const navBase = (partial: Partial<NavState>): NavState => ({
    rail: 'dm',
    dmSubView: 'messages',
    activeChannelId: 'general',
    selectedServerId: 'echo',
    ...partial,
  });

  it('maps explore and dm subs', () => {
    expect(
      parsedPathFromMainSurface(navBase({ rail: 'explore' }), {
        type: 'explore',
      }),
    ).toEqual({ kind: 'explore' });
    expect(
      parsedPathFromMainSurface(navBase({ dmSubView: 'friends' }), {
        type: 'dmFriends',
      }),
    ).toEqual({ kind: 'dm_friends' });
    expect(
      parsedPathFromMainSurface(navBase({ dmSubView: 'notifications' }), {
        type: 'dmNotifications',
      }),
    ).toEqual({ kind: 'dm_notifications' });
    expect(
      parsedPathFromMainSurface(navBase({ dmSubView: 'messages' }), {
        type: 'dmRequests',
      }),
    ).toEqual({ kind: 'dm_idle' });
    expect(
      parsedPathFromMainSurface(navBase({}), { type: 'dmMessagesIdle' }),
    ).toEqual({
      kind: 'dm_idle',
    });
  });

  it('maps dm thread and persisted echo id', () => {
    expect(
      parsedPathFromMainSurface(navBase({ activeChannelId: 'dm-u1' }), {
        type: 'dmThread',
        threadId: 'dm-u1',
      }),
    ).toEqual({ kind: 'dm_thread', channelId: 'dm-u1' });
    expect(
      parsedPathFromMainSurface(
        navBase({ activeChannelId: 'snow1', selectedServerId: 'srv' }),
        { type: 'unknown', reason: 'x', channelId: 'snow1' },
        { isPersistedEchoDmThread: (id) => id === 'snow1' },
      ),
    ).toEqual({ kind: 'dm_thread', channelId: 'snow1' });
  });

  it('maps guild text/voice', () => {
    expect(
      parsedPathFromMainSurface(
        navBase({
          rail: 'servers',
          selectedServerId: 's1',
          activeChannelId: 'c1',
        }),
        { type: 'serverText', channelId: 'c1' },
      ),
    ).toEqual({ kind: 'guild', serverId: 's1', channelId: 'c1' });
  });
});

describe('shouldReplaceHistoryLeavingExploreForDmPath', () => {
  it('is true only when leaving explore for DM URL kinds', () => {
    expect(
      shouldReplaceHistoryLeavingExploreForDmPath(
        { kind: 'explore' },
        { kind: 'dm_thread', channelId: 'x' },
      ),
    ).toBe(true);
    expect(
      shouldReplaceHistoryLeavingExploreForDmPath(
        { kind: 'explore' },
        { kind: 'dm_idle' },
      ),
    ).toBe(true);
    expect(
      shouldReplaceHistoryLeavingExploreForDmPath(
        { kind: 'guild', serverId: 's', channelId: 'c' },
        { kind: 'dm_thread', channelId: 'x' },
      ),
    ).toBe(false);
    expect(
      shouldReplaceHistoryLeavingExploreForDmPath(
        { kind: 'explore' },
        { kind: 'guild', serverId: 's', channelId: 'c' },
      ),
    ).toBe(false);
    expect(
      shouldReplaceHistoryLeavingExploreForDmPath(
        { kind: 'explore' },
        { kind: 'explore' },
      ),
    ).toBe(false);
  });
});
