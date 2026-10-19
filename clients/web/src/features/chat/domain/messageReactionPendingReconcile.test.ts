import { describe, expect, it } from 'vitest';
import {
  applyPendingReactionIntent,
  reactionSnapshotSatisfiesPendingIntent,
  reconcilePendingReactionTogglesOnSnapshot,
} from './messageReactionPendingReconcile';

describe('reactionSnapshotSatisfiesPendingIntent', () => {
  it('accepts add when viewer is listed', () => {
    expect(
      reactionSnapshotSatisfiesPendingIntent(
        [{ emoji: '👍', count: 1, userIds: ['me'] }],
        {
          emoji: '👍',
          userId: 'me',
          removing: false,
          previousReactions: undefined,
        },
      ),
    ).toBe(true);
  });

  it('rejects add when emoji missing', () => {
    expect(
      reactionSnapshotSatisfiesPendingIntent([], {
        emoji: '👍',
        userId: 'me',
        removing: false,
        previousReactions: undefined,
      }),
    ).toBe(false);
  });

  it('accepts remove when count dropped on fan-out', () => {
    expect(
      reactionSnapshotSatisfiesPendingIntent(
        [{ emoji: '👍', count: 1, userIds: [] }],
        {
          emoji: '👍',
          userId: 'me',
          removing: true,
          previousReactions: [
            { emoji: '👍', count: 2, userIds: ['me', 'other'] },
          ],
        },
      ),
    ).toBe(true);
  });
});

describe('applyPendingReactionIntent', () => {
  it('re-adds viewer after a stale empty snapshot', () => {
    expect(
      applyPendingReactionIntent([], {
        emoji: '👍',
        userId: 'me',
        removing: false,
        previousReactions: undefined,
      }),
    ).toEqual([
      expect.objectContaining({
        emoji: '👍',
        count: 1,
        userIds: ['me'],
      }),
    ]);
  });

  it('restores viewer highlight on count-only fan-out', () => {
    expect(
      applyPendingReactionIntent([{ emoji: '👍', count: 2, userIds: [] }], {
        emoji: '👍',
        userId: 'me',
        removing: false,
        previousReactions: undefined,
      }),
    ).toEqual([{ emoji: '👍', count: 2, userIds: ['me'] }]);
  });

  it('removes viewer without flipping others', () => {
    expect(
      applyPendingReactionIntent(
        [{ emoji: '👍', count: 2, userIds: ['me', 'other'] }],
        {
          emoji: '👍',
          userId: 'me',
          removing: true,
          previousReactions: undefined,
        },
      ),
    ).toEqual([{ emoji: '👍', count: 1, userIds: ['other'] }]);
  });
});

describe('reconcilePendingReactionTogglesOnSnapshot', () => {
  it('re-asserts unsatisfied add and reports not allSatisfied', () => {
    const out = reconcilePendingReactionTogglesOnSnapshot(
      [],
      [
        {
          emoji: '👍',
          userId: 'me',
          removing: false,
          previousReactions: undefined,
        },
      ],
    );
    expect(out.allSatisfied).toBe(false);
    expect(out.reactions).toEqual([
      expect.objectContaining({ emoji: '👍', userIds: ['me'] }),
    ]);
  });

  it('commits when snapshot already matches', () => {
    const out = reconcilePendingReactionTogglesOnSnapshot(
      [{ emoji: '👍', count: 1, userIds: ['me'] }],
      [
        {
          emoji: '👍',
          userId: 'me',
          removing: false,
          previousReactions: undefined,
        },
      ],
    );
    expect(out.allSatisfied).toBe(true);
    expect(out.reactions).toEqual([{ emoji: '👍', count: 1, userIds: ['me'] }]);
  });
});
