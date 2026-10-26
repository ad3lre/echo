import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { loggerRedactionOptions, maskJwtsInString } from './logRedaction';

async function run(): Promise<void> {
  const chunks: string[] = [];
  const app = Fastify({
    logger: {
      level: 'info',
      ...loggerRedactionOptions,
      stream: {
        write(line: string | Buffer) {
          chunks.push(String(line));
        },
      },
    },
  });
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.c2lnbmF0dXJlX3BhcnQ';
  app.log.info(
    {
      req: {
        headers: {
          authorization: 'Bearer super-secret-token',
          cookie: 'echo_session=abc',
          'x-echo-discord-bot-secret': 'bot-secret-value',
        },
      },
      res: { headers: { 'set-cookie': 'echo_session=zzz' } },
      user: { password: 'hunter2', refreshToken: 'rt-value', code: '123456' },
      note: `got ${jwt} here`,
    },
    `message with ${jwt}`,
  );
  const out = chunks.join('');
  for (const leaked of [
    'super-secret-token',
    'echo_session=abc',
    'bot-secret-value',
    'echo_session=zzz',
    'hunter2',
    'rt-value',
    '123456',
    jwt,
  ]) {
    assert.equal(out.includes(leaked), false, `leaked: ${leaked}`);
  }
  assert.ok(out.includes('[REDACTED]'));
  assert.equal(maskJwtsInString(`x ${jwt} y`), 'x [REDACTED] y');
  assert.equal(maskJwtsInString('plain text'), 'plain text');
  await app.close();
  // eslint-disable-next-line no-console
  console.log('logRedaction.test: ok');
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
