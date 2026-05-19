import type { ManagedRole } from '@/features/server-settings/types';

export function rolePosition(
  roles: ManagedRole[],
  roleId: string,
): number | null {
  const index = roles.findIndex((role) => role.id === roleId);
  return index >= 0 ? index + 1 : null;
}

export function setRolePosition(
  roles: ManagedRole[],
  roleId: string,
  targetPosition: number,
): ManagedRole[] {
  const currentIndex = roles.findIndex((role) => role.id === roleId);
  if (currentIndex < 0) return roles;
  const clamped = Math.max(1, Math.min(roles.length, targetPosition));
  const nextIndex = clamped - 1;
  if (currentIndex === nextIndex) return roles;

  const next = [...roles];
  const [moved] = next.splice(currentIndex, 1);
  if (!moved) return roles;
  next.splice(nextIndex, 0, moved);
  return next;
}

export function moveRoleToIndex(
  roles: ManagedRole[],
  roleId: string,
  targetIndex: number,
): ManagedRole[] {
  const sourceIndex = roles.findIndex((role) => role.id === roleId);
  if (sourceIndex < 0) return roles;
  const boundedTarget = Math.max(0, Math.min(roles.length - 1, targetIndex));
  if (sourceIndex === boundedTarget) return roles;

  const next = [...roles];
  const [moved] = next.splice(sourceIndex, 1);
  if (!moved) return roles;
  const insertIndex =
    sourceIndex < boundedTarget ? boundedTarget - 1 : boundedTarget;
  next.splice(insertIndex, 0, moved);
  return next;
}
