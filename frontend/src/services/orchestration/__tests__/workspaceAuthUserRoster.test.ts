import { describe, expect, it } from 'vitest';
import {
  mergeAuthUserIntoWorkspaceRoster,
  type WorkspaceRosterUserRow,
} from '@/services/domain/workspaceAuthUserRoster';

describe('mergeAuthUserIntoWorkspaceRoster', () => {
  it('returns null without auth user', () => {
    const users: WorkspaceRosterUserRow[] = [
      { id: '1', name: 'A', pfp: '', status: 'online' },
    ];
    expect(mergeAuthUserIntoWorkspaceRoster(users, null)).toBeNull();
    expect(mergeAuthUserIntoWorkspaceRoster(users, undefined)).toBeNull();
  });

  it('prepends new user row', () => {
    const users: WorkspaceRosterUserRow[] = [
      { id: '1', name: 'A', pfp: '', status: 'online' },
    ];
    const out = mergeAuthUserIntoWorkspaceRoster(users, {
      id: '2',
      username: 'u',
      displayName: 'Me',
      pfp: 'x.png',
      status: 'idle',
    });
    expect(out).not.toBeNull();
    expect(out![0]!.id).toBe('2');
    expect(out![0]!.name).toBe('Me');
    expect(out!.length).toBe(2);
  });

  it('merges into existing row by id', () => {
    const users: WorkspaceRosterUserRow[] = [
      { id: '1', name: 'Old', pfp: '', status: 'offline', customStatus: 'hi' },
    ];
    const out = mergeAuthUserIntoWorkspaceRoster(users, {
      id: '1',
      username: 'u',
      displayName: 'New',
      pfp: 'p.png',
      status: 'online',
    });
    expect(out).not.toBeNull();
    expect(out!.length).toBe(1);
    expect(out![0]!.name).toBe('New');
    expect(out![0]!.pfp).toBe('p.png');
  });
});
