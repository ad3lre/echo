import type { CodenamesRoleAssignment, CodenamesSnapshot } from './types';

export const CODENAMES_MIN_PLAYERS = 4;

export function normalizedRosterIds(rosterSorted: readonly string[]): string[] {
  return [...new Set(rosterSorted.map((x) => x.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );
}

export function codenamesOrchestratorUserId(
  rosterSorted: readonly string[],
): string | null {
  return normalizedRosterIds(rosterSorted)[0] ?? null;
}

export function isCodenamesSoloRoster(
  rosterSorted: readonly string[],
): boolean {
  return normalizedRosterIds(rosterSorted).length === 1;
}

export function codenamesMinPlayersToStart(): number {
  return 1;
}

export function buildSoloCodenamesRoles(
  userId: string,
): CodenamesRoleAssignment[] {
  const uid = userId.trim();
  if (!uid) return [];
  return [{ userId: uid, team: 'red', role: 'spymaster' }];
}

export function canClueAsSpymaster(
  prev: CodenamesSnapshot,
  spymasterUserId: string,
): boolean {
  const uid = spymasterUserId.trim();
  const role = prev.roleAssignments.find((r) => r.userId === uid);
  if (!role || role.role !== 'spymaster') return false;
  if (isCodenamesSoloRoster(prev.rosterUserIds)) return true;
  return role.team === prev.currentTeam;
}

export function canGuessAsOperative(
  prev: CodenamesSnapshot,
  operativeUserId: string,
): boolean {
  const uid = operativeUserId.trim();
  const role = prev.roleAssignments.find((r) => r.userId === uid);
  if (!role) return false;
  if (isCodenamesSoloRoster(prev.rosterUserIds)) return true;
  if (role.role !== 'operative') return false;
  return role.team === prev.currentTeam;
}

export function validateRoleSetup(
  rosterSorted: readonly string[],
  roles: readonly CodenamesRoleAssignment[],
): CodenamesRoleAssignment[] | null {
  const rosterList = normalizedRosterIds(rosterSorted);
  const roster = new Set(rosterList);
  if (roster.size < codenamesMinPlayersToStart()) return null;
  if (isCodenamesSoloRoster(rosterList)) {
    if (roster.size !== 1) return null;
    const uid = rosterList[0]!;
    if (roles.length !== 1) return null;
    const r = roles[0]!;
    if (r.userId.trim() !== uid) return null;
    if (r.role !== 'spymaster') return null;
    if (r.team !== 'red' && r.team !== 'blue') return null;
    return [{ userId: uid, team: r.team, role: 'spymaster' }];
  }
  if (roster.size < CODENAMES_MIN_PLAYERS) return null;
  const seen = new Set<string>();
  let redSm = 0;
  let blueSm = 0;
  const out: CodenamesRoleAssignment[] = [];
  for (const r of roles) {
    const uid = r.userId.trim();
    if (!uid || !roster.has(uid)) return null;
    if (seen.has(uid)) return null;
    seen.add(uid);
    if (r.team !== 'red' && r.team !== 'blue') return null;
    if (r.role !== 'spymaster' && r.role !== 'operative') return null;
    if (r.role === 'spymaster') {
      if (r.team === 'red') redSm++;
      else blueSm++;
    }
    out.push({ userId: uid, team: r.team, role: r.role });
  }
  if (seen.size !== roster.size) return null;
  if (redSm !== 1 || blueSm !== 1) return null;
  const redOps = out.filter(
    (x) => x.team === 'red' && x.role === 'operative',
  ).length;
  const blueOps = out.filter(
    (x) => x.team === 'blue' && x.role === 'operative',
  ).length;
  if (redOps < 1 || blueOps < 1) return null;
  return out.sort((a, b) => a.userId.localeCompare(b.userId));
}

export function viewerRoleFor(
  snapshot: CodenamesSnapshot,
  userId: string,
): CodenamesRoleAssignment | null {
  const uid = userId.trim();
  return snapshot.roleAssignments.find((r) => r.userId === uid) ?? null;
}

export function viewerIsSpymaster(
  snapshot: CodenamesSnapshot,
  userId: string,
): boolean {
  return viewerRoleFor(snapshot, userId)?.role === 'spymaster';
}
