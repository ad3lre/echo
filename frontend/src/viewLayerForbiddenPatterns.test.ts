import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * View purity guardrails: presentation trees must not import index merge authority
 * or session-apply modules directly (those belong to orchestration / stores).
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOTS = ['components', 'features', 'views'].map((p) =>
  join(__dirname, p),
);

const FORBIDDEN_SUBSTRINGS = [
  'features/chat/domain/channelMessageIndex',
  'services/realtime/channelMessageIndex',
  '@/services/domain/workspaceSession',
] as const;

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

describe('view layer forbidden patterns', () => {
  it('Vue SFCs under components/features/views do not import merge authority / session apply paths', () => {
    const bad: string[] = [];
    for (const root of ROOTS) {
      const files: string[] = [];
      collectVue(root, files);
      for (const f of files) {
        const src = readFileSync(f, 'utf8');
        for (const s of FORBIDDEN_SUBSTRINGS) {
          if (src.includes(s)) bad.push(`${f}: ${s}`);
        }
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});
