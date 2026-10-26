/**
 * fetch-like transport that connects to a caller-validated IP address.
 *
 * Bun ignores the undici `dispatcher` option on global fetch, so connection
 * pinning is done with node:http(s) instead: the socket is opened to the
 * pinned IP, while Host / TLS SNI / certificate verification keep using the
 * original hostname. Redirects are never followed.
 */

import http from 'node:http';
import https from 'node:https';
import type { IncomingMessage } from 'node:http';
import type { Readable } from 'node:stream';
import zlib from 'node:zlib';

export type PinnedAddress = { address: string; family?: number };

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

function decodedStream(res: IncomingMessage): {
  stream: Readable;
  decoded: boolean;
} {
  const enc = String(res.headers['content-encoding'] ?? '')
    .trim()
    .toLowerCase();
  const decoder =
    enc === 'gzip' || enc === 'x-gzip'
      ? zlib.createGunzip()
      : enc === 'deflate'
        ? zlib.createInflate()
        : enc === 'br'
          ? zlib.createBrotliDecompress()
          : null;
  if (!decoder) return { stream: res, decoded: false };
  res.on('error', (err) => decoder.destroy(err));
  res.pipe(decoder);
  return { stream: decoder, decoded: true };
}

function toWebStream(
  stream: Readable,
  signal: AbortSignal | null | undefined,
  onCancel: (reason?: unknown) => void,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
        if (controller.desiredSize !== null && controller.desiredSize <= 0) {
          stream.pause();
        }
      });
      stream.on('end', () => {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
      stream.on('error', (err) => {
        try {
          controller.error(signal?.aborted ? signal.reason : err);
        } catch {
          /* already errored */
        }
      });
      signal?.addEventListener(
        'abort',
        () => {
          try {
            controller.error(signal.reason);
          } catch {
            /* already closed */
          }
          onCancel(signal.reason);
        },
        { once: true },
      );
    },
    pull() {
      stream.resume();
    },
    cancel(reason) {
      onCancel(reason);
    },
  });
}

export async function pinnedHttpFetch(
  url: URL,
  init: RequestInit,
  pinned: PinnedAddress,
): Promise<Response> {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Unsupported protocol');
  }
  const signal = init.signal ?? null;
  signal?.throwIfAborted();

  // Normalise method / headers / body exactly as fetch would.
  const normalized = new Request(url, { ...init, redirect: 'manual' });
  const body =
    normalized.body === null
      ? null
      : Buffer.from(await normalized.arrayBuffer());

  const headers: Record<string, string> = {};
  normalized.headers.forEach((value, key) => {
    headers[key] = value;
  });
  headers['host'] = url.host;
  headers['accept-encoding'] = 'gzip, deflate, br';
  if (body) headers['content-length'] = String(body.length);

  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;
  const hostname = url.hostname.replace(/^\[|\]$/g, '');

  return new Promise<Response>((resolve, reject) => {
    const req = transport.request(
      {
        host: pinned.address,
        family: pinned.family,
        port: url.port ? Number(url.port) : isHttps ? 443 : 80,
        method: normalized.method,
        path: `${url.pathname}${url.search}`,
        headers,
        agent: false,
        ...(isHttps ? { servername: hostname } : {}),
      },
      (res) => {
        const { stream, decoded } = decodedStream(res);
        const responseHeaders = new Headers();
        for (let i = 0; i + 1 < res.rawHeaders.length; i += 2) {
          const name = res.rawHeaders[i]!;
          const lower = name.toLowerCase();
          if (
            decoded &&
            (lower === 'content-encoding' || lower === 'content-length')
          ) {
            continue;
          }
          try {
            responseHeaders.append(name, res.rawHeaders[i + 1]!);
          } catch {
            /* skip malformed header */
          }
        }
        const status = res.statusCode ?? 502;
        const noBody = NULL_BODY_STATUSES.has(status) || req.method === 'HEAD';
        if (noBody) {
          res.destroy();
          resolve(new Response(null, { status, headers: responseHeaders }));
          return;
        }
        const webBody = toWebStream(stream, signal, () => {
          res.destroy();
          stream.destroy();
        });
        resolve(
          new Response(webBody, {
            status,
            statusText: res.statusMessage ?? '',
            headers: responseHeaders,
          }),
        );
      },
    );
    req.on('error', (err) => reject(signal?.aborted ? signal.reason : err));
    signal?.addEventListener('abort', () => req.destroy(), { once: true });
    req.end(body);
  });
}
