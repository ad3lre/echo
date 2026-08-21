import type { ManagedRole } from '@/features/server-settings/types';
import {
  isPinnedBottomEchoRole,
  pinnedBottomEchoRoleSortKey,
} from '@shared/echoReservedRoles';

export function pinPinnedBottomEchoRoles(roles: ManagedRole[]): ManagedRole[] {
  const pinned = roles.filter(isPinnedBottomEchoRole);
  if (!pinned.length) return roles;
  const movable = roles.filter((role) => !isPinnedBottomEchoRole(role));
  const tail = [...pinned].sort(
    (a, b) =>
      pinnedBottomEchoRoleSortKey(a.name) - pinnedBottomEchoRoleSortKey(b.name),
  );
  const next = [...movable, ...tail];
  if (next.length !== roles.length) return roles;
  return next.every((role, index) => role.id === roles[index]?.id)
    ? roles
    : next;
}

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
  const role = roles.find((row) => row.id === roleId);
  if (!role || isPinnedBottomEchoRole(role)) return roles;

  const movable = roles.filter((row) => !isPinnedBottomEchoRole(row));
  const currentIndex = movable.findIndex((row) => row.id === roleId);
  if (currentIndex < 0) return roles;
  const clamped = Math.max(1, Math.min(movable.length, targetPosition));
  const nextIndex = clamped - 1;
  if (currentIndex === nextIndex) return roles;

  const nextMovable = [...movable];
  const [moved] = nextMovable.splice(currentIndex, 1);
  if (!moved) return roles;
  nextMovable.splice(nextIndex, 0, moved);
  return pinPinnedBottomEchoRoles([
    ...nextMovable,
    ...roles.filter(isPinnedBottomEchoRole),
  ]);
}

export function moveRoleToIndex(
  roles: ManagedRole[],
  roleId: string,
  targetIndex: number,
): ManagedRole[] {
  const role = roles.find((row) => row.id === roleId);
  if (!role || isPinnedBottomEchoRole(role)) return roles;

  const movable = roles.filter((row) => !isPinnedBottomEchoRole(row));
  const sourceIndex = movable.findIndex((row) => row.id === roleId);
  if (sourceIndex < 0) return roles;
  const boundedTarget = Math.max(0, Math.min(movable.length - 1, targetIndex));
  if (sourceIndex === boundedTarget) return roles;

  const nextMovable = [...movable];
  const [moved] = nextMovable.splice(sourceIndex, 1);
  if (!moved) return roles;
  const insertIndex =
    sourceIndex < boundedTarget ? boundedTarget - 1 : boundedTarget;
  nextMovable.splice(insertIndex, 0, moved);
  return pinPinnedBottomEchoRoles([
    ...nextMovable,
    ...roles.filter(isPinnedBottomEchoRole),
  ]);
}
