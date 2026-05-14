import { describe, expect, it } from 'vitest';
import {
  describeOrderedIdsStructuralChange,
  collectMessageListRowFactsPatchIndices,
  fingerprintMessageListRowFactsInputs,
} from './messageListRowFacts';

describe('describeOrderedIdsStructuralChange', () => {
  it('treats identical lists as same', () => {
    const a = ['1', '2', '3'];
    expect(describeOrderedIdsStructuralChange(a, ['1', '2', '3'])).toEqual({
      kind: 'same',
    });
  });

  it('detects single append', () => {
    const prev = ['a', 'b'];
    const next = ['a', 'b', 'c'];
    expect(describeOrderedIdsStructuralChange(prev, next)).toEqual({
      kind: 'append_one',
      patchIndices: [0, 1, 2],
    });
  });

  it('detects single prepend', () => {
    const prev = ['b', 'c'];
    const next = ['a', 'b', 'c'];
    expect(describeOrderedIdsStructuralChange(prev, next)).toEqual({
      kind: 'prepend_one',
      patchIndices: [0, 1, 2],
    });
  });

  it('uses full for reorder', () => {
    expect(describeOrderedIdsStructuralChange(['a', 'b'], ['b', 'a'])).toEqual({
      kind: 'full',
    });
  });
});

describe('collectMessageListRowFactsPatchIndices', () => {
  it('adds neighbors and reply dependents', () => {
    const orderedIds = ['m0', 'm1', 'm2', 'm3'];
    const messages = new Map([
      ['m1', { id: 'm1', replyTo: { messageId: 'm0' } } as any],
    ]);
    const entities = new Map<string, any>([
      ['m0', { id: 'm0' }],
      ['m1', { id: 'm1', replyTo: { messageId: 'm0' } }],
    ]);
    const patch = collectMessageListRowFactsPatchIndices(
      orderedIds,
      messages,
      entities,
      new Set(['m0']),
    );
    expect(patch.has(0)).toBe(true);
    expect(patch.has(1)).toBe(true);
    expect(patch.has(2)).toBe(true);
  });
});

describe('fingerprintMessageListRowFactsInputs', () => {
  it('changes when poll votes change on same message id', () => {
    const messageId = 'm1';
    const ordered = new Map([
      [
        messageId,
        {
          id: messageId,
          authorId: 'u1',
          timestamp: '2026-01-01T00:00:00.000Z',
          content: 'poll',
          author: { id: 'u1', name: 'User', avatar: '' },
          poll: {
            question: 'Q?',
            options: [
              { id: 'o1', text: 'A', votes: 0, voterIds: [] },
              { id: 'o2', text: 'B', votes: 1, voterIds: ['u2'] },
            ],
          },
        } as any,
      ],
    ]);
    const beforeEntities = new Map([
      [
        messageId,
        {
          id: messageId,
          authorId: 'u1',
          timestamp: '2026-01-01T00:00:00.000Z',
          content: 'poll',
          poll: {
            question: 'Q?',
            options: [
              { id: 'o1', text: 'A', votes: 0, voterIds: [] },
              { id: 'o2', text: 'B', votes: 1, voterIds: ['u2'] },
            ],
          },
        } as any,
      ],
    ]);
    const afterEntities = new Map([
      [
        messageId,
        {
          id: messageId,
          authorId: 'u1',
          timestamp: '2026-01-01T00:00:00.000Z',
          content: 'poll',
          poll: {
            question: 'Q?',
            options: [
              { id: 'o1', text: 'A', votes: 1, voterIds: ['u1'] },
              { id: 'o2', text: 'B', votes: 0, voterIds: [] },
            ],
          },
        } as any,
      ],
    ]);

    const before = fingerprintMessageListRowFactsInputs(
      messageId,
      ordered as any,
      beforeEntities as any,
    );
    const after = fingerprintMessageListRowFactsInputs(
      messageId,
      ordered as any,
      afterEntities as any,
    );

    expect(after).not.toBe(before);
  });
});
