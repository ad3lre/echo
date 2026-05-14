import { computed, type ComputedRef, type Ref } from 'vue';
import type { RolePreviewState } from '@/features/server-settings/composables/useRolePreview';

/** Normalizes guild `rolePreview` ref into the `ComputedRef` shape expected by channel tree + moderation. */
export function useEchoRolePreviewStateComputed(
  rolePreview: Ref<unknown>,
): ComputedRef<RolePreviewState | null> {
  return computed(() => (rolePreview.value ?? null) as RolePreviewState | null);
}
