import { describe, expect, it } from 'vitest';
import { reconcileSelectedRoleIdForCategoryTab } from './roleManagerState';

describe('reconcileSelectedRoleIdForCategoryTab', () => {
  const roles = [{ id: 'r1' }, { id: 'r2' }];

  it('preserves selection on All tab', () => {
    expect(reconcileSelectedRoleIdForCategoryTab('all', 'r9', roles)).toBe(
      'r9',
    );
  });

  it('keeps selection when role is in the active category', () => {
    expect(reconcileSelectedRoleIdForCategoryTab('cat-a', 'r2', roles)).toBe(
      'r2',
    );
  });

  it('selects first role in category when current is outside the tab', () => {
    expect(reconcileSelectedRoleIdForCategoryTab('cat-a', 'r9', roles)).toBe(
      'r1',
    );
  });

  it('clears selection when category has no roles', () => {
    expect(reconcileSelectedRoleIdForCategoryTab('cat-a', 'r1', [])).toBe('');
  });
});
