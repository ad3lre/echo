import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Leak goals **35** (layout Echo composables) and **34** (workspace command layer):
 * no direct workspace snapshot merge APIs outside `echoWorkspaceSessionApply` / VMs.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LAYOUT_COMPOSABLE_FILES = [
  'server/useGuildChannelModals.ts',
  'server/useGuildModeration.ts',
  'profiles/useAppLayoutProfileSafety.ts',
  'messaging/useAppLayoutPinsIntegration.ts',
  'messaging/useAppLayoutMessageActions.ts',
  'realtime/useAppLayoutLiveChannelCaps.ts',
  'server/useSelectedServerInvite.ts',
  'server/useEchoGuildRoleUi.ts',
  'server/useAddServerFlow.ts',
] as const;

const COMPOSABLES_ROOT = join(__dirname, '..');
const LAYOUT_ROOT = join(__dirname, '..', '..');

const WORKSPACE_COMMAND_FILES = [
  join(LAYOUT_ROOT, 'echoWorkspace', 'workspaceServerActions.ts'),
  join(LAYOUT_ROOT, 'echoWorkspace', 'workspaceUserActions.ts'),
] as const;

const FORBIDDEN = [
  'applyWorkspaceSnapshotToEchoSession',
  'setMessagesOnEchoSession',
  'mergeMembersByServerInEchoSession',
] as const;

describe('workspace snapshot merge creep forbidden', () => {
  it('layout Echo-touching composables do not call echo session apply merge APIs', () => {
    const offenders: string[] = [];
    for (const f of LAYOUT_COMPOSABLE_FILES) {
      const abs = join(COMPOSABLES_ROOT, f);
      const src = readFileSync(abs, 'utf8');
      for (const s of FORBIDDEN) {
        if (src.includes(s)) offenders.push(`${f}: ${s}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('workspace server/user command composables do not call echo session apply merge APIs', () => {
    const offenders: string[] = [];
    for (const abs of WORKSPACE_COMMAND_FILES) {
      const src = readFileSync(abs, 'utf8');
      const label = abs.replace(/\\/g, '/').split('/').slice(-2).join('/');
      for (const s of FORBIDDEN) {
        if (src.includes(s)) offenders.push(`${label}: ${s}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
