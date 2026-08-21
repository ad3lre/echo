import { describe, expect, it } from 'vitest';
import { mapGroupDmsToPanelList } from './mapGroupDmsToPanelList';

describe('mapGroupDmsToPanelList', () => {
  it('normalizes pfp default', () => {
    expect(
      mapGroupDmsToPanelList({
        a: { id: 'a', name: 'A' },
        b: { id: 'b', name: 'B', pfp: 'x' },
      }),
    ).toEqual([
      { id: 'a', name: 'A', pfp: '' },
      { id: 'b', name: 'B', pfp: 'x' },
    ]);
  });
});
