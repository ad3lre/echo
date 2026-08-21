import { describe, expect, it } from 'vitest';
import { buildServerNotificationLevelsMap } from './buildServerNotificationLevelsMap';

describe('buildServerNotificationLevelsMap', () => {
  it('fills map from servers and getter', () => {
    const m = buildServerNotificationLevelsMap(
      [{ id: 'a' }, { id: 'b' }],
      (id) => (id === 'a' ? 'all' : 'mentions'),
    );
    expect(m).toEqual({ a: 'all', b: 'mentions' });
  });
});
