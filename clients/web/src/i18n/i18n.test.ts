import { describe, expect, it } from 'vitest';
import { echoT, i18n, initEchoI18n } from '@/i18n';
import { translateApiErrorBody } from '@/i18n/apiErrors';

describe('i18n', () => {
  it('resolves en-US catalog keys', async () => {
    await initEchoI18n('en-US');
    expect(echoT('common.appName')).toBe('Echo');
    expect(echoT('integrations.discord.connectCta')).toBe('Connect Discord');
  });

  it('translates API errors by code', async () => {
    await initEchoI18n('en-US');
    expect(
      translateApiErrorBody({
        code: 'NOT_SERVER_MEMBER',
        message: 'English fallback from server',
      }),
    ).toContain('member of this server');
  });

  it('loads en-GB with fallback', async () => {
    await initEchoI18n('en-GB');
    const loc = i18n.global.locale;
    const localeValue = typeof loc === 'string' ? loc : loc.value;
    expect(localeValue).toBe('en-GB');
    expect(echoT('common.appName')).toBe('Echo');
  });

  it('loads pt-BR catalog', async () => {
    await initEchoI18n('pt-BR');
    const loc = i18n.global.locale;
    const localeValue = typeof loc === 'string' ? loc : loc.value;
    expect(localeValue).toBe('pt-BR');
    expect(echoT('common.cancel')).toBe('Cancelar');
    expect(echoT('auth.signIn')).toBe('Entrar');
    expect(echoT('integrations.discord.connectCta')).toBe('Conectar Discord');
  });

  it('loads the lazy de catalog and normalizes German locale tags', async () => {
    const { normalizeEchoUiLocale } = await import('@/i18n');
    expect(normalizeEchoUiLocale('de-AT')).toBe('de');
    expect(normalizeEchoUiLocale('DE')).toBe('de');
    await initEchoI18n('de');
    const loc = i18n.global.locale;
    const localeValue = typeof loc === 'string' ? loc : loc.value;
    expect(localeValue).toBe('de');
    expect(echoT('common.cancel')).toBe('Abbrechen');
    expect(echoT('time.languages.de')).toBe('Deutsch');
    await initEchoI18n('en-US');
  });

  it('keeps settings section ids English and translates only display labels', async () => {
    const { settingsSectionLabel, serverSettingsSectionLabel, auditTabLabel } =
      await import('@/i18n/labels');
    const { USER_SETTINGS_SECTION_GROUPS } =
      await import('@/features/layout/urlNavigationSettingsIds');
    await initEchoI18n('pt-BR');
    expect(settingsSectionLabel('Time & Language')).toBe('Hora e idioma');
    expect(settingsSectionLabel('Data & Privacy')).toBe('Dados e privacidade');
    expect(serverSettingsSectionLabel('Danger Zone')).toBe('Zona de perigo');
    expect(auditTabLabel('Join / leave')).toBe('Entradas / saídas');
    for (const g of USER_SETTINGS_SECTION_GROUPS) {
      for (const item of g.items) {
        expect(settingsSectionLabel(item)).not.toBe('');
        expect(item).toMatch(/^[A-Za-z]/);
      }
    }
    expect(echoT('panes.timeLang.appLanguage')).toBe('Idioma do app');
    await initEchoI18n('en-US');
    expect(settingsSectionLabel('Time & Language')).toBe('Time & Language');
  });

  it('pt-BR has a nav label for every settings section id', async () => {
    const { settingsSectionLabel } = await import('@/i18n/labels');
    const { USER_SETTINGS_SECTION_GROUPS } =
      await import('@/features/layout/urlNavigationSettingsIds');
    await initEchoI18n('pt-BR');
    for (const g of USER_SETTINGS_SECTION_GROUPS) {
      for (const item of g.items) {
        expect(echoT(`nav.settings.sections.${item}`)).not.toBe(
          `nav.settings.sections.${item}`,
        );
        expect(settingsSectionLabel(item)).toBeTruthy();
      }
    }
    await initEchoI18n('en-US');
  });

  it('translates settings group headers and permission bit labels', async () => {
    const { settingsGroupLabel, channelPermissionLabel, rolePermissionLabel } =
      await import('@/i18n/labels');
    const { USER_SETTINGS_SECTION_GROUPS } =
      await import('@/features/layout/urlNavigationSettingsIds');
    const { ROLE_PERMISSION_DEFS } =
      await import('@/features/server-settings/types');
    const { CHANNEL_PERMISSION_DEFS_TEXT } =
      await import('@/features/channel-settings/types');

    await initEchoI18n('pt-BR');
    for (const g of USER_SETTINGS_SECTION_GROUPS) {
      expect(echoT(`nav.settings.groups.${g.label}`)).not.toBe(
        `nav.settings.groups.${g.label}`,
      );
      expect(settingsGroupLabel(g.label)).not.toBe(g.label);
    }
    expect(settingsGroupLabel('User')).toBe('Usuário');
    expect(settingsGroupLabel('External apps')).toBe('Apps externos');
    expect(channelPermissionLabel('viewChannel')).toBe('Ver canal');
    expect(channelPermissionLabel('sendMessages', { group: 'Paper' })).toBe(
      'Escrever no paper',
    );
    for (const def of ROLE_PERMISSION_DEFS) {
      expect(echoT(`serverSettings.permissions.${def.key}`)).not.toBe(
        `serverSettings.permissions.${def.key}`,
      );
      expect(rolePermissionLabel(def.key)).toBeTruthy();
    }
    for (const def of CHANNEL_PERMISSION_DEFS_TEXT) {
      expect(
        channelPermissionLabel(def.key, { group: def.group }),
      ).toBeTruthy();
      expect(channelPermissionLabel(def.key, { group: def.group })).not.toBe(
        def.key,
      );
    }
    await initEchoI18n('en-US');
    expect(settingsGroupLabel('User')).toBe('User');
  });
});
