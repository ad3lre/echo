import { describe, expect, it } from 'vitest';
import {
  findPermissionOverwritePersistenceMismatches,
  formatPermissionOverwriteSaveWarnings,
} from '@/features/channel-settings/domain/permissionOverwriteSaveFeedback';
import type { PermissionOverwriteRowDraft } from '@/features/channel-settings/types';

describe('permissionOverwriteSaveFeedback', () => {
  it('formats stripped allow warnings', () => {
    const msg = formatPermissionOverwriteSaveWarnings(
      { strippedAllows: ['EMBED_LINKS', 'MANAGE_WEBHOOKS'] },
      [{ key: 'embedLinks', label: 'Embed links', group: 'Text channel' }],
    );
    expect(msg).toContain('Embed links');
    expect(msg).toContain('Deny and Inherit');
  });

  it('detects denies that did not persist', () => {
    const sent: PermissionOverwriteRowDraft[] = [
      {
        targetType: 'everyone',
        partial: { embedLinks: false, sendMessages: false },
      },
    ];
    const fetched: PermissionOverwriteRowDraft[] = [
      { targetType: 'everyone', partial: { sendMessages: false } },
    ];
    const mismatches = findPermissionOverwritePersistenceMismatches(
      sent,
      fetched,
      [{ key: 'embedLinks', label: 'Embed links', group: 'Text channel' }],
    );
    expect(mismatches).toContain('Embed links');
  });
});
