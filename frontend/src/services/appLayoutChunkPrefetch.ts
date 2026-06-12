type AppLayoutModule = typeof import('@/components/AppLayout.vue');

let appLayoutImportPromise: Promise<AppLayoutModule> | null = null;

/**
 * Start (or reuse) the AppLayout dynamic import. Called from `main.ts` during
 * bootstrap so chunk download + parse overlaps with i18n / auth hydration instead
 * of waiting until `App.vue` first renders.
 */
export function prefetchAppLayoutChunk(): Promise<AppLayoutModule> {
  if (!appLayoutImportPromise) {
    appLayoutImportPromise = import('@/components/AppLayout.vue');
  }
  return appLayoutImportPromise;
}
