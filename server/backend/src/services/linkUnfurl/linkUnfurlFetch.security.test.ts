import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { fetchJsonWithTimeout, ssrfSafeFetch } from './linkUnfurlFetch';
import { readBoundedResponseBody } from './readBoundedResponseBody';

test('SSRF boundary refuses private literals and private DNS answers', async () => {
  await assert.rejects(ssrfSafeFetch('https://127.0.0.1/', {}), /SSRF/);
  let resolved = 0;
  await assert.rejects(
    ssrfSafeFetch(
      'https://rebind.example/',
      {},
      {
        resolve: async () => {
          resolved += 1;
          return [{ address: '127.0.0.1', family: 4 }];
        },
      },
    ),
    /SSRF/,
  );
  // One public + one private answer is still refused.
  await assert.rejects(
    ssrfSafeFetch(
      'https://mixed.example/',
      {},
      {
        resolve: async () => [
          { address: '8.8.8.8', family: 4 },
          { address: '10.0.0.5', family: 4 },
        ],
      },
    ),
    /SSRF/,
  );
  assert.equal(resolved, 1);
});

test('SSRF fetch connects to the validated IP and does not follow redirects', async () => {
  const seen: { host?: string; url?: string }[] = [];
  const server = http.createServer((req, res) => {
    seen.push({ host: req.headers.host, url: req.url });
    res.writeHead(302, { location: 'http://127.0.0.1:1/next' });
    res.end('moved');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  let resolveCalls = 0;
  try {
    const res = await ssrfSafeFetch(
      `http://pinned.example:${port}/path?q=1`,
      { redirect: 'follow' },
      {
        allowHttp: true,
        isAddressAllowed: (a) => a === '127.0.0.1',
        resolve: async () => {
          resolveCalls += 1;
          return [{ address: '127.0.0.1', family: 4 }];
        },
      },
    );
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), 'http://127.0.0.1:1/next');
    assert.equal(await res.text(), 'moved');
    assert.equal(resolveCalls, 1);
    assert.deepEqual(seen, [
      { host: `pinned.example:${port}`, url: '/path?q=1' },
    ]);
  } finally {
    server.close();
  }
});

test('SSRF fetch honours AbortSignal', async () => {
  const server = http.createServer(() => {
    /* never respond */
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  try {
    await assert.rejects(
      ssrfSafeFetch(
        `http://slow.example:${port}/`,
        { signal: AbortSignal.timeout(100) },
        {
          allowHttp: true,
          isAddressAllowed: () => true,
          resolve: async () => [{ address: '127.0.0.1', family: 4 }],
        },
      ),
    );
  } finally {
    server.closeAllConnections();
    server.close();
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

const localOpts = {
  allowHttp: true,
  isAddressAllowed: () => true,
  resolve: async () => [{ address: '127.0.0.1', family: 4 }],
};

test('JSON fetch rejects oversized decoded bodies', async () => {
  const chunk = Buffer.alloc(256 * 1024);
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    const timer = setInterval(() => {
      if (!res.write(chunk)) return;
    }, 1);
    res.on('close', () => clearInterval(timer));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  try {
    assert.equal(
      await fetchJsonWithTimeout(`http://big.example:${port}/`, localOpts),
      null,
    );
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('JSON deadline remains active after headers arrive', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{"a":');
    /* never finish */
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  // Keep the event loop alive because AbortSignal.timeout uses an unref'ed timer.
  const keepAlive = setTimeout(() => {}, 15_000);
  try {
    assert.equal(
      await fetchJsonWithTimeout(`http://slow.example:${port}/`, localOpts),
      null,
    );
  } finally {
    clearTimeout(keepAlive);
    server.closeAllConnections();
    server.close();
  }
});
