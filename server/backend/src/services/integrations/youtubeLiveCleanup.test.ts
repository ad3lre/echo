import assert from 'node:assert/strict';
import { createYoutubeLiveSession } from './youtubeApiClient';

async function run(): Promise<void> {
  const calls: string[] = [];
  const fetchImpl = async (
    input: Request | string | URL,
  ): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    if (url.includes('liveBroadcasts?part=')) {
      return Response.json({ id: 'broadcast-1' });
    }
    if (url.includes('liveStreams?part=')) {
      return Response.json({ id: 'stream-1', cdn: { ingestionInfo: {} } });
    }
    if (url.includes('liveStreams?id=')) {
      return Response.json(
        { error: { message: 'stream delete denied' } },
        { status: 500 },
      );
    }
    if (url.includes('liveBroadcasts?id='))
      return new Response(null, { status: 204 });
    throw new Error(`Unexpected YouTube request: ${url}`);
  };

  await assert.rejects(
    createYoutubeLiveSession(
      'token',
      { title: 'cleanup test', privacyStatus: 'private' },
      fetchImpl,
    ),
    /youtube_stream_ingestion_missing/,
  );
  assert.ok(calls.some((url) => url.includes('liveStreams?id=stream-1')));
  assert.ok(calls.some((url) => url.includes('liveBroadcasts?id=broadcast-1')));
}

void run().then(() => console.log('youtube live cleanup regression: ok'));
