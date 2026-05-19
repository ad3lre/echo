import { watch, type Ref } from 'vue';

/** Keep shell nav debug log in sync with the live DM call peer ref from voice bridge. */
export function useDmCallWithUserIdShellLogMirror(
  dmCallWithUserId: Ref<string | null>,
  dmCallWithUserIdForShellLog: Ref<string | null>,
) {
  watch(
    dmCallWithUserId,
    (v) => {
      dmCallWithUserIdForShellLog.value = v;
    },
    { immediate: true },
  );
}
