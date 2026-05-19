import fs from 'fs/promises';
import path from 'path';

const root = path.resolve(process.cwd(), '.diagnostics/sessions');

async function readJsonl(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function latestSessionDirName(names) {
  return names
    .filter((n) => n.startsWith('session_'))
    .sort()
    .slice(-1)[0];
}

function toChainSummary(events) {
  const byTrace = new Map();
  for (const ev of events) {
    const trace = ev.traceId || 'no-trace';
    const arr = byTrace.get(trace) || [];
    arr.push(ev);
    byTrace.set(trace, arr);
  }
  const out = [];
  for (const [traceId, arr] of byTrace.entries()) {
    arr.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    out.push({
      traceId,
      count: arr.length,
      firstTs: arr[0]?.ts,
      lastTs: arr[arr.length - 1]?.ts,
      domains: Array.from(new Set(arr.map((x) => x.domain))).sort(),
      statuses: Array.from(
        new Set(arr.map((x) => x.status).filter(Boolean)),
      ).sort(),
      events: arr.map((x) => ({
        ts: x.ts,
        event: x.event,
        stage: x.stage,
        level: x.level,
        source: x.source,
        domain: x.domain,
        spanId: x.spanId,
        parentSpanId: x.parentSpanId,
      })),
    });
  }
  return out;
}

async function main() {
  const explicit = process.argv[2];
  const sessionDir = explicit
    ? path.resolve(process.cwd(), explicit)
    : path.join(root, latestSessionDirName(await fs.readdir(root)));

  const files = await fs.readdir(sessionDir);
  const spanFiles = files.filter((f) => /^spans_\d{3}\.jsonl$/.test(f)).sort();
  if (spanFiles.length === 0) {
    process.stdout.write(`No span files found in ${sessionDir}\n`);
    return;
  }

  const events = [];
  for (const file of spanFiles) {
    events.push(...(await readJsonl(path.join(sessionDir, file))));
  }
  events.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

  const errors = events.filter(
    (e) => e.level === 'error' || e.stage === 'fail',
  );
  const chains = toChainSummary(events);

  await fs.writeFile(
    path.join(sessionDir, 'errors.jsonl'),
    errors.map((e) => JSON.stringify(e)).join('\n') +
      (errors.length ? '\n' : ''),
    'utf8',
  );
  await fs.writeFile(
    path.join(sessionDir, 'chains.jsonl'),
    chains.map((e) => JSON.stringify(e)).join('\n') +
      (chains.length ? '\n' : ''),
    'utf8',
  );

  const byDomain = new Map();
  for (const ev of events) {
    const key = `${ev.domain}:${ev.level}`;
    byDomain.set(key, (byDomain.get(key) || 0) + 1);
  }
  process.stdout.write(
    JSON.stringify(
      {
        sessionDir,
        totalEvents: events.length,
        totalErrors: errors.length,
        totalTraces: chains.length,
        byDomainLevel: Object.fromEntries(
          Array.from(byDomain.entries()).sort(),
        ),
      },
      null,
      2,
    ) + '\n',
  );
}

main().catch((e) => {
  process.stderr.write(`diagnostics:summarize failed: ${String(e)}\n`);
  process.exit(1);
});
