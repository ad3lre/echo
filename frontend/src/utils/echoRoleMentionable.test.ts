import { describe, expect, it } from 'vitest';
import type { EchoServerRoleDto } from '@/api/echo/types';
import {
  echoRoleMentionLabel,
  isEchoRoleMentionable,
} from './echoRoleMentionable';

function role(
  partial: Partial<EchoServerRoleDto> & Pick<EchoServerRoleDto, 'id' | 'name'>,
): EchoServerRoleDto {
  return {
    color: '#ff0000',
    darkColor: '#ff0000',
    lightColor: '#ff0000',
    separateThemeColors: false,
    position: 0,
    hoist: false,
    defaultOnJoin: false,
    isMembers: false,
    isEveryone: false,
    permissions: [],
    ...partial,
  };
}

describe('isEchoRoleMentionable', () => {
  it('includes custom roles with MENTION_EVERYONE', () => {
    expect(
      isEchoRoleMentionable(
        role({
          id: 'r1',
          name: 'Moderators',
          permissions: ['MENTION_EVERYONE'],
        }),
      ),
    ).toBe(true);
  });

  it('excludes @members and authority roles', () => {
    expect(
      isEchoRoleMentionable(
        role({
          id: 'm',
          name: '@members',
          isMembers: true,
          permissions: ['MENTION_EVERYONE'],
        }),
      ),
    ).toBe(false);
    expect(
      isEchoRoleMentionable(
        role({
          id: 'g',
          name: '@global',
          roleType: 'authority',
          permissions: ['MENTION_EVERYONE'],
        }),
      ),
    ).toBe(false);
  });
});

describe('echoRoleMentionLabel', () => {
  it('strips a leading @ for display', () => {
    expect(echoRoleMentionLabel('@VIP')).toBe('VIP');
    expect(echoRoleMentionLabel('Moderators')).toBe('Moderators');
  });
});
