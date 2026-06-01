import {
  channelOverridesToEchoPartial,
  echoPartialToChannelOverrides,
} from '@shared/rolePermissionBridge';
import type { ChannelPermissionKey } from '@shared/types';
import type {
  ChannelPermissionDef,
  PermissionOverwriteRowDraft,
} from '@/features/channel-settings/types';
import { canonicalizeEchoPermissionRowsForSave } from '@/features/channel-settings/domain/echoPermissionRows';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

export type PermissionOverwriteSaveWarningsDto = {
  strippedAllows?: string[];
};

const ECHO_PERMISSION_LABELS: Record<string, string> = {
  VIEW_CHANNEL: 'View channel',
  SEND_MESSAGES: 'Send messages',
  EMBED_LINKS: 'Embed links',
  ATTACH_FILES: 'Attach files',
  CONNECT: 'Connect',
  SPEAK: 'Speak',
  STREAM: 'Video / stream',
  MANAGE_CHANNELS: 'Manage channel',
  MANAGE_ROLES: 'Manage permissions',
  MANAGE_WEBHOOKS: 'Manage webhooks',
  CREATE_INSTANT_INVITE: 'Create invite',
  ADD_REACTIONS: 'Add reactions',
  READ_MESSAGE_HISTORY: 'Read message history',
  MENTION_EVERYONE: 'Mention everyone',
  MANAGE_MESSAGES: 'Manage messages',
  COMMENT_ON_PAPER: 'Comment on paper',
};

function labelForEchoPermission(
  echoKey: string,
  defs: readonly ChannelPermissionDef[],
): string {
  const overrides = echoPartialToChannelOverrides({ [echoKey]: true });
  const uiKey = Object.keys(overrides)[0] as ChannelPermissionKey | undefined;
  if (uiKey) {
    const def = defs.find((d) => d.key === uiKey);
    if (def) return def.label;
  }
  return ECHO_PERMISSION_LABELS[echoKey] ?? echoKey;
}

export function formatPermissionOverwriteSaveWarnings(
  warnings: PermissionOverwriteSaveWarningsDto | undefined,
  defs: readonly ChannelPermissionDef[],
): string | null {
  const stripped = warnings?.strippedAllows ?? [];
  if (stripped.length === 0) return null;
  const labels = stripped.map((k) => labelForEchoPermission(k, defs));
  const joined =
    labels.length <= 4
      ? labels.join(', ')
      : `${labels.slice(0, 3).join(', ')}, and ${labels.length - 3} more`;
  return `Some Allow overrides were removed because your role does not include: ${joined}. Deny and Inherit changes were still saved.`;
}

function rowKey(row: PermissionOverwriteRowDraft): string {
  return row.targetType === 'everyone'
    ? 'everyone'
    : `${row.targetType}:${row.targetId ?? ''}`;
}

function partialEchoKeySet(
  partial: Partial<Record<ChannelPermissionKey, boolean>>,
): Map<string, boolean> {
  const echo = channelOverridesToEchoPartial(partial);
  return new Map(Object.entries(echo));
}

/** Detect explicit denies/allows the client sent that did not round-trip after save. */
export function findPermissionOverwritePersistenceMismatches(
  sent: PermissionOverwriteRowDraft[],
  fetched: PermissionOverwriteRowDraft[],
  defs: readonly ChannelPermissionDef[] = [],
): string[] {
  const sentCanon = canonicalizeEchoPermissionRowsForSave(sent);
  const fetchedCanon = canonicalizeEchoPermissionRowsForSave(fetched);
  const fetchedByKey = new Map(fetchedCanon.map((r) => [rowKey(r), r]));
  const labels: string[] = [];

  for (const row of sentCanon) {
    const key = rowKey(row);
    const got = fetchedByKey.get(key);
    if (!got) {
      labels.push(
        row.targetType === 'everyone'
          ? '@everyone overwrite'
          : `${row.targetType} overwrite`,
      );
      continue;
    }
    const sentEcho = partialEchoKeySet(row.partial ?? {});
    const gotEcho = partialEchoKeySet(got.partial ?? {});
    for (const [echoKey, sentVal] of sentEcho) {
      if (gotEcho.get(echoKey) !== sentVal) {
        labels.push(labelForEchoPermission(echoKey, defs));
      }
    }
  }

  return [...new Set(labels)];
}

export function formatPermissionOverwritePersistenceMismatch(
  mismatchedLabels: string[],
): string | null {
  if (mismatchedLabels.length === 0) return null;
  const joined =
    mismatchedLabels.length <= 4
      ? mismatchedLabels.join(', ')
      : `${mismatchedLabels.slice(0, 3).join(', ')}, and ${mismatchedLabels.length - 3} more`;
  return `Some permission changes did not save (${joined}). Reload the page and try again, or ask a server owner.`;
}

/** Surface server warnings and post-save drift to the user (non-blocking). */
export function emitPermissionOverwriteSaveFeedback(input: {
  sentRows: PermissionOverwriteRowDraft[];
  fetchedRows: PermissionOverwriteRowDraft[];
  warnings?: PermissionOverwriteSaveWarningsDto;
  defs: readonly ChannelPermissionDef[];
}): void {
  const strippedMsg = formatPermissionOverwriteSaveWarnings(
    input.warnings,
    input.defs,
  );
  if (strippedMsg) dispatchAppToast(strippedMsg, 'warning');

  const mismatches = findPermissionOverwritePersistenceMismatches(
    input.sentRows,
    input.fetchedRows,
    input.defs,
  );
  const mismatchMsg = formatPermissionOverwritePersistenceMismatch(mismatches);
  if (mismatchMsg) dispatchAppToast(mismatchMsg, 'warning');
}
