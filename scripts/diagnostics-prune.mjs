import fs from 'fs/promises';
import path from 'path';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function parseSessionStartFromName(name) {
  // session_YYYYMMDDHHMMSS_<id>
  const m = /^session_(\d{14})_[a-z0-9]+$/i.exec(name);
  if (!m) return null;
  const ts = m[1];
  const year = Number(ts.slice(0, 4));
  const month = Number(ts.slice(4, 6)) - 1;
  const day = Number(ts.slice(6, 8));
  const hour = Number(ts.slice(8, 10));
  const minute = Number(ts.slice(10, 12));
  const second = Number(ts.slice(12, 14));
  const ms = Date.UTC(year, month, day, hour, minute, second);
  return Number.isFinite(ms) ? ms : null;
}

async function removeDirIfOld(parentDir, nowMs) {
  let entries = [];
  try {
    entries = await fs.readdir(parentDir, { withFileTypes: true });
  } catch {
    return { removed: 0, kept: 0 };
  }

  let removed = 0;
  let kept = 0;
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const startMs = parseSessionStartFromName(ent.name);
    if (startMs == null) {
      kept += 1;
      continue;
    }
    if (nowMs - startMs > SIX_HOURS_MS) {
      await fs.rm(path.join(parentDir, ent.name), {
        recursive: true,
        force: true,
      });
      removed += 1;
    } else {
      kept += 1;
    }
  }
  return { removed, kept };
}

async function maybePruneIndex(indexPath) {
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const nowMs = Date.now();
    const filtered = parsed.filter((row) => {
      const sid = String(row?.sessionId ?? '');
      const stamp = parseSessionStartFromName(sid);
      if (stamp == null) return true;
      return nowMs - stamp <= SIX_HOURS_MS;
    });
    if (filtered.length !== parsed.length) {
      await fs.writeFile(indexPath, JSON.stringify(filtered, null, 2), 'utf8');
    }
  } catch {
    // best effort: no-op
  }
}

async function pruneTarget(baseDir) {
  const sessionsDir = path.join(baseDir, '.diagnostics', 'sessions');
  const nowMs = Date.now();
  const { removed, kept } = await removeDirIfOld(sessionsDir, nowMs);
  await maybePruneIndex(path.join(sessionsDir, 'index.json'));
  return { sessionsDir, removed, kept };
}

async function main() {
  const repoRoot = process.cwd();
  const targets = [
    await pruneTarget(repoRoot),
    await pruneTarget(path.join(repoRoot, 'backend')),
  ];

  const totalRemoved = targets.reduce((n, t) => n + t.removed, 0);
  const details = targets.map((t) => ({
    sessionsDir: t.sessionsDir,
    removed: t.removed,
    kept: t.kept,
  }));

  process.stdout.write(
    `[diagnostics-prune] removed=${totalRemoved} details=${JSON.stringify(details)}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[diagnostics-prune] failed: ${String(err)}\n`);
  process.exit(1);
});
