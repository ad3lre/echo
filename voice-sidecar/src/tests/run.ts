import * as fs from 'fs';
import * as path from 'path';

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (
        ent.name === 'node_modules' ||
        ent.name === 'dist' ||
        ent.name === 'tests'
      ) {
        continue;
      }
      out.push(...collectFiles(p));
    } else if (ent.isFile() && p.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
}

function main(): void {
  const srcRoot = path.resolve(__dirname, '..');
  const files = collectFiles(srcRoot);

  // Layer 2 is paused; we still enforce the most important invariant:
  // LiveKit SDK imports must stay quarantined to the adapter module(s).
  const disallowed: string[] = [];
  for (const f of files) {
    const rel = path.relative(srcRoot, f).replace(/\\/g, '/');
    const text = fs.readFileSync(f, 'utf8');
    if (!text.includes('livekit-server-sdk')) continue;
    if (!rel.startsWith('adapter/')) disallowed.push(rel);
  }

  if (disallowed.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `voice-sidecar architecture violation: livekit-server-sdk import outside adapter/:\\n- ${disallowed.join(
        '\\n- ',
      )}`,
    );
    process.exitCode = 1;
    return;
  }

  // eslint-disable-next-line no-console
  console.info('voice-sidecar tests: OK');
}

main();
