import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serializeGuildExport } from './serializedExport.js';

test('overlapping exports share a run and a later request can run again', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const work = async () => {
    calls++;
    await gate;
    return 'complete';
  };
  const first = serializeGuildExport('same-guild', work);
  const second = serializeGuildExport('same-guild', work);
  assert.equal(first, second);
  release();
  assert.deepEqual(await Promise.all([first, second]), [
    'complete',
    'complete',
  ]);
  assert.equal(calls, 1);
  await serializeGuildExport('same-guild', work);
  assert.equal(calls, 2);
});

test('failed exports release the guild for a retry', async () => {
  await assert.rejects(
    serializeGuildExport('retry-guild', async () => {
      throw new Error('failed');
    }),
  );
  assert.equal(
    await serializeGuildExport('retry-guild', async () => 'retry'),
    'retry',
  );
});

test('different guilds can export independently', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = serializeGuildExport('first-guild', async () => {
    await gate;
  });
  assert.equal(await serializeGuildExport('other-guild', async () => 42), 42);
  release();
  await pending;
});
