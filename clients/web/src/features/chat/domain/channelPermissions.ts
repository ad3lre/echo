import type {
  ChannelPermissionKey,
  ChannelPermissionsState,
} from '@shared/types';

export function resolveEffectiveChannelPermission(input: {
  baseAllowed: boolean;
  categoryDefaults?: Partial<Record<ChannelPermissionKey, boolean>> | null;
  channelPermissions?: ChannelPermissionsState | null;
  key: ChannelPermissionKey;
}): boolean {
  let allowed = input.baseAllowed;
  const categoryValue = input.categoryDefaults?.[input.key];
  if (categoryValue === true || categoryValue === false)
    allowed = categoryValue;
  const channelValue = input.channelPermissions?.syncWithCategory
    ? undefined
    : input.channelPermissions?.overrides?.[input.key];
  if (channelValue === true || channelValue === false) allowed = channelValue;
  return allowed;
}
