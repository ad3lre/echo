import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

function printUsage() {
  process.stdout.write(
    [
      'Usage:',
      '  node server/ops/scripts/har-sanitize.mjs <input.har> [--out-dir <dir>] [--max-body <bytes>] [--aggressive]',
      '',
      'Example:',
      '  node server/ops/scripts/har-sanitize.mjs ../chat-echo.com.har --out-dir ./artifacts/har-clean --aggressive',
      '',
    ].join('\n'),
  );
}

function sha1(value) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    const sorted = new URLSearchParams(
      Array.from(url.searchParams.entries()).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    );
    url.search = sorted.toString() ? `?${sorted.toString()}` : '';
    return url.toString();
  } catch {
    return rawUrl || '';
  }
}

function normalizeUrlForFingerprint(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    const collapsed = new URLSearchParams();
    for (const [key, value] of Array.from(url.searchParams.entries()).sort(
      ([a], [b]) => a.localeCompare(b),
    )) {
      const lowerKey = key.toLowerCase();
      if (value.length > 80 || lowerKey === 'ids' || lowerKey === 'members') {
        collapsed.append(
          key,
          `<len:${value.length};sha1:${sha1(value).slice(0, 10)}>`,
        );
      } else {
        collapsed.append(key, value);
      }
    }
    url.search = collapsed.toString() ? `?${collapsed.toString()}` : '';
    return url.toString();
  } catch {
    return rawUrl || '';
  }
}

function compactHeaders(headers = []) {
  const map = new Map();
  for (const header of headers) {
    const name = String(header.name || '')
      .trim()
      .toLowerCase();
    if (!name) continue;
    const value = String(header.value || '');
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(value);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, values]) => ({ name, value: Array.from(values).join(' | ') }));
}

function bodySignature(postData) {
  if (!postData) return 'none';
  const mimeType = String(postData.mimeType || '').toLowerCase();
  const text = typeof postData.text === 'string' ? postData.text : '';
  if (!text) return `${mimeType}:empty`;
  return `${mimeType}:${sha1(text)}`;
}

function requestFingerprint(entry) {
  const method = String(entry?.request?.method || 'GET').toUpperCase();
  const normalizedUrl = normalizeUrlForFingerprint(entry?.request?.url || '');
  const postSig = bodySignature(entry?.request?.postData);
  const status = Number(entry?.response?.status || 0);
  return `${method} ${normalizedUrl} status:${status} body:${postSig}`;
}

function parseQueryParamNames(request = {}) {
  const out = new Set();
  for (const pair of request.queryString || []) {
    if (pair?.name) out.add(String(pair.name));
  }
  try {
    const u = new URL(request.url || '');
    for (const key of u.searchParams.keys()) out.add(key);
  } catch {
    // Ignore malformed URLs.
  }
  return out;
}

function collectPotentialSecrets(request, response) {
  const findings = [];
  const reqHeaders = compactHeaders(request?.headers || []);
  const resHeaders = compactHeaders(response?.headers || []);
  const sensitiveHeaderNames = [
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
  ];
  for (const h of reqHeaders) {
    if (sensitiveHeaderNames.includes(h.name)) {
      findings.push(`Request header present: ${h.name}`);
    }
  }
  for (const h of resHeaders) {
    if (sensitiveHeaderNames.includes(h.name)) {
      findings.push(`Response header present: ${h.name}`);
    }
  }
  return findings;
}

function looksLikeJwt(value) {
  return /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(value);
}

function redactStructuredSecrets(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactStructuredSecrets(item));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('token') ||
        lowerKey === 'authorization' ||
        lowerKey === 'cookie' ||
        lowerKey === 'set-cookie' ||
        lowerKey === 'password' ||
        lowerKey === 'secret' ||
        lowerKey === 'csrf' ||
        lowerKey === 'x-csrf-token'
      ) {
        out[key] = '[redacted]';
        continue;
      }
      out[key] = redactStructuredSecrets(nested);
    }
    return out;
  }
  if (typeof value === 'string') {
    if (looksLikeJwt(value)) return '[redacted_jwt]';
    if (/^Bearer\s+[A-Za-z0-9\-._~+/]+=*$/i.test(value)) {
      return 'Bearer [redacted]';
    }
  }
  return value;
}

function redactUnstructuredSecrets(text) {
  if (!text) return text;
  let out = text;
  // Authorization/Cookie-like header fragments captured in body text.
  out = out.replace(/(authorization"\s*:\s*")([^"]+)(")/gi, '$1[redacted]$3');
  out = out.replace(/(cookie"\s*:\s*")([^"]+)(")/gi, '$1[redacted]$3');
  out = out.replace(/(set-cookie"\s*:\s*")([^"]+)(")/gi, '$1[redacted]$3');
  // Generic token-bearing fields in non-JSON fragments.
  out = out.replace(
    /((?:access_token|refresh_token|id_token|token|csrf|x-csrf-token)"?\s*[:=]\s*")([^"]+)(")/gi,
    '$1[redacted]$3',
  );
  // Raw JWTs.
  out = out.replace(
    /\b[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\b/g,
    '[redacted_jwt]',
  );
  return out;
}

function redactBodyText(text) {
  if (!text) return text;
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(redactStructuredSecrets(parsed));
  } catch {
    return redactUnstructuredSecrets(text);
  }
}

function sanitizeEntry(entry, maxBodyBytes) {
  const req = entry.request || {};
  const res = entry.response || {};
  const reqBody =
    typeof req?.postData?.text === 'string' ? req.postData.text : '';
  const resBody =
    typeof res?.content?.text === 'string' ? res.content.text : '';

  const redactedReqBody = redactBodyText(reqBody);
  const redactedResBody = redactBodyText(resBody);

  const trimmedReqBody =
    redactedReqBody.length > maxBodyBytes
      ? `${redactedReqBody.slice(0, maxBodyBytes)}...[truncated ${redactedReqBody.length - maxBodyBytes} bytes]`
      : redactedReqBody;
  const trimmedResBody =
    redactedResBody.length > maxBodyBytes
      ? `${redactedResBody.slice(0, maxBodyBytes)}...[truncated ${redactedResBody.length - maxBodyBytes} bytes]`
      : redactedResBody;

  return {
    startedDateTime: entry.startedDateTime || '',
    time: entry.time || 0,
    serverIPAddress: entry.serverIPAddress || '',
    request: {
      method: req.method || 'GET',
      url: normalizeUrl(req.url || ''),
      headers: compactHeaders(req.headers || []),
      queryString: compactHeaders(req.queryString || []),
      bodySize: req.bodySize ?? -1,
      postData: req.postData
        ? {
            mimeType: req.postData.mimeType || '',
            text: trimmedReqBody,
            hash: bodySignature(req.postData),
          }
        : null,
    },
    response: {
      status: res.status || 0,
      statusText: res.statusText || '',
      headers: compactHeaders(res.headers || []),
      redirectURL: res.redirectURL || '',
      bodySize: res.bodySize ?? -1,
      content: res.content
        ? {
            mimeType: res.content.mimeType || '',
            size: res.content.size ?? 0,
            text: trimmedResBody,
          }
        : null,
    },
    timings: entry.timings || {},
    cache: entry.cache || {},
    _meta: {
      fingerprint: requestFingerprint(entry),
      potentialSecrets: collectPotentialSecrets(req, res),
      paramNames: Array.from(parseQueryParamNames(req)).sort(),
    },
  };
}

function looksStaticAsset(urlValue) {
  const lowered = String(urlValue || '').toLowerCase();
  return /\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|css|map|mp4|webm|mp3|wav)(\?|$)/.test(
    lowered,
  );
}

function isLikelyPentestRelevant(entry) {
  const method = String(entry.request?.method || 'GET').toUpperCase();
  const status = Number(entry.response?.status || 0);
  const urlValue = String(entry.request?.url || '');
  const loweredUrl = urlValue.toLowerCase();
  const queryParamNames = new Set(entry._meta?.paramNames || []);
  const reqHeaders = new Set((entry.request?.headers || []).map((h) => h.name));
  const resHeaders = new Set(
    (entry.response?.headers || []).map((h) => h.name),
  );

  if (looksStaticAsset(urlValue)) return false;
  if (loweredUrl.includes('/socket.io/')) {
    // Drop common realtime heartbeat/polling noise in aggressive mode.
    if (method === 'GET' && status >= 200 && status < 400) return false;
  }
  if (status >= 400) return true;
  if (method !== 'GET') return true;
  if (urlValue.includes('?')) return true;
  if (entry._meta?.potentialSecrets?.length) return true;
  if (
    loweredUrl.includes('/auth') ||
    loweredUrl.includes('/login') ||
    loweredUrl.includes('/token') ||
    loweredUrl.includes('/session') ||
    loweredUrl.includes('/admin') ||
    loweredUrl.includes('/oauth') ||
    loweredUrl.includes('/graphql') ||
    loweredUrl.includes('/upload') ||
    loweredUrl.includes('/webhook') ||
    loweredUrl.includes('/api/')
  ) {
    return true;
  }
  for (const key of queryParamNames) {
    if (
      /token|session|password|passwd|secret|auth|key|jwt|code|state|redirect/i.test(
        key,
      )
    ) {
      return true;
    }
  }
  for (const h of ['authorization', 'cookie', 'x-api-key']) {
    if (reqHeaders.has(h)) return true;
  }
  for (const h of [
    'set-cookie',
    'access-control-allow-origin',
    'content-security-policy',
  ]) {
    if (resHeaders.has(h)) return true;
  }
  return false;
}

function toMethodPath(entry) {
  const method = String(entry.request?.method || 'GET').toUpperCase();
  try {
    const url = new URL(entry.request?.url || '');
    return `${method} ${url.pathname}`;
  } catch {
    return `${method} ${entry.request?.url || ''}`;
  }
}

function buildPentestFindingsReport({
  inputPath,
  outputHarPath,
  summary,
  pentestEntries,
  endpointWordlist,
}) {
  const highRisk = pentestEntries.filter(
    (e) => Number(e.response?.status || 0) >= 400,
  );
  const withSecrets = pentestEntries.filter(
    (e) => (e._meta?.potentialSecrets || []).length > 0,
  );
  const topSlow = [...pentestEntries]
    .sort((a, b) => Number(b.time || 0) - Number(a.time || 0))
    .slice(0, 15);
  const authLike = pentestEntries
    .filter((e) =>
      /auth|login|token|session|oauth|register|password|passkey/i.test(
        e.request?.url || '',
      ),
    )
    .map((e) => e.request.url);

  return [
    '# Pentest-First HAR Findings',
    '',
    `- Source HAR: \`${inputPath}\``,
    `- Clean HAR: \`${outputHarPath}\``,
    `- Unique requests: **${summary.totalUniqueRequests}**`,
    `- Pentest-focused requests: **${pentestEntries.length}**`,
    `- Duplicates removed: **${summary.duplicateRequestsRemoved}**`,
    '',
    '## Target Surface (Method + Path)',
    ...endpointWordlist.slice(0, 120).map((line) => `- ${line}`),
    ...(endpointWordlist.length > 120 ? ['- ...more in endpoints.txt'] : []),
    '',
    '## Error/Interesting Responses (>=400)',
    ...(highRisk.length
      ? highRisk
          .slice(0, 40)
          .map((e) => `- ${toMethodPath(e)} -> ${e.response.status}`)
      : ['- none']),
    '',
    '## Requests With Auth/Secret Signals',
    ...(withSecrets.length
      ? withSecrets
          .slice(0, 40)
          .map(
            (e) =>
              `- ${toMethodPath(e)} :: ${e._meta.potentialSecrets.join(', ')}`,
          )
      : ['- none']),
    '',
    '## Likely Auth Endpoints',
    ...(authLike.length
      ? Array.from(new Set(authLike))
          .slice(0, 60)
          .map((u) => `- ${u}`)
      : ['- none']),
    '',
    '## Slowest Requests',
    ...topSlow.map(
      (e) => `- ${toMethodPath(e)} :: ${Math.round(Number(e.time || 0))}ms`,
    ),
    '',
  ].join('\n');
}

function summarize(cleanEntries, duplicateCounts) {
  const byStatus = new Map();
  const byMethod = new Map();
  const byHost = new Map();
  const authEndpoints = [];
  const noisyParams = new Set();
  let redirects = 0;

  for (const entry of cleanEntries) {
    const status = Number(entry.response?.status || 0);
    const method = String(entry.request?.method || 'GET').toUpperCase();
    byStatus.set(status, (byStatus.get(status) || 0) + 1);
    byMethod.set(method, (byMethod.get(method) || 0) + 1);

    try {
      const host = new URL(entry.request?.url || '').host || 'unknown-host';
      byHost.set(host, (byHost.get(host) || 0) + 1);
    } catch {
      byHost.set('invalid-url', (byHost.get('invalid-url') || 0) + 1);
    }

    if (status >= 300 && status < 400) redirects += 1;

    const lowered = (entry.request?.url || '').toLowerCase();
    if (
      lowered.includes('/login') ||
      lowered.includes('/auth') ||
      lowered.includes('/token') ||
      lowered.includes('/session')
    ) {
      authEndpoints.push(entry.request.url);
    }
    for (const name of entry._meta?.paramNames || []) {
      if (
        /token|session|password|passwd|secret|auth|key|jwt|code|state/i.test(
          name,
        )
      ) {
        noisyParams.add(name);
      }
    }
  }

  const duplicateTotal = Array.from(duplicateCounts.values()).reduce(
    (acc, count) => acc + (count - 1),
    0,
  );

  return {
    totalUniqueRequests: cleanEntries.length,
    duplicateRequestsRemoved: duplicateTotal,
    statusHistogram: Object.fromEntries(
      Array.from(byStatus.entries()).sort((a, b) => a[0] - b[0]),
    ),
    methodHistogram: Object.fromEntries(
      Array.from(byMethod.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    ),
    hostHistogram: Object.fromEntries(
      Array.from(byHost.entries()).sort((a, b) => b[1] - a[1]),
    ),
    redirects,
    suspectedSensitiveParams: Array.from(noisyParams).sort(),
    likelyAuthEndpoints: Array.from(new Set(authEndpoints)).slice(0, 100),
  };
}

function buildMarkdownReport(
  summary,
  duplicateCounts,
  inputPath,
  outputHarPath,
) {
  const topDuplicates = Array.from(duplicateCounts.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  const shorten = (value, max = 220) =>
    value.length > max ? `${value.slice(0, max)}...[truncated]` : value;

  return [
    '# HAR Pentest Summary',
    '',
    `- Source HAR: \`${inputPath}\``,
    `- Clean HAR: \`${outputHarPath}\``,
    `- Unique requests: **${summary.totalUniqueRequests}**`,
    `- Duplicates removed: **${summary.duplicateRequestsRemoved}**`,
    '',
    '## Methods',
    ...Object.entries(summary.methodHistogram).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## Status Codes',
    ...Object.entries(summary.statusHistogram).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## Top Hosts',
    ...Object.entries(summary.hostHistogram)
      .slice(0, 20)
      .map(([k, v]) => `- ${k}: ${v}`),
    '',
    `## Redirects`,
    `- ${summary.redirects}`,
    '',
    '## Suspected Sensitive Query Params',
    ...(summary.suspectedSensitiveParams.length
      ? summary.suspectedSensitiveParams.map((p) => `- ${p}`)
      : ['- none detected']),
    '',
    '## Likely Auth Endpoints',
    ...(summary.likelyAuthEndpoints.length
      ? summary.likelyAuthEndpoints.map((url) => `- ${url}`)
      : ['- none detected']),
    '',
    '## Most Duplicated Request Fingerprints',
    ...(topDuplicates.length
      ? topDuplicates.map(([fp, count]) => `- (${count}x) ${shorten(fp)}`)
      : ['- no duplicates found']),
    '',
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  const inputPath = path.resolve(process.cwd(), args[0]);
  let outDir = path.resolve(process.cwd(), './artifacts/har-clean');
  let maxBodyBytes = 2048;
  let aggressive = false;
  let emitJsonSummary = false;

  for (let i = 1; i < args.length; i += 1) {
    if (args[i] === '--out-dir' && args[i + 1]) {
      outDir = path.resolve(process.cwd(), args[i + 1]);
      i += 1;
      continue;
    }
    if (args[i] === '--max-body' && args[i + 1]) {
      maxBodyBytes = Number(args[i + 1]) || maxBodyBytes;
      i += 1;
      continue;
    }
    if (args[i] === '--aggressive') {
      aggressive = true;
      continue;
    }
    if (args[i] === '--json-summary') {
      emitJsonSummary = true;
      continue;
    }
  }

  const raw = await fs.readFile(inputPath, 'utf8');
  const har = JSON.parse(raw);
  const entries = Array.isArray(har?.log?.entries) ? har.log.entries : [];

  const dedupMap = new Map();
  const duplicateCounts = new Map();

  for (const entry of entries) {
    const fp = requestFingerprint(entry);
    duplicateCounts.set(fp, (duplicateCounts.get(fp) || 0) + 1);
    if (!dedupMap.has(fp)) {
      dedupMap.set(fp, sanitizeEntry(entry, maxBodyBytes));
    }
  }

  const cleanEntries = Array.from(dedupMap.values()).sort((a, b) =>
    String(a.startedDateTime).localeCompare(String(b.startedDateTime)),
  );

  const outputHar = {
    log: {
      version: String(har?.log?.version || '1.2'),
      creator: har?.log?.creator || { name: 'har-sanitize', version: '1.0.0' },
      pages: Array.isArray(har?.log?.pages) ? har.log.pages : [],
      entries: cleanEntries,
      _meta: {
        generatedAt: new Date().toISOString(),
        originalEntries: entries.length,
        uniqueEntries: cleanEntries.length,
      },
    },
  };

  const summary = summarize(cleanEntries, duplicateCounts);
  const pentestEntries = aggressive
    ? cleanEntries.filter(isLikelyPentestRelevant)
    : cleanEntries;
  const endpointWordlist = Array.from(
    new Set(pentestEntries.map((e) => toMethodPath(e))),
  ).sort();

  await fs.mkdir(outDir, { recursive: true });
  const base = path.basename(inputPath, path.extname(inputPath));
  const outputHarPath = path.join(outDir, `${base}.clean.har`);
  const reportPath = path.join(outDir, `${base}.report.md`);
  const pentestReportPath = path.join(outDir, `${base}.pentest.md`);
  const endpointsPath = path.join(outDir, `${base}.endpoints.txt`);
  const summaryPath = path.join(outDir, `${base}.summary.json`);

  await fs.writeFile(outputHarPath, JSON.stringify(outputHar, null, 2), 'utf8');
  if (emitJsonSummary) {
    await fs.writeFile(
      summaryPath,
      JSON.stringify(
        {
          source: inputPath,
          outputHarPath,
          ...summary,
        },
        null,
        2,
      ),
      'utf8',
    );
  }
  await fs.writeFile(
    reportPath,
    buildMarkdownReport(summary, duplicateCounts, inputPath, outputHarPath),
    'utf8',
  );
  await fs.writeFile(
    pentestReportPath,
    buildPentestFindingsReport({
      inputPath,
      outputHarPath,
      summary,
      pentestEntries,
      endpointWordlist,
    }),
    'utf8',
  );
  await fs.writeFile(
    endpointsPath,
    endpointWordlist.join('\n') + (endpointWordlist.length ? '\n' : ''),
    'utf8',
  );

  const lines = [
    `source: ${inputPath}`,
    `clean_har: ${outputHarPath}`,
    `pentest_report: ${pentestReportPath}`,
    `endpoints: ${endpointsPath}`,
    `original_entries: ${entries.length}`,
    `unique_entries: ${cleanEntries.length}`,
    `pentest_entries: ${pentestEntries.length}`,
    `duplicates_removed: ${summary.duplicateRequestsRemoved}`,
  ];
  if (emitJsonSummary) lines.push(`summary_json: ${summaryPath}`);
  process.stdout.write(lines.join('\n') + '\n');
}

main().catch((error) => {
  process.stderr.write(`har-sanitize failed: ${String(error)}\n`);
  process.exit(1);
});
