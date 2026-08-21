import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerGlobalErrorHandler } from '../../bootstrap/errorHandler';

async function run(): Promise<void> {
  const app = Fastify({ logger: false });
  registerGlobalErrorHandler(app);

  app.get('/boom', async () => {
    const err = new Error(
      'operator does not exist: jsonb ~~* unknown',
    ) as Error & {
      code?: string;
    };
    err.code = '42883';
    throw err;
  });

  app.get(
    '/validation',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['q'],
          properties: { q: { type: 'string' } },
        },
      },
    },
    async () => ({ ok: true }),
  );

  const boom = await app.inject({ method: 'GET', url: '/boom' });
  assert.equal(boom.statusCode, 500);
  const boomBody = JSON.parse(boom.body) as { code: string; message: string };
  assert.equal(boomBody.code, 'INTERNAL_ERROR');
  assert.equal(boomBody.message, 'Internal Server Error');
  assert.equal(boomBody.message.includes('operator'), false);

  const bad = await app.inject({ method: 'GET', url: '/validation' });
  assert.equal(bad.statusCode, 400);
  const badBody = JSON.parse(bad.body) as { code: string };
  assert.equal(badBody.code, 'VALIDATION_ERROR');

  await app.close();
  console.log('globalErrorHandler: ok');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
