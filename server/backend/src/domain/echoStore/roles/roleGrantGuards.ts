/** Permissions that must not be category defaults with `defaultOnJoin` unless the actor owns the server. */
const ECHO_AUTO_JOIN_FORBIDDEN_PERMISSIONS = new Set([
  'ADMINISTRATOR',
  'MANAGE_GUILD',
  'MANAGE_ROLES',
]);

export function elevatedPermissionsBlockDefaultOnJoin(
  permissions: readonly string[],
): boolean {
  return permissions.some((p) => ECHO_AUTO_JOIN_FORBIDDEN_PERMISSIONS.has(p));
}

/** Non-owners may only write permission bits they already hold (`ADMINISTRATOR` ⇒ full set in `actorPerms`). */
export function actorMayGrantPermissionSet(
  actorPerms: ReadonlySet<string>,
  granted: ReadonlySet<string>,
  actorIsOwner: boolean,
): boolean {
  if (actorIsOwner) return true;
  if (actorPerms.has('ADMINISTRATOR')) return true;
  for (const p of granted) {
    if (!actorPerms.has(p)) return false;
  }
  return true;
}
