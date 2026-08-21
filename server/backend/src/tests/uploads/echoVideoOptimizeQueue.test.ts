import assert from 'node:assert/strict';
import type pg from 'pg';
import {
  enqueueEchoChatVideoHls,
  markEchoVideoHlsJobFailed,
  reclaimStaleEchoVideoHlsJobs,
} from '../../services/echoVideoOptimizeQueue';

type QueryCall = { text: string; values?: unknown[] };

function createRecordingPool(
  handlers?: Partial<{
    onQuery: (call: QueryCall) => { rows: unknown[]; rowCount?: number };
  }>,
): pg.Pool & { calls: QueryCall[] } {
  const calls: QueryCall[] = [];
  const pool = {
    calls,
    query: async (text: string, values?: unknown[]) => {
      const call = { text, values };
      calls.push(call);
      const res = handlers?.onQuery?.(call);
      return res ?? { rows: [], rowCount: 0 };
    },
    connect: async () => {
      throw new Error('connect not expected in unit test');
    },
  };
  return pool as unknown as pg.Pool & { calls: QueryCall[] };
}

async function testEnqueueSyncQueries(): Promise<void> {
  const pool = createRecordingPool();
  await enqueueEchoChatVideoHls(pool, {
    storageKey: 'echo/channels/ch/u/clip.mp4',
    publicUrl: 'https://example.com/clip.mp4',
    sourceContentType: 'video/mp4',
    sourceSize: 1000,
    sourceEtag: 'etag-1',
  });

  assert.equal(pool.calls.length, 3);
  assert.match(
    pool.calls[0]!.text,
    /ON CONFLICT \(storage_key\) DO UPDATE SET/,
  );
  assert.match(
    pool.calls[0]!.text,
    /WHEN echo_video_hls_queue.status = 'failed' THEN 'pending'/,
  );
  assert.match(pool.calls[1]!.text, /INSERT INTO echo_video_playback/);
  assert.match(pool.calls[2]!.text, /FROM echo_video_playback p/);
  assert.match(pool.calls[2]!.text, /q.status IN \('done', 'failed'\)/);
}

async function testEnqueueSkipsNonChatVideo(): Promise<void> {
  const pool = createRecordingPool();
  await enqueueEchoChatVideoHls(pool, {
    storageKey: 'echo/avatars/u/pic.png',
    publicUrl: 'https://example.com/pic.png',
    sourceContentType: 'video/mp4',
    sourceSize: 100,
    sourceEtag: null,
  });
  assert.equal(pool.calls.length, 0);
}

async function testMarkFailedRetriesAsPending(): Promise<void> {
  const pool = createRecordingPool({
    onQuery: (call) => {
      if (call.text.includes('RETURNING status')) {
        return { rows: [{ status: 'pending' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  });

  await markEchoVideoHlsJobFailed(
    pool,
    '42',
    'echo/channels/ch/u/clip.mp4',
    'ffmpeg boom',
  );

  const failUpdate = pool.calls.find((c) =>
    c.text.includes('RETURNING status'),
  );
  assert.ok(failUpdate);
  assert.match(failUpdate!.text, /WHEN attempts \+ 1 < \$3 THEN 'pending'/);
  const retryPlayback = pool.calls.find(
    (c) =>
      c.text.includes("SET status = 'pending'") &&
      c.text.includes('echo_video_playback'),
  );
  assert.ok(retryPlayback);
  const terminalFailed = pool.calls.find((c) =>
    c.text.includes("SET status = 'failed'"),
  );
  assert.equal(terminalFailed, undefined);
}

async function testMarkFailedTerminal(): Promise<void> {
  const pool = createRecordingPool({
    onQuery: (call) => {
      if (call.text.includes('RETURNING status')) {
        return { rows: [{ status: 'failed' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  });

  await markEchoVideoHlsJobFailed(
    pool,
    '42',
    'echo/channels/ch/u/clip.mp4',
    'ffmpeg boom',
  );

  const terminalFailed = pool.calls.find((c) =>
    c.text.includes("SET status = 'failed'"),
  );
  assert.ok(terminalFailed);
}

async function testReclaimStaleProcessing(): Promise<void> {
  const pool = createRecordingPool({
    onQuery: () => ({ rows: [], rowCount: 2 }),
  });
  const reclaimed = await reclaimStaleEchoVideoHlsJobs(pool, 900_000);
  assert.equal(reclaimed, 2);
  assert.match(pool.calls[0]!.text, /status = 'processing'/);
  assert.equal(pool.calls[0]!.values?.[0], 900_000);
}

async function run(): Promise<void> {
  await testEnqueueSyncQueries();
  await testEnqueueSkipsNonChatVideo();
  await testMarkFailedRetriesAsPending();
  await testMarkFailedTerminal();
  await testReclaimStaleProcessing();
  // eslint-disable-next-line no-console
  console.log('echoVideoOptimizeQueue.test.ts ok');
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
