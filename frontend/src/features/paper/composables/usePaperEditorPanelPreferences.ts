import { ref, watch } from 'vue';

const HIDE_FORMAT_BAR_KEY = 'echo.paper.hideFormatBarWhenEditorPinned';

function readHideFormatBar(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const v = localStorage.getItem(HIDE_FORMAT_BAR_KEY);
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

const hideFormatBarWhenEditorPinned = ref(readHideFormatBar());

watch(hideFormatBarWhenEditorPinned, (v) => {
  try {
    localStorage.setItem(HIDE_FORMAT_BAR_KEY, v ? '1' : '0');
  } catch {
    /* quota / private mode */
  }
});

export function usePaperEditorPanelPreferences() {
  return { hideFormatBarWhenEditorPinned };
}
