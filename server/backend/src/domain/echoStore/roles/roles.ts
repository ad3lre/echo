/** Compatibility facade for the former roles.ts monolith. Prefer importing from the leaf modules. */

export {
  elevatedPermissionsBlockDefaultOnJoin,
  actorMayGrantPermissionSet,
} from './roleGrantGuards';

export type {
  EchoRoleDto,
  ListEchoRolesForServerOptions,
  UpdateEchoRoleResult,
  EchoMemberRoleMutationResult,
  EchoMemberRoleMutationResultLegacy,
  DeleteEchoRoleResult,
  DeleteEchoRoleResultLegacy,
} from './echoRoleDto';

export {
  reconcileMembersRoleHierarchyPosition,
  reconcileEveryoneRoleHierarchyPosition,
  migrateMembersRoleHierarchyPositions,
  migrateEveryoneRoleHierarchyPositions,
} from './roleHierarchy';

export { listEchoRolesForServer } from './listEchoRolesForServer';

export {
  replaceEchoServerRoleOrder,
  replaceEchoRoleOrderInCategory,
} from './roleOrderMutations';

export { updateEchoRole, updateEchoRolePermissions } from './updateEchoRole';

export {
  listEchoMemberRoleAssignmentsByUser,
  listEchoSelfRoleIdsByServer,
  echoAuthorityRoleIdsForServer,
  withoutEchoAuthorityAssignments,
} from './memberRoleAssignments';

export {
  assignEchoMemberRole,
  removeEchoMemberRole,
} from './memberRoleMutations';

export { createEchoRole } from './createEchoRole';

export { deleteEchoRole } from './deleteEchoRole';
