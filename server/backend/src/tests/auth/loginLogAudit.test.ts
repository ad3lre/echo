import assert from 'node:assert/strict';
import Fastify from 'fastify';
import loginRoutes from '../../api/routes/auth/login';

async function run(): Promise<void> {
  const chunks: string[] = [];
  const app = Fastify({
    logger: {
      level: 'info',
      stream: {
        write(line: string | Buffer) {
          chunks.push(String(line));
        },
      },
    },
  });
  await app.register(loginRoutes, { prefix: '/api/v1/auth' });
  await app.ready();
  const password = 'SuperSecret99!';
  const username = 'audit_user_xyz';
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username, password },
  });
  await app.close();
  const out = chunks.join('');
  assert.equal(
    res.statusCode,
    401,
    `expected failed login, got ${res.statusCode}`,
  );
  assert.equal(
    out.includes(password),
    false,
    'server logs must not contain login password',
  );
  assert.equal(
    out.includes(username),
    false,
    'server logs must not contain login username on failed auth',
  );

  const chunks2: string[] = [];
  const app2 = Fastify({
    logger: {
      level: 'info',
      stream: {
        write(line: string | Buffer) {
          chunks2.push(String(line));
        },
      },
    },
  });
  await app2.register(loginRoutes, { prefix: '/api/v1/auth' });
  await app2.ready();
  const badSchema = await app2.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'audit_user_xyz' },
  });
  await app2.close();
  const out2 = chunks2.join('');
  assert.equal(badSchema.statusCode, 400);
  assert.equal(
    out2.includes('SuperSecret99!'),
    false,
    'schema validation logs must not contain login password',
  );

  console.log('loginLogAudit: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
