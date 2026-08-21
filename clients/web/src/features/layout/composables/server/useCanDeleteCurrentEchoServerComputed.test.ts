import { describe, expect, it } from 'vitest';
import { computed, ref } from 'vue';
import type { Server } from '@shared/types';
import { useCanDeleteCurrentEchoServerComputed } from './useCanDeleteCurrentEchoServerComputed';

const graphServer = (over: Partial<Server> = {}): Server =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    name: 'G',
    ownerId: 'u1',
    ...over,
  }) as Server;

describe('useCanDeleteCurrentEchoServerComputed', () => {
  it('tracks selected server and current user', () => {
    const selected = ref<Server | undefined>(undefined);
    const userId = ref<string | undefined>('u1');
    const c = useCanDeleteCurrentEchoServerComputed({
      selectedServer: computed(() => selected.value),
      currentUserId: userId,
    });
    expect(c.value).toBe(false);
    selected.value = graphServer();
    expect(c.value).toBe(true);
    userId.value = 'other';
    expect(c.value).toBe(false);
  });
});
