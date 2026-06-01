import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {string} filePath
 * @param {{ set?: Record<string, string>, remove?: string[], dryRun?: boolean }} options
 */
export function patchEnvFile(
  filePath,
  { set = {}, remove = [], dryRun = false } = {},
) {
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    // create
  }

  const toSet = new Map(Object.entries(set));
  const toRemove = new Set(remove);
  const lines = content.split(/\r?\n/);
  const applied = new Set();
  const out = [];

  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !line.trimStart().startsWith('#')) {
      const key = m[1];
      if (toRemove.has(key)) continue;
      if (toSet.has(key)) {
        out.push(`${key}=${toSet.get(key)}`);
        applied.add(key);
        continue;
      }
    }
    out.push(line);
  }

  for (const [k, v] of toSet) {
    if (!applied.has(k)) {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      out.push(`${k}=${v}`);
    }
  }

  const text = out.join('\n').replace(/\n+$/, '') + '\n';
  if (dryRun) return text;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
  return text;
}
