import { computed } from 'vue';
import { SECTION_GROUPS } from '../types';
import type { ServerSettingsSection, SectionGroup } from '../types';

export function useServerSettingsVisibility(
  props: {
    canManageRoles?: boolean;
    canManageServer?: boolean;
    guildStructureEnabled?: boolean;
    /** Echo: server was created from / linked to a Discord guild import. */
    isDiscordImportedServer?: boolean;
    server: { ownerId?: string } | null;
    initialSection?: ServerSettingsSection | null;
  },
  authSession: { backendUser?: { id: string } | null },
) {
  const visibleSectionGroups = computed((): SectionGroup[] => {
    const cr = props.canManageRoles;
    const cs = props.canManageServer;
    const go = !!props.guildStructureEnabled;
    const discordTab = !!props.isDiscordImportedServer;
    const uid = authSession.backendUser?.id;
    const isOwner =
      !!props.server?.ownerId && !!uid && props.server.ownerId === uid;
    return SECTION_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        if (item === 'Roles') return cr;
        if (item === 'Danger Zone') return isOwner;
        if (item === 'Structure') return go;
        if (item === 'Discord') return discordTab && cs;
        return cs;
      }),
    })).filter((g) => g.items.length > 0);
  });

  const firstVisibleSection = computed((): ServerSettingsSection | null => {
    const g = visibleSectionGroups.value[0];
    return g?.items[0] ?? null;
  });

  function isValidServerSettingsSectionId(
    s: ServerSettingsSection | null | undefined,
  ): s is ServerSettingsSection {
    return (
      !!s &&
      SECTION_GROUPS.some((g) => (g.items as readonly string[]).includes(s))
    );
  }

  function resolveInitialServerSection(): ServerSettingsSection {
    const req = props.initialSection;
    const visible = visibleSectionGroups.value.flatMap((g) => g.items);
    if (req && isValidServerSettingsSectionId(req) && visible.includes(req))
      return req;
    return firstVisibleSection.value ?? 'Overview';
  }

  return {
    visibleSectionGroups,
    firstVisibleSection,
    isValidServerSettingsSectionId,
    resolveInitialServerSection,
  };
}
