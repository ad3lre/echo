import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useAppLayoutMainSurfaceDmFlags } from './useAppLayoutMainSurfaceDmFlags';

describe('useAppLayoutMainSurfaceDmFlags', () => {
  it('detects dm thread / idle main surface', () => {
    const { isInDmThreadOrIdleMainSurface } = useAppLayoutMainSurfaceDmFlags({
      mainSurface: ref({ type: 'dmThread', threadId: 'dm-x' }),
      activeRailTab: ref('dm'),
      activeGroupDM: ref(null),
    });
    expect(isInDmThreadOrIdleMainSurface.value).toBe(true);
  });

  it('isInDMMode follows rail', () => {
    const { isInDMMode } = useAppLayoutMainSurfaceDmFlags({
      mainSurface: ref({ type: 'explore' }),
      activeRailTab: ref('servers'),
      activeGroupDM: ref(null),
    });
    expect(isInDMMode.value).toBe(false);
  });

  it('isGroupDM is truthy when active group ref set', () => {
    const { isGroupDM } = useAppLayoutMainSurfaceDmFlags({
      mainSurface: ref({ type: 'dmMessagesIdle' }),
      activeRailTab: ref('dm'),
      activeGroupDM: ref({ id: 'g1' }),
    });
    expect(isGroupDM.value).toBe(true);
  });
});
