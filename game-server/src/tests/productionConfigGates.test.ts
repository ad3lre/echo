import assert from 'node:assert/strict';
import { assertGameServerProductionConfig } from '../config/productionGates';

function withExitIntercept<T>(
  fn: () => T,
): { ok: true; value: T } | { ok: false; code: number } {
  const origExit = process.exit;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process as any).exit = ((code?: number) => {
    throw Object.assign(new Error('exit'), { code: code ?? 0 });
  }) as typeof process.exit;
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    const err = e as { code?: number };
    if (typeof err.code === 'number') return { ok: false, code: err.code };
    throw e;
  } finally {
    process.exit = origExit;
  }
}

const okSecrets = {
  gameTokenSecret: 'jwt-0123456789abcdef0123456789abcdef01234567',
  echoForwardSecret: 'forward-0123456789abcdef0123456789abcdef012345',
  corsOrigin: ['https://app.example.com'] as string[],
};

export function runProductionConfigGateTests(): void {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assertGameServerProductionConfig(okSecrets);

    const assertFails = (
      overrides: Partial<{
        gameTokenSecret: string;
        echoForwardSecret: string;
        corsOrigin: string[] | true;
      }>,
      label: string,
    ) => {
      const out = withExitIntercept(() =>
        assertGameServerProductionConfig({ ...okSecrets, ...overrides }),
      );
      assert.equal(out.ok, false, label);
      assert.equal(out.ok ? 0 : out.code, 1);
    };

    assertFails({ gameTokenSecret: 'dev-insecure-secret' }, 'dev JWT secret');
    assertFails({ echoForwardSecret: 'short' }, 'short forward secret');
    assertFails({ corsOrigin: true }, 'reflect-any CORS');
    assertFails({ corsOrigin: [] }, 'empty CORS list');
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }

  console.log('game-server productionConfigGates: ok');
}
