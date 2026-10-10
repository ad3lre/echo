import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { fetchJsonWithTimeout, ssrfSafeFetch } from './linkUnfurlFetch';
import { safeFetchAgent } from './safeFetchAgent';
import { readBoundedResponseBody } from './readBoundedResponseBody';

// Literal public IP requires no external DNS or network traffic; fetch is mocked.
const target = 'https://8.8.8.8/';

test('SSRF boundary enforces the protected agent and manual redirects', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.dispatcher, safeFetchAgent);
    assert.equal(init.redirect, 'manual');
    return new Response(null, { status: 302 });
  });
  try {
    await ssrfSafeFetch(target, {});
    await ssrfSafeFetch(target, { redirect: 'follow', dispatcher: {} });
    assert.equal(fetchMock.mock.callCount(), 2);
    await assert.rejects(ssrfSafeFetch('https://127.0.0.1/', {}), /SSRF/);
    assert.equal(fetchMock.mock.callCount(), 2);
  } finally {
    fetchMock.mock.restore();
  }
});

test('stream limit rejects and cancels bodies with missing or dishonest length', async () => {
  for (const headers of [{}, { 'content-length': '1' }]) {
    let cancelled = false;
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          controller.enqueue(new Uint8Array(8));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { headers },
    );
    await assert.rejects(readBoundedResponseBody(response, 10), /byte limit/);
    assert.equal(cancelled, true);
  }
  assert.equal(
    (await readBoundedResponseBody(new Response('1234'), 4)).toString(),
    '1234',
  );
});

test('JSON fetch rejects oversized decoded bodies', async () => {
  let cancelled = false;
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new Uint8Array(256 * 1024));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  );
  try {
    assert.equal(await fetchJsonWithTimeout(target), null);
    assert.equal(cancelled, true);
  } finally {
    fetchMock.mock.restore();
  }
});

test('JSON deadline remains active after headers arrive', async () => {
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async (_url, init) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init.signal.addEventListener(
              'abort',
              () => controller.error(init.signal.reason),
              { once: true },
            );
          },
        }),
      ),
  );
  // Keep the event loop alive because AbortSignal.timeout uses an unref'ed timer.
  const keepAlive = setTimeout(() => {}, 10_000);
  try {
    assert.equal(await fetchJsonWithTimeout(target), null);
  } finally {
    clearTimeout(keepAlive);
    fetchMock.mock.restore();
  }
});
