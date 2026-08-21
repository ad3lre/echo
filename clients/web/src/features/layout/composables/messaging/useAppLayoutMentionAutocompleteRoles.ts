import { computed, type ComputedRef, type Ref } from 'vue';
import type { EchoServerRoleDto } from '@/api/echo/types';
import { isEchoGraphId } from '@/features/layout/ids/echoIds';
import {
  echoRoleMentionLabel,
  isEchoRoleMentionable,
  resolveEchoRoleDisplayColor,
} from '@/features/layout/composables/members/echoRoleMentionable';

export type MentionAutocompleteRole = {
  id: string;
  name: string;
  color: string;
};

const SERVER_MENTION_SURFACES = new Set([
  'serverText',
  'serverVoice',
  'serverForum',
  'serverEmptyOnboarding',
]);

/**
 * Mentionable guild roles for `@` autocomplete in server channels.
 * Empty in DMs and before role bootstrap completes for the active server.
 */
export function useAppLayoutMentionAutocompleteRoles(deps: {
  mainSurface: { readonly value: { type: string } };
  selectedServerId: Ref<string | null | undefined>;
  echoRoleCatalog: Ref<EchoServerRoleDto[]>;
  echoCapabilitiesForServerId: Ref<string | null>;
  lightTheme: Ref<boolean>;
}): ComputedRef<MentionAutocompleteRole[]> {
  const {
    mainSurface,
    selectedServerId,
    echoRoleCatalog,
    echoCapabilitiesForServerId,
    lightTheme,
  } = deps;

  return computed(() => {
    if (!SERVER_MENTION_SURFACES.has(mainSurface.value.type)) return [];

    const sid = selectedServerId.value?.trim() ?? '';
    if (!sid || sid === 'echo' || !isEchoGraphId(sid)) return [];
    if (echoCapabilitiesForServerId.value !== sid) return [];

    return echoRoleCatalog.value
      .filter(isEchoRoleMentionable)
      .map((role) => ({
        id: role.id,
        name: echoRoleMentionLabel(role.name),
        color: resolveEchoRoleDisplayColor(role, lightTheme.value),
      }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      );
  });
}
