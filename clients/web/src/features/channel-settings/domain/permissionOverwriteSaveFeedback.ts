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
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';
import { channelPermissionLabel } from '@/i18n/labels';
import { echoT } from '@/i18n';

export type PermissionOverwriteSaveWarningsDto = {
  strippedAllows?: string[];
};

function labelForEchoPermission(
  echoKey: string,
  defs: readonly ChannelPermissionDef[],
): string {
  const overrides = echoPartialToChannelOverrides({ [echoKey]: true });
  const uiKey = Object.keys(overrides)[0] as ChannelPermissionKey | undefined;
  if (uiKey) {
    const def = defs.find((d) => d.key === uiKey);
    return channelPermissionLabel(uiKey, { group: def?.group });
  }
  return echoKey;
}

function joinPermissionLabels(labels: string[]): string {
  if (labels.length <= 4) return labels.join(', ');
  return echoT('b31.overwrite.andMore', {
    list: labels.slice(0, 3).join(', '),
    count: labels.length - 3,
  });
}

export function formatPermissionOverwriteSaveWarnings(
  warnings: PermissionOverwriteSaveWarningsDto | undefined,
  defs: readonly ChannelPermissionDef[],
): string | null {
  const stripped = warnings?.strippedAllows ?? [];
  if (stripped.length === 0) return null;
  const labels = stripped.map((k) => labelForEchoPermission(k, defs));
  return echoT('b31.overwrite.strippedAllows', {
    list: joinPermissionLabels(labels),
  });
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
          ? echoT('b31.overwrite.everyoneOverwrite')
          : echoT('b31.overwrite.typedOverwrite', { type: row.targetType }),
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
  return echoT('b31.overwrite.persistenceMismatch', {
    list: joinPermissionLabels(mismatchedLabels),
  });
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
