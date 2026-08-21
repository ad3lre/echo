import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import type { EchoPlatform } from '@/platform/keys';
import { createWorkspaceState } from '@/features/layout/echoWorkspace/useEchoWorkspace';
import { useEchoSessionStore } from '@/features/layout/echoSession';

function buildEchoPlatform(): EchoPlatform {
  const capabilities = {
    get restoreSessionOnAppStart() {
      return echoSyncCapabilities.restoreSessionOnAppStart;
    },
    get isMockDataMode() {
      return echoSyncCapabilities.isMockDataMode;
    },
    get browser() {
      return echoSyncCapabilities.browser;
    },
  };
  return {
    capabilities,
    session: useEchoSessionStore(),
    workspace: createWorkspaceState(),
    isMockDataMode: false as const,
  };
}

let echoPlatformSingleton: EchoPlatform | null = null;

/** Shared platform for `main.ts` bootstrap and `App.vue` provide — same workspace instance. */
export function getEchoPlatform(): EchoPlatform {
  if (!echoPlatformSingleton) {
    echoPlatformSingleton = buildEchoPlatform();
  }
  return echoPlatformSingleton;
}

/** Alias for the shared instance (same as `getEchoPlatform()`). */
export function createEchoPlatform(): EchoPlatform {
  return getEchoPlatform();
}
