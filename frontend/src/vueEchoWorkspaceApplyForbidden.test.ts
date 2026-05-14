import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Leak goal row 27: presentation trees must not import workspace merge authority.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOTS = ['components', 'features', 'views'].map((p) =>
  join(__dirname, p),
);

const FORBIDDEN = 'echoWorkspaceSessionApply';

function collectVue(dir: string, acc: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) collectVue(p, acc);
    else if (extname(name) === '.vue') acc.push(p);
  }
}

describe('Vue workspace merge authority', () => {
  it('does not import echoWorkspaceSessionApply in components / features / views', () => {
    const bad: string[] = [];
    for (const root of ROOTS) {
      const files: string[] = [];
      collectVue(root, files);
      for (const f of files) {
        if (readFileSync(f, 'utf8').includes(FORBIDDEN)) bad.push(f);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});
