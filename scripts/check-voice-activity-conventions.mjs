#!/usr/bin/env node
/**
 * Voice-activity convention guard (docs/echo-voice-activity-conventions.md).
 *
 * The voice activity games (Hangman, Codenames, Skriggles, Tic-Tac-Toe,
 * Wordline, Watch-Together) are siblings that must stay structurally identical.
 * This guard blocks NEW drift across four crisp, mechanical rules:
 *
 *   1. Private audio engines     — no `new AudioContext` outside useVoiceGameSfx.
 *   2. Per-game "tick" primitive — no copied `{updatedAt;revision}` tick type or
 *                                  `isNewer*Tick` outside voice/shared/.
 *   3. Per-game host election    — no copied `*OrchestratorUserId`/`*ArbiterUserId`
 *                                  declaration outside voice/shared/.
 *   4. Unprefixed components     — `.vue` in a game folder must be `Vc`-prefixed.
 *
 * Existing violations are grandfathered in
 * scripts/voice-activity-conventions-allowlist.json. That list may only shrink:
 * a stale entry (no longer a real violation) also fails the build, so fixes are
 * permanent.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWLIST_PATH = path.join(
  root,
  'scripts',
  'voice-activity-conventions-allowlist.json',
);

const allow = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
const cfg = allow.config;
const voiceRoot = path.join(root, ...cfg.voiceRoot.split('/'));
const sharedRel = cfg.sharedDir;
const audioEngineRel = cfg.audioEngineModule;

const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__', 'tests']);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (st.isFile()) out.push(p);
  }
  return out;
}

function rel(p) {
  return path.relative(root, p).split(path.sep).join('/');
}

function isTest(r) {
  return /\.test\.|\.integration\.|\.spec\./.test(r);
}

// --- rule matchers (declarations only; imports / call-sites / re-exports ok) ---
// Only a *type declaration* counts — `const t: FooTick = {…}` at a call site is fine.
const TICK_TYPE_RE =
  /(?:export\s+)?type\s+\w*Tick\b\s*=\s*\{[^}]*\bupdatedAt\b[^}]*\brevision\b/;
const IS_NEWER_TICK_RE =
  /(?:export\s+)?(?:function\s+isNewer\w*Tick\b|const\s+isNewer\w*Tick\s*=)/;
const HOST_ELECTION_RE =
  /(?:export\s+)?(?:function\s+\w*(?:OrchestratorUserId|ArbiterUserId)\b|const\s+\w*(?:OrchestratorUserId|ArbiterUserId)\s*=)/;
const PRIVATE_AUDIO_RE = /new\s+AudioContext\b|webkitAudioContext/;

const errors = [];
// Track which allowlist entries actually fire, to detect stale grandfathering.
const used = {
  privateAudioContext: new Set(),
  perGameTick: new Set(),
  perGameHostElection: new Set(),
  unprefixedActivityComponent: new Set(),
};

// An allowlist entry matches `r` if it equals `r`, or (ending in "/") is a
// directory prefix of `r`. Directory entries grandfather a whole mid-refactor
// area (e.g. hangman/components/) without listing every file.
function matchEntry(bucket, r) {
  return allow[bucket].find(
    (e) => e === r || (e.endsWith('/') && r.startsWith(e)),
  );
}

function flag(bucket, r, msg) {
  const entry = matchEntry(bucket, r);
  if (entry) {
    used[bucket].add(entry);
    return;
  }
  errors.push(`${r}: ${msg}`);
}

const files = walk(voiceRoot);
for (const file of files) {
  const r = rel(file);
  if (isTest(r) || r.endsWith('.d.ts')) continue;
  const inShared = r === sharedRel || r.startsWith(`${sharedRel}/`);

  // Rule 4 — component naming inside game folders.
  if (r.endsWith('.vue')) {
    // path: frontend/src/features/voice/<game>/.../components/<File>.vue
    const after = r.slice(`${cfg.voiceRoot}/`.length);
    const segs = after.split('/');
    const game = segs[0];
    const inComponents = segs.includes('components');
    // Only police nested game folders, not the shared voice/components dir.
    if (game !== 'components' && game !== 'shared' && inComponents) {
      const base = path.basename(r);
      if (!base.startsWith('Vc')) {
        flag(
          'unprefixedActivityComponent',
          r,
          `voice activity component must be Vc-prefixed (got "${base}") — see docs/echo-voice-activity-conventions.md §1`,
        );
      }
    }
    continue;
  }

  if (!/\.(ts|tsx|mts|cts)$/.test(r)) continue;
  const text = readFileSync(file, 'utf8');

  // Rule 1 — private AudioContext (anything but the shared engine).
  if (r !== audioEngineRel && PRIVATE_AUDIO_RE.test(text)) {
    flag(
      'privateAudioContext',
      r,
      `creates a private AudioContext — route audio through ${audioEngineRel} (§4)`,
    );
  }

  // Rules 2 & 3 only apply outside the shared home.
  if (!inShared) {
    if (TICK_TYPE_RE.test(text) || IS_NEWER_TICK_RE.test(text)) {
      flag(
        'perGameTick',
        r,
        `declares a per-game optimistic-merge "tick" — use the shared ActivityTick in ${sharedRel}/ (§3)`,
      );
    }
    if (HOST_ELECTION_RE.test(text)) {
      flag(
        'perGameHostElection',
        r,
        `declares a per-game host-election helper — use/alias the shared one in ${sharedRel}/ (§3)`,
      );
    }
  }
}

// Stale-allowlist detection: every grandfathered entry must still be a real,
// present violation. Forces the list to shrink as code is fixed.
for (const bucket of Object.keys(used)) {
  for (const entry of allow[bucket]) {
    const fsPath = path.join(root, ...entry.replace(/\/$/, '').split('/'));
    if (!existsSync(fsPath)) {
      errors.push(
        `allowlist[${bucket}] entry no longer exists: ${entry} — remove it`,
      );
    } else if (!used[bucket].has(entry)) {
      errors.push(
        `allowlist[${bucket}] entry is no longer a violation: ${entry} — remove it from the allowlist so it can't regress`,
      );
    }
  }
}

if (errors.length) {
  console.error('check-voice-activity-conventions: FAILED');
  for (const e of errors) console.error(`  ${e}`);
  console.error(
    '\nSee docs/echo-voice-activity-conventions.md. New games must follow the family conventions; grandfathered files live in scripts/voice-activity-conventions-allowlist.json.',
  );
  process.exit(1);
}
console.log(
  `check-voice-activity-conventions: ok (scanned ${files.length} files under ${cfg.voiceRoot})`,
);
