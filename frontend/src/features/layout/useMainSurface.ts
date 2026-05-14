/**
 * Prefer this over reading rail / dm tab refs in feature components: keeps MainSurface the branching primitive.
 * Call `provideMainSurface` from AppLayout; throws in dev if missing.
 */

import { inject, provide, type ComputedRef, type InjectionKey } from 'vue';
import type { MainSurface } from './mainSurface';

export const mainSurfaceInjectionKey: InjectionKey<ComputedRef<MainSurface>> =
  Symbol('mainSurface');

export function provideMainSurface(surface: ComputedRef<MainSurface>): void {
  provide(mainSurfaceInjectionKey, surface);
}

export function useMainSurface(): ComputedRef<MainSurface> {
  const surface = inject(mainSurfaceInjectionKey, undefined);
  if (import.meta.env.DEV) {
    if (!surface) {
      throw new Error(
        'useMainSurface() requires provideMainSurface() from AppLayout (or a test harness). Do not branch on raw rail refs in shell UI.',
      );
    }
    return surface;
  }
  if (!surface) {
    throw new Error('useMainSurface: main surface not provided');
  }
  return surface;
}
