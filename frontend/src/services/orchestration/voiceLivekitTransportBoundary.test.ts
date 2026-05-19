import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Leak goal row 39: LiveKit join / voice REST session calls stay in
 * `services/orchestration/voice.ts` — layout must not fork transport.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/** `frontend/src` — scan all TS/Vue; allow only voice orchestration + API + its unit test. */
const FRONTEND_SRC = join(__dirname, '..', '..');

const ALLOW_REL_PREFIXES = [
  join('services', 'orchestration', 'voice.ts'),
  join('services', 'orchestration', '__tests__', 'voice.test.ts'),
  join('api', 'echo', 'voice.ts'),
];

const NEEDLES = [
  'postEchoVoiceLivekitSession',
  'postEchoDmLivekitSession',
  'postEchoVoiceJoin',
  'postEchoVoiceLeave',
] as const;

function collectSourceFiles(dir: string, acc: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) collectSourceFiles(p, acc);
    else if (
      (extname(name) === '.ts' || extname(name) === '.vue') &&
      !name.includes('.test.') &&
      !name.includes('.spec.')
    )
      acc.push(p);
  }
}

function isAllowedVoiceTransportFile(rel: string): boolean {
  const norm = rel.split(/[/\\]/).join('/');
  return ALLOW_REL_PREFIXES.some((a) =>
    norm.endsWith(a.split(/[/\\]/).join('/')),
  );
}

describe('voice LiveKit / join transport boundary', () => {
  it('keeps session + join + leave Echo calls out of layout and random composables', () => {
    const files: string[] = [];
    collectSourceFiles(FRONTEND_SRC, files);
    const offenders: string[] = [];
    for (const abs of files) {
      const rel = relative(FRONTEND_SRC, abs);
      if (isAllowedVoiceTransportFile(rel)) continue;
      const src = readFileSync(abs, 'utf8');
      for (const n of NEEDLES) {
        if (src.includes(n)) {
          offenders.push(`${rel} (${n})`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
