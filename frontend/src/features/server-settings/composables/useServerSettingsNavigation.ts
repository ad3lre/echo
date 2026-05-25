import { type Ref } from 'vue';
import type { ServerSettingsSection } from '../types';
import { icons } from '@/assets/icons';

export function useServerSettingsNavigation() {
  function getSectionIcon(section: ServerSettingsSection) {
    switch (section) {
      case 'Overview':
        return icons.settings;
      case 'Events':
        return icons.bellSchool;
      case 'Structure':
        return icons.sliders;
      case 'Members':
        return icons.communityFilled;
      case 'Roles':
        return icons.crown;
      case 'Emoji':
        return icons.emotesServerNav;
      case 'Discord':
        return icons.discordMark;
      case 'Security':
        return icons.settings;
      case 'Access':
        return icons.chatLock;
      case 'Banned Words':
        return icons.shield;
      case 'Moderation':
        return icons.shield;
      case 'Audit Log':
        return icons.list;
      case 'Bans':
        return icons.banUser;
      case 'Danger Zone':
        return icons.trash;
      default:
        return icons.more;
    }
  }

  return {
    getSectionIcon,
  };
}

export function useServerSettingsRolePreview(
  selectedRole: Ref<{
    id: string;
    name: string;
    color: string;
    permissions?: Record<string, boolean>;
  } | null>,
  serverId: Ref<string | undefined>,
  emit: (event: 'preview-role', payload: any) => void,
  close: () => void,
) {
  function previewSelectedRole() {
    const role = selectedRole.value;
    const sid = serverId.value;
    if (!role || !sid) return;
    const uiPermissions = Object.entries(role.permissions ?? {})
      .filter(([, enabled]) => enabled === true)
      .map(([key]) => key);
    emit('preview-role', {
      serverId: sid,
      roleId: role.id,
      roleName: role.name,
      roleColor: role.color,
      uiPermissions,
    });
    close();
  }

  return {
    previewSelectedRole,
  };
}
