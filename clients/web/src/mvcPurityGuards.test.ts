import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..', '..');
const FRONTEND_SRC = join(REPO_ROOT, 'clients', 'web', 'src');
const BACKEND_SRC = join(REPO_ROOT, 'server', 'backend', 'src');

function walkFiles(
  dir: string,
  opts: { includeTests?: boolean } = {},
  acc: string[] = [],
): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (name === 'node_modules') continue;
    const abs = join(dir, name);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      walkFiles(abs, opts, acc);
      continue;
    }
    if (!/\.(ts|vue)$/.test(name)) continue;
    if (!opts.includeTests && /\.(test|spec)\.ts$/.test(name)) continue;
    acc.push(abs);
  }
  return acc;
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/');
}

describe('mvc purity guards', () => {
  it('removes misleading compatibility wrappers and duplicate owner files', () => {
    const removedFiles = [
      'clients/web/src/services/orchestration/serverPing.ts',
      'clients/web/src/services/orchestration/buildDmPanelUserList.ts',
      'clients/web/src/services/orchestration/serverVoiceParticipantMerge.ts',
      'clients/web/src/services/orchestration/workspaceRosterApply.ts',
      'clients/web/src/services/orchestration/workspaceRosterMerge.ts',
      'clients/web/src/services/orchestration/workspaceAuthUserRoster.ts',
      'clients/web/src/services/orchestration/workspaceSessionApply.ts',
      'clients/web/src/stores/messageIndex.ts',
      'clients/web/src/features/chat/viewModel/channelMessageIndex.ts',
      'clients/web/src/utils/compareRawMessagesChronologically.ts',
      'clients/web/src/features/chat/controller/echoHistoryController.ts',
      'clients/web/src/features/chat/controller/messageSearchController.ts',
      'clients/web/src/features/chat/viewModel/echoHistoryViewModel.ts',
      'clients/web/src/features/chat/viewModel/messageSearchViewModel.ts',
      'clients/web/src/features/layout/controller/echoWorkspaceLifecycleController.ts',
      'clients/web/src/features/layout/viewModel/echoWorkspaceLifecycleViewModel.ts',
      'clients/web/src/features/layout/viewModel/echoWorkspaceSessionApply.ts',
      'clients/web/src/features/layout/controller/echoWorkspaceSessionController.ts',
      'clients/web/src/features/layout/composables/useEchoPresenceSync.ts',
      'clients/web/src/features/layout/composables/useGuildChannelTree.ts',
      'clients/web/src/features/layout/composables/serverVoiceParticipantMerge.ts',
      'clients/web/src/features/server-settings/roleManagerFactory.ts',
      'clients/web/src/features/chat/domain/echoInvitePreview.ts',
      'clients/web/src/features/chat/domain/postDiscordChannelImportMessages.ts',
      'clients/web/src/features/chat/domain/serverEmojiLibrary.ts',
      'clients/web/src/features/server-settings/domain/fetchManagedRolesFromEcho.ts',
    ];

    const existing = removedFiles.filter((path) =>
      existsSync(join(REPO_ROOT, path)),
    );

    expect(existing, existing.join('\n')).toEqual([]);
  });

  it('keeps pure domain modules free of orchestration, IO, timers, and browser APIs', () => {
    const domainFiles = walkFiles(FRONTEND_SRC).filter((file) =>
      normalize(relative(FRONTEND_SRC, file)).includes('/domain/'),
    );
    const forbiddenPatterns: Array<[RegExp, string]> = [
      [/\bwatch\s*\(/, 'watch('],
      [/\bsetTimeout\s*\(/, 'setTimeout('],
      [/\bfetch\s*\(/, 'fetch('],
      [/\bwindow\./, 'window.'],
      [/\bdocument\./, 'document.'],
      [/\baddEventListener\s*\(/, 'addEventListener('],
      [/\bnew WebSocket\b/, 'new WebSocket'],
      [
        /from ['"]@\/services\/orchestration/,
        'import from services/orchestration',
      ],
      [/from ['"]socket\.io-client['"]/, 'import from socket.io-client'],
    ];

    const offenders: string[] = [];
    for (const file of domainFiles) {
      const src = readFileSync(file, 'utf8');
      const rel = normalize(relative(REPO_ROOT, file));
      for (const [pattern, label] of forbiddenPatterns) {
        if (pattern.test(src)) offenders.push(`${rel}: ${label}`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('keeps runtime imports off removed compatibility paths', () => {
    const forbiddenImports = [
      '@/features/chat/controller/echoHistoryController',
      '@/features/chat/controller/messageSearchController',
      '@/features/chat/viewModel/echoHistoryViewModel',
      '@/features/chat/viewModel/messageSearchViewModel',
      '@/features/layout/controller/echoWorkspaceLifecycleController',
      '@/features/layout/viewModel/echoWorkspaceLifecycleViewModel',
      '@/features/layout/viewModel/echoWorkspaceSessionApply',
      '@/features/layout/controller/echoWorkspaceSessionController',
      '@/features/layout/composables/useEchoPresenceSync',
      '@/features/layout/composables/useGuildChannelTree',
      '@/features/layout/composables/serverVoiceParticipantMerge',
      '@/features/server-settings/roleManagerFactory',
      '@/services/orchestration/serverPing',
      '@/services/orchestration/buildDmPanelUserList',
      '@/services/orchestration/serverVoiceParticipantMerge',
      '@/services/orchestration/workspaceRosterApply',
      '@/services/orchestration/workspaceSessionApply',
      '@/stores/messageIndex',
      '@/features/chat/viewModel/channelMessageIndex',
      '@/utils/compareRawMessagesChronologically',
    ];

    const offenders: string[] = [];
    for (const file of walkFiles(FRONTEND_SRC)) {
      const src = readFileSync(file, 'utf8');
      const rel = normalize(relative(REPO_ROOT, file));
      for (const forbiddenImport of forbiddenImports) {
        if (src.includes(forbiddenImport)) {
          offenders.push(`${rel}: ${forbiddenImport}`);
        }
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('keeps shared ping semantics singular and notification levels shared', () => {
    const files = [...walkFiles(FRONTEND_SRC), ...walkFiles(BACKEND_SRC)];
    const offenders: string[] = [];

    for (const file of files) {
      const rel = normalize(relative(REPO_ROOT, file));
      const src = readFileSync(file, 'utf8');

      if (src.includes('classifyServerPingFromMentions')) {
        offenders.push(`${rel}: classifyServerPingFromMentions`);
      }
      if (src.includes('mergeServerPingKinds')) {
        offenders.push(`${rel}: mergeServerPingKinds`);
      }
      if (src.includes('applyNotificationLevelToServerPing')) {
        offenders.push(`${rel}: applyNotificationLevelToServerPing`);
      }
      if (/export type ServerNotificationLevel\s*=\s*\|/.test(src)) {
        offenders.push(`${rel}: duplicate ServerNotificationLevel union`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('keeps message bucket materialization inside the authority surface', () => {
    const allowlist = [
      'channelMessageAuthority.ts',
      'channelMessageBucket.ts',
      '.test.ts',
      '.spec.ts',
      'mvcPurityGuards.test.ts',
    ];
    const patterns: Array<[RegExp, string]> = [
      [/messages\.value\s*\[[^\]]+\]\s*=/g, 'messages.value[...] ='],
      [/refs\.messages\.value\s*=/g, 'refs.messages.value ='],
    ];

    const offenders: string[] = [];
    for (const file of walkFiles(FRONTEND_SRC, { includeTests: true })) {
      const rel = normalize(relative(REPO_ROOT, file));
      if (allowlist.some((entry) => rel.includes(entry))) continue;
      const src = readFileSync(file, 'utf8');
      for (const [pattern, label] of patterns) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(src))) {
          const line = src.slice(0, match.index).split('\n').length;
          offenders.push(`${rel}:${line}: ${label}`);
        }
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
