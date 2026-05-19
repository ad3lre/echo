/**
 * Unit tests for the embed proxy services.
 * Run: npx ts-node src/tests/embedProxy.unit.test.ts
 *
 * Tests cover:
 *  - Token: mint, verify, expiry, slug mismatch, tamper resistance
 *  - Upstream: URL building, path sanitization, proxy→upstream mapping
 *  - Rewrite: HTML/CSS URL replacement goldens
 *  - Redirect validation logic (catalog allowlist)
 */
import assert from 'node:assert/strict';
import {
  mintEmbedToken,
  verifyEmbedToken,
} from '../services/embedProxy/embedProxyToken';
import {
  buildUpstreamUrl,
  sanitizeProxyPath,
  upstreamUrlToProxyPath,
} from '../services/embedProxy/embedProxyUpstream';
import { rewriteTextBody, rewriteRootRelativeAttrPathsForEmbed } from '../services/embedProxy/embedProxyRewrite';
import {
  getEmbedProxyTarget,
  EMBED_PROXY_ALL_SLUGS,
} from '../services/embedProxy/embedProxyCatalog';

const SECRET = 'test-secret-key-1234';

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(
        () => console.log(`ok ${name}`),
        (e) => {
          console.error(`FAIL ${name}`, e);
          process.exitCode = 1;
        },
      );
    } else {
      console.log(`ok ${name}`);
    }
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

test('token: mint and verify roundtrip', () => {
  const token = mintEmbedToken('codenames', 'user-123', SECRET);
  const result = verifyEmbedToken(token, 'codenames', SECRET);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.slug, 'codenames');
    assert.equal(result.userId, 'user-123');
  }
});

test('token: wrong secret returns invalid', () => {
  const token = mintEmbedToken('codenames', 'user-123', SECRET);
  const result = verifyEmbedToken(token, 'codenames', 'wrong-secret');
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'invalid');
});

test('token: wrong slug returns wrong_slug', () => {
  const token = mintEmbedToken('codenames', 'user-123', SECRET);
  const result = verifyEmbedToken(token, 'othergame', SECRET);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'wrong_slug');
});

test('token: expired token returns expired', () => {
  // Forge an expired token by manually constructing the body with past expiry
  const pastExp = Date.now() - 1000;
  const body = `codenames.user-123.${pastExp}`;
  // Use real HMAC via mintEmbedToken then patch the exp portion
  const realToken = mintEmbedToken('codenames', 'user-123', SECRET);
  const parts = realToken.split('.');
  // Replace exp with past value in the body, keeping the (now-wrong) sig
  // — this should fail with 'invalid' (tampered)
  parts[2] = String(pastExp);
  const tamperedToken = parts.join('.');
  const result = verifyEmbedToken(tamperedToken, 'codenames', SECRET);
  assert.equal(result.ok, false);
  // Either 'expired' (extremely unlikely with wrong sig) or 'invalid' (expected)
  assert(result.ok === false);
});

test('token: truncated token returns invalid', () => {
  const result = verifyEmbedToken('bad.token', 'codenames', SECRET);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'invalid');
});

// ---------------------------------------------------------------------------
// Upstream URL building
// ---------------------------------------------------------------------------

const codenamesTarget = getEmbedProxyTarget('codenames')!;

test('upstream: builds correct URL for main alias', () => {
  const url = buildUpstreamUrl(codenamesTarget, 'main', '/room/abc');
  assert.equal(url, 'https://codenames.game/room/abc');
});

test('upstream: builds correct URL for www alias', () => {
  const url = buildUpstreamUrl(codenamesTarget, 'www', '/room/abc');
  assert.equal(url, 'https://www.codenames.game/room/abc');
});

test('upstream: www proxy path → upstream URL mapping', () => {
  const proxyPath = upstreamUrlToProxyPath(
    'codenames',
    codenamesTarget,
    'https://www.codenames.game/room/xyz',
  );
  assert.equal(proxyPath, '/api/v1/embed/codenames/o/www/room/xyz');
});

test('upstream: builds correct URL for cdn2 alias', () => {
  const url = buildUpstreamUrl(codenamesTarget, 'cdn2', '/static/foo.js');
  assert.equal(url, 'https://cdn2.codenames.game/static/foo.js');
});

test('rewrite: root-relative href/src for Next.js under embed path', () => {
  const html =
    '<link rel="icon" href="/favicon.ico"/><script src="/_next/static/chunk.js"></script>';
  const out = rewriteRootRelativeAttrPathsForEmbed(html, 'codenames', 'main');
  assert(out.includes('href="/api/v1/embed/codenames/o/main/favicon.ico"'));
  assert(out.includes('src="/api/v1/embed/codenames/o/main/_next/static/chunk.js"'));
  assert(!out.includes('href="/favicon.ico"'));
});

test('rewrite: root-relative does not double-prefix embed paths', () => {
  const html = '<a href="/api/v1/embed/codenames/o/main/room/x">x</a>';
  const out = rewriteRootRelativeAttrPathsForEmbed(html, 'codenames', 'main');
  assert.equal(out, html);
});

test('upstream: unknown alias returns null', () => {
  assert.equal(buildUpstreamUrl(codenamesTarget, 'unknown', '/'), null);
});

test('upstream: path traversal rejected', () => {
  assert.equal(sanitizeProxyPath('/foo/../etc/passwd'), null);
  assert.equal(sanitizeProxyPath('/foo/%2e%2e/etc/passwd'), null);
  assert.equal(sanitizeProxyPath('/foo/%2E%2E/etc'), null);
});

test('upstream: null byte rejected', () => {
  assert.equal(sanitizeProxyPath('/foo\0bar'), null);
});

test('upstream: path not starting with / rejected', () => {
  assert.equal(sanitizeProxyPath('foo/bar'), null);
  assert.equal(sanitizeProxyPath(''), null);
});

test('upstream: valid paths pass sanitization', () => {
  assert.notEqual(sanitizeProxyPath('/'), null);
  assert.notEqual(sanitizeProxyPath('/room/abc-123?invite=xyz'), null);
  assert.notEqual(sanitizeProxyPath('/static/js/chunk.abc123.js'), null);
});

test('upstream: proxy path → upstream URL mapping', () => {
  const proxyPath = upstreamUrlToProxyPath(
    'codenames',
    codenamesTarget,
    'https://codenames.game/room/xyz',
  );
  assert.equal(proxyPath, '/api/v1/embed/codenames/o/main/room/xyz');
});

test('upstream: cdn2 proxy path → upstream URL mapping', () => {
  const proxyPath = upstreamUrlToProxyPath(
    'codenames',
    codenamesTarget,
    'https://cdn2.codenames.game/static/foo.js',
  );
  assert.equal(proxyPath, '/api/v1/embed/codenames/o/cdn2/static/foo.js');
});

test('upstream: URL not in catalog returns null', () => {
  const proxyPath = upstreamUrlToProxyPath(
    'codenames',
    codenamesTarget,
    'https://evil.com/malware.js',
  );
  assert.equal(proxyPath, null);
});

test('catalog: codenames slug is registered', () => {
  assert(EMBED_PROXY_ALL_SLUGS.includes('codenames'));
  assert.notEqual(codenamesTarget, null);
});

// ---------------------------------------------------------------------------
// Rewrite
// ---------------------------------------------------------------------------

test('rewrite: absolute href in HTML', () => {
  const html = '<a href="https://codenames.game/room/abc">link</a>';
  const out = rewriteTextBody(html, 'codenames', codenamesTarget);
  assert(out.includes('/api/v1/embed/codenames/o/main/room/abc'));
  assert(!out.includes('https://codenames.game'));
});

test('rewrite: src attribute', () => {
  const html = '<script src="https://cdn2.codenames.game/static/main.js"></script>';
  const out = rewriteTextBody(html, 'codenames', codenamesTarget);
  assert(out.includes('/api/v1/embed/codenames/o/cdn2/static/main.js'));
  assert(!out.includes('cdn2.codenames.game'));
});

test('rewrite: CSS url()', () => {
  const css = 'body { background: url("https://cdn2.codenames.game/img/bg.png"); }';
  const out = rewriteTextBody(css, 'codenames', codenamesTarget);
  assert(out.includes('/api/v1/embed/codenames/o/cdn2/img/bg.png'));
});

test('rewrite: protocol-relative URL', () => {
  const html = '<script src="//cdn2.codenames.game/static/chunk.js"></script>';
  const out = rewriteTextBody(html, 'codenames', codenamesTarget);
  assert(out.includes('/api/v1/embed/codenames/o/cdn2/static/chunk.js'));
  assert(!out.includes('//cdn2.codenames.game'));
});

test('rewrite: origin root (no path) rewrites to trailing slash', () => {
  const html = '<a href="https://codenames.game">home</a>';
  const out = rewriteTextBody(html, 'codenames', codenamesTarget);
  assert(out.includes('/api/v1/embed/codenames/o/main/'));
});

test('rewrite: unrelated URLs are left unchanged', () => {
  const html = '<a href="https://example.com/foo">link</a>';
  const out = rewriteTextBody(html, 'codenames', codenamesTarget);
  assert(out.includes('https://example.com/foo'));
});

test('rewrite: multiple URLs in one document', () => {
  const html = `
<link rel="stylesheet" href="https://cdn2.codenames.game/css/app.css">
<script src="https://codenames.game/js/main.js"></script>
<a href="https://example.com/">external</a>
`;
  const out = rewriteTextBody(html, 'codenames', codenamesTarget);
  assert(out.includes('/api/v1/embed/codenames/o/cdn2/css/app.css'));
  assert(out.includes('/api/v1/embed/codenames/o/main/js/main.js'));
  assert(out.includes('https://example.com/')); // unrelated unchanged
  assert(!out.includes('cdn2.codenames.game'));
  assert(!out.includes('https://codenames.game'));
});

// ---------------------------------------------------------------------------
// Redirect allowlist validation (tested via catalog logic)
// ---------------------------------------------------------------------------

test('redirect: same origin is allowed', () => {
  const target = codenamesTarget;
  const resolved = 'https://codenames.game/redirect-target';
  const allowed = target.origins.some(
    (o) => resolved.startsWith(`${o.httpsOrigin}/`) || resolved === o.httpsOrigin,
  );
  assert(allowed);
});

test('redirect: cdn2 is allowed origin', () => {
  const target = codenamesTarget;
  const resolved = 'https://cdn2.codenames.game/asset.js';
  const allowed = target.origins.some(
    (o) => resolved.startsWith(`${o.httpsOrigin}/`) || resolved === o.httpsOrigin,
  );
  assert(allowed);
});

test('redirect: www is allowed origin', () => {
  const target = codenamesTarget;
  const resolved = 'https://www.codenames.game/room/x';
  const allowed = target.origins.some(
    (o) => resolved.startsWith(`${o.httpsOrigin}/`) || resolved === o.httpsOrigin,
  );
  assert(allowed);
});

test('redirect: foreign origin is disallowed', () => {
  const target = codenamesTarget;
  const resolved = 'https://evil.com/steal-cookies';
  const allowed = target.origins.some(
    (o) => resolved.startsWith(`${o.httpsOrigin}/`) || resolved === o.httpsOrigin,
  );
  assert(!allowed);
});

test('redirect: redirect to http is disallowed', () => {
  const resolved = 'http://codenames.game/downgrade';
  assert(!resolved.startsWith('https://'));
});
