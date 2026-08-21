import { ref } from 'vue';
import { useAppLayoutLayoutChrome } from '@/features/layout/composables/shell/useAppLayoutLayoutChrome';
import { useAppLayoutNavigation } from '@/features/layout/composables/shell/useAppLayoutNavigation';

/**
 * Composed UI root state: navigation selection + local chrome refs.
 * The controller should consume this state, not create the refs inline.
 */
export function useAppLayoutUiState() {
  const pfpBarExpanded = ref(false);
  const isSystemSettingsOpen = ref(false);
  const navigation = useAppLayoutNavigation();
  const layoutChrome = useAppLayoutLayoutChrome(pfpBarExpanded);
  return {
    pfpBarExpanded,
    isSystemSettingsOpen,
    ...navigation,
    ...layoutChrome,
  };
}
