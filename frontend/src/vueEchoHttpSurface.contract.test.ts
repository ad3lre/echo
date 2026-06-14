import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Leak goal row 28: no Echo HTTP calls inside presentation `.vue` trees
 * (`components/`, `features/`, `views/`).
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FRONTEND_SRC = join(__dirname, '..');

const ROOTS = ['components', 'features', 'views'].map((p) =>
  join(FRONTEND_SRC, 'src', p),
);

const RUNTIME_ECHO_HTTP = new RegExp(
  String.raw`\b(echoFetch|fetchEcho\w*|postEcho\w*|patchEcho\w*|deleteEcho\w*)\s*\(`,
);
const TEMP_ALLOWED_RUNTIME_ECHO_API_FILES = new Set([
  join(
    FRONTEND_SRC,
    'src',
    'features',
    'settings',
    'components',
    'E2eeDevicesModal.vue',
  ),
  join(
    FRONTEND_SRC,
    'src',
    'features',
    'auth',
    'components',
    'GuestOnboardingModal.vue',
  ),
  join(
    FRONTEND_SRC,
    'src',
    'features',
    'channel-settings',
    'components',
    'ChannelDiscordSyncPanel.vue',
  ),
  join(
    FRONTEND_SRC,
    'src',
    'features',
    'channel-settings',
    'components',
    'CategoryDiscordChatSyncPanel.vue',
  ),
  join(
    FRONTEND_SRC,
    'src',
    'features',
    'voice',
    'components',
    'VcActivityStage.vue',
  ),
  join(
    FRONTEND_SRC,
    'src',
    'features',
    'voice',
    'components',
    'VcWatchTogetherLobby.vue',
  ),
  join(
    FRONTEND_SRC,
    'src',
    'features',
    'server-settings',
    'components',
    'ServerSettingsDiscordSection.vue',
  ),
]);

function hasDisallowedEchoApiValueImport(src: string): boolean {
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('@/api/echo')) continue;
    const t = line.trimStart();
    if (t.startsWith('//')) continue;
    if (/^\s*import\s+type\b/.test(line)) continue;
    if (/^\s*}\s*from\s+['"]@\/api\/echo/.test(line)) {
      for (let j = i - 1; j >= 0; j--) {
        const p = lines[j].trim();
        if (!p || p.startsWith('//')) continue;
        if (/^import\s+type\b/.test(lines[j])) break;
        return true;
      }
      continue;
    }
    return true;
  }
  return false;
}

function collectVueFiles(dir: string, acc: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) collectVueFiles(p, acc);
    else if (extname(name) === '.vue') acc.push(p);
  }
}

describe('Vue Echo HTTP surface', () => {
  it('has no runtime Echo fetch helpers under components / features / views', () => {
    const vueFiles: string[] = [];
    for (const root of ROOTS) collectVueFiles(root, vueFiles);
    expect(vueFiles.length).toBeGreaterThan(10);

    const failures: string[] = [];
    for (const file of vueFiles) {
      if (TEMP_ALLOWED_RUNTIME_ECHO_API_FILES.has(file)) continue;
      const src = readFileSync(file, 'utf8');
      if (RUNTIME_ECHO_HTTP.test(src)) {
        failures.push(`${file} (Echo HTTP call)`);
      }
      if (hasDisallowedEchoApiValueImport(src)) {
        failures.push(`${file} (value import from @/api/echo*)`);
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});
