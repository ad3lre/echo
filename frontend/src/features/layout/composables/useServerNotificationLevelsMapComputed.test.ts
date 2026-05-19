import { describe, expect, it } from 'vitest';
import { useServerNotificationLevelsMapComputed } from './useServerNotificationLevelsMapComputed';

describe('useServerNotificationLevelsMapComputed', () => {
  it('builds per-server level map', () => {
    const c = useServerNotificationLevelsMapComputed({
      servers: () => [{ id: 's1' }, { id: 's2' }],
      getServerNotificationLevel: (id) => (id === 's1' ? 'all' : 'none'),
    });
    expect(c.value).toEqual({ s1: 'all', s2: 'none' });
  });
});
