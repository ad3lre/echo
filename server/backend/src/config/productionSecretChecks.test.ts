import { describe, expect, it } from 'vitest';
import {
  assertProductionSecretHygiene,
  DEV_LIVEKIT_API_SECRET,
  findDuplicateSecretKeys,
  productionSecretHygieneError,
} from './productionSecretChecks';

describe('productionSecretChecks', () => {
  it('passes for distinct secrets', () => {
    expect(
      productionSecretHygieneError({
        JWT_SECRET: 'a'.repeat(40),
        ECHO_METRICS_SCRAPE_TOKEN: 'b'.repeat(40),
        LIVEKIT_API_KEY: 'prodkey',
        LIVEKIT_API_SECRET: 'x'.repeat(40),
      }),
    ).toBeNull();
  });

  it('names colliding keys but never values', () => {
    const value = 'shared-value-1234567890-shared-value-1234567890';
    const env = {
      JWT_SECRET: value,
      LOCAL_UPLOAD_TOKEN_SECRET: value,
      ECHO_SMS_OTP_PEPPER: 'other-value-1234567890-other-value-1234567890',
    };
    expect(findDuplicateSecretKeys(env)).toEqual([
      ['JWT_SECRET', 'LOCAL_UPLOAD_TOKEN_SECRET'],
    ]);
    const msg = productionSecretHygieneError(env) ?? '';
    expect(msg).toContain('JWT_SECRET, LOCAL_UPLOAD_TOKEN_SECRET');
    expect(msg).not.toContain(value);
  });

  it('ignores unset/blank values', () => {
    expect(
      productionSecretHygieneError({
        JWT_SECRET: ' ',
        ECHO_SMS_OTP_PEPPER: '',
      }),
    ).toBeNull();
  });

  it('rejects devkey and dev-placeholder LiveKit secrets', () => {
    expect(
      productionSecretHygieneError({ LIVEKIT_API_KEY: 'devkey' }),
    ).toContain('LIVEKIT_API_KEY');
    expect(
      productionSecretHygieneError({
        LIVEKIT_API_SECRET: DEV_LIVEKIT_API_SECRET,
      }),
    ).toContain('LIVEKIT_API_SECRET');
    expect(
      productionSecretHygieneError({ LIVEKIT_API_SECRET: 'devAnything' }),
    ).toContain('LIVEKIT_API_SECRET');
  });

  it('assertProductionSecretHygiene exits(1) with key names only', () => {
    const errs: string[] = [];
    const deps = {
      configStderr: (m: string) => void errs.push(m),
      exitProcess: (c: number): never => {
        throw new Error(`exit:${c}`);
      },
    };
    const v = 'z'.repeat(40);
    expect(() =>
      assertProductionSecretHygiene(
        { JWT_SECRET: v, ECHO_SMS_OTP_PEPPER: v },
        deps,
      ),
    ).toThrow('exit:1');
    expect(errs[0]).toContain('JWT_SECRET, ECHO_SMS_OTP_PEPPER');
    expect(errs[0]).not.toContain(v);
    expect(() =>
      assertProductionSecretHygiene({ JWT_SECRET: v }, deps),
    ).not.toThrow();
  });
});
