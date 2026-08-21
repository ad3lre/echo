import { useAppLayoutDmAndShellSession } from './useAppLayoutDmAndShellSession';
import { useAppLayoutDmAndShellRolesTree } from './useAppLayoutDmAndShellRolesTree';
import { useAppLayoutDmAndShellEchoDm } from './useAppLayoutDmAndShellEchoDm';
import { useAppLayoutDmAndShellNavVoice } from './useAppLayoutDmAndShellNavVoice';
import { buildWireAppLayoutDmAndShellResult } from './buildWireAppLayoutDmAndShellResult';

/**
 * Layout shell composition root: ordered wiring of region composables + slices.
 * Policy and merge rules live in feature public surfaces and named `useAppLayout*` /
 * `useEcho*` composables — not inline here.
 * Charter definition of “thin”: `docs/architecture/client-layer-violations.md` §1.
 */

export type WireAppLayoutDmAndShellResult = ReturnType<
  typeof wireAppLayoutDmAndShell
>;

export function wireAppLayoutDmAndShell() {
  const session = useAppLayoutDmAndShellSession();
  const roles = useAppLayoutDmAndShellRolesTree(session);
  const echoDm = useAppLayoutDmAndShellEchoDm(session, roles);
  const navVoice = useAppLayoutDmAndShellNavVoice(session, roles, echoDm);
  return buildWireAppLayoutDmAndShellResult({
    session,
    roles,
    echoDm,
    navVoice,
  });
}
