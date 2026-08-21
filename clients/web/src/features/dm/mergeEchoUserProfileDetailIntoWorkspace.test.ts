import { describe, expect, it } from 'vitest';
import {
  mergeEchoUserProfileDetailIntoWorkspaceUsers,
  workspaceUserHasProfileDetail,
} from './mergeEchoUserProfileDetailIntoWorkspace';
import type { WorkspaceRosterUserRow } from '@/features/layout/echoWorkspace/workspaceRoster';

describe('mergeEchoUserProfileDetailIntoWorkspaceUsers', () => {
  const rosterUser: WorkspaceRosterUserRow = {
    id: 'u1',
    name: 'Alice',
    pfp: 'https://cdn/a.webp',
    status: 'online',
  };

  it('detects missing profile detail on roster rows', () => {
    expect(workspaceUserHasProfileDetail(rosterUser)).toBe(false);
    expect(
      workspaceUserHasProfileDetail({
        ...rosterUser,
        bio: 'Hello',
      }),
    ).toBe(true);
    expect(
      workspaceUserHasProfileDetail({
        ...rosterUser,
        bannerColor: '#112233',
      }),
    ).toBe(true);
  });

  it('merges bio and banner fields into users', () => {
    const merged = mergeEchoUserProfileDetailIntoWorkspaceUsers([rosterUser], {
      id: 'u1',
      name: 'Alice',
      pfp: 'https://cdn/a.webp',
      bio: 'About Alice',
      bannerImage: 'https://cdn/banner.webp',
      bannerColor: 'linear-gradient(red,blue)',
      bannerRefractionEnabled: true,
      bannerBlurEnabled: false,
      bannerBlackoutEnabled: true,
      bannerPositionY: 42,
      timeZone: 'Europe/Berlin',
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.bio).toBe('About Alice');
    expect(merged[0]?.bannerImage).toBe('https://cdn/banner.webp');
    expect(merged[0]?.bannerColor).toBe('linear-gradient(red,blue)');
    expect(merged[0]?.bannerRefractionEnabled).toBe(true);
    expect(
      (merged[0] as { bannerPositionY?: number } | undefined)?.bannerPositionY,
    ).toBe(42);
    expect(merged[0]?.timeZone).toBe('Europe/Berlin');
  });
});
