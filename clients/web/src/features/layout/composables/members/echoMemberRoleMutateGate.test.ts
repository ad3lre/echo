import { describe, expect, it } from 'vitest';
import { canMutateEchoMemberRole } from './echoMemberRoleMutateGate';

const cat = [
  {
    id: 'everyone',
    position: 0,
    isEveryone: true,
    roleScope: 'global',
    permissions: ['VIEW_CHANNEL'],
  },
  {
    id: 'low',
    position: 1,
    rankInCategory: 1,
    roleScope: 'global',
    permissions: ['SEND_MESSAGES'],
  },
  {
    id: 'high',
    position: 5,
    rankInCategory: 5,
    roleScope: 'global',
    permissions: ['MANAGE_ROLES', 'ADMINISTRATOR', 'ASSIGN_ROLES'],
  },
];

describe('canMutateEchoMemberRole', () => {
  it('owner can assign any non-everyone role', () => {
    expect(
      canMutateEchoMemberRole({
        assign: true,
        actorUserId: 'a',
        targetUserId: 't',
        roleId: 'high',
        actorIsServerOwner: true,
        targetIsServerOwner: false,
        catalog: cat,
        assignments: { a: ['low'], t: ['everyone'] },
      }),
    ).toBe(true);
  });

  it('non-owner cannot assign to server owner', () => {
    expect(
      canMutateEchoMemberRole({
        assign: true,
        actorUserId: 'mod',
        targetUserId: 'owner',
        roleId: 'low',
        actorIsServerOwner: false,
        targetIsServerOwner: true,
        catalog: cat,
        assignments: { mod: ['high'], owner: ['everyone'] },
      }),
    ).toBe(false);
  });

  it('non-owner cannot assign role above own top', () => {
    expect(
      canMutateEchoMemberRole({
        assign: true,
        actorUserId: 'mod',
        targetUserId: 'u',
        roleId: 'high',
        actorIsServerOwner: false,
        targetIsServerOwner: false,
        catalog: cat,
        assignments: { mod: ['low'], u: ['everyone'] },
      }),
    ).toBe(false);
  });

  it('non-owner can assign lower role to lower-ranked member', () => {
    expect(
      canMutateEchoMemberRole({
        assign: true,
        actorUserId: 'mod',
        targetUserId: 'u',
        roleId: 'low',
        actorIsServerOwner: false,
        targetIsServerOwner: false,
        catalog: cat,
        assignments: { mod: ['high'], u: ['everyone'] },
      }),
    ).toBe(true);
  });

  it('non-owner cannot assign to equal-or-higher-ranked member', () => {
    expect(
      canMutateEchoMemberRole({
        assign: true,
        actorUserId: 'mod',
        targetUserId: 'peer',
        roleId: 'low',
        actorIsServerOwner: false,
        targetIsServerOwner: false,
        catalog: cat,
        assignments: { mod: ['high'], peer: ['high'] },
      }),
    ).toBe(false);
  });

  it('self-assign requires permission subset when not owner', () => {
    expect(
      canMutateEchoMemberRole({
        assign: true,
        actorUserId: 'u',
        targetUserId: 'u',
        roleId: 'high',
        actorIsServerOwner: false,
        targetIsServerOwner: false,
        catalog: cat,
        assignments: { u: ['low'] },
      }),
    ).toBe(false);

    expect(
      canMutateEchoMemberRole({
        assign: true,
        actorUserId: 'u',
        targetUserId: 'u',
        roleId: 'low',
        actorIsServerOwner: false,
        targetIsServerOwner: false,
        catalog: cat,
        assignments: { u: ['high'] },
      }),
    ).toBe(true);
  });
});
