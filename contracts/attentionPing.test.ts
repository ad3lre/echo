import { describe, expect, it } from 'vitest';
import {
  classifyAttentionPingKind,
  selfPingingMentionKinds,
} from './attentionPing';
import type { MentionEntity } from './types';

describe('user mention identity', () => {
  const viewer = { userId: 'me', displayName: 'Shared name' };
  it.each([{ id: '', userId: 'other' }, { id: 'other' }])(
    'ignores matching labels with another explicit ID',
    (identity) => {
      const mention: MentionEntity = {
        kind: 'user',
        label: 'Shared name',
        start: 0,
        end: 12,
        ...identity,
      };
      expect(classifyAttentionPingKind([mention], viewer)).toBeNull();
      expect(selfPingingMentionKinds([mention], viewer)).toEqual([]);
    },
  );
  it('retains label matching for legacy mentions without IDs', () => {
    const mention: MentionEntity = {
      id: '',
      kind: 'user',
      label: 'Shared name',
      start: 0,
      end: 12,
    };
    expect(classifyAttentionPingKind([mention], viewer)).toBe('personal');
    expect(selfPingingMentionKinds([mention], viewer)).toEqual(['user']);
  });
});
