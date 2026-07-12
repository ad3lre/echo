type AppLayoutModule =
  typeof import('@/features/layout/components/AppLayout.vue');

let appLayoutImportPromise: Promise<AppLayoutModule> | null = null;

/**
 * Start (or reuse) the AppLayout dynamic import. Called from `main.ts` during
 * bootstrap so chunk download + parse overlaps with i18n / auth hydration instead
 * of waiting until `App.vue` first renders.
 */
export function prefetchAppLayoutChunk(): Promise<AppLayoutModule> {
  if (!appLayoutImportPromise) {
    if (import.meta.env.VITE_ECHO_DESKTOP === '1') {
      void import('@/platform/desktopBootDiagnostics').then(
        ({ logDesktopBootDiag }) => {
          logDesktopBootDiag('prefetchAppLayoutChunk:start');
        },
      );
    }
    appLayoutImportPromise =
      import('@/features/layout/components/AppLayout.vue').then((mod) => {
        if (import.meta.env.VITE_ECHO_DESKTOP === '1') {
          void import('@/platform/desktopBootDiagnostics').then(
            ({ logDesktopBootDiag }) => {
              logDesktopBootDiag('prefetchAppLayoutChunk:resolved');
            },
          );
        }
        return mod;
      });
  }
  return appLayoutImportPromise;
}
