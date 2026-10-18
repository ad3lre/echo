import type pg from 'pg';
import type { UpdateEchoRoleResult } from './echoRoleDto';
import type { EchoRoleUpdatePatch } from './echoRoleUpdateTypes';
import { applyEchoRoleUpdateSql } from './applyEchoRoleUpdateSql';
import {
  authorizeAndLoadEchoRoleForUpdate,
  prepareEchoRoleUpdatePatch,
} from './prepareEchoRoleUpdate';

export type { EchoRoleUpdatePatch } from './echoRoleUpdateTypes';

export async function updateEchoRole(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  roleId: string,
  patch: EchoRoleUpdatePatch,
  mutationClient?: pg.PoolClient,
): Promise<UpdateEchoRoleResult> {
  const queryable = mutationClient ?? pool;
  const loaded = await authorizeAndLoadEchoRoleForUpdate(
    queryable,
    serverId,
    actorId,
    roleId,
    patch,
  );
  if (typeof loaded === 'string') return loaded;

  const prepared = await prepareEchoRoleUpdatePatch(
    queryable,
    serverId,
    patch,
    loaded,
  );
  if (typeof prepared === 'string') return prepared;

  return applyEchoRoleUpdateSql(
    queryable,
    serverId,
    roleId,
    patch,
    prepared,
    mutationClient,
  );
}

export async function updateEchoRolePermissions(
  pool: pg.Pool,
  serverId: string,
  actorId: string,
  roleId: string,
  permissions: unknown,
): Promise<UpdateEchoRoleResult> {
  return updateEchoRole(pool, serverId, actorId, roleId, { permissions });
}
