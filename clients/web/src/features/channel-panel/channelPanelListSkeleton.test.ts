import { describe, expect, it } from 'vitest';
import {
  CHANNEL_PANEL_SKELETON_SECTIONS,
  buildChannelPanelSkeletonSectionsFromCategories,
} from './channelPanelListSkeleton';

describe('buildChannelPanelSkeletonSectionsFromCategories', () => {
  it('falls back to static sections when categories are empty', () => {
    expect(buildChannelPanelSkeletonSectionsFromCategories([])).toEqual(
      CHANNEL_PANEL_SKELETON_SECTIONS,
    );
  });

  it('derives section and row counts from cached categories', () => {
    const sections = buildChannelPanelSkeletonSectionsFromCategories([
      {
        id: 'cat1',
        name: 'General',
        channels: [{ name: 'announcements' }, { name: 'chat' }],
      },
      {
        id: 'cat2',
        name: 'Voice',
        channels: [{ name: 'Lobby' }],
      },
    ]);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.rowWidths).toHaveLength(2);
    expect(sections[1]?.rowWidths).toHaveLength(1);
  });
});
