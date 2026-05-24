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
});
