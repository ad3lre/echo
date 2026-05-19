import { echoBrowserCompatibility } from '@/platform/browserCompatibility';

/**
 * Synchronous capability flags for Pinia / bootstrap (no inject available).
 */
export const echoSyncCapabilities = {
  get restoreSessionOnAppStart(): boolean {
    return true;
  },
  /** Legacy flag — always false after mock UI removal. */
  get isMockDataMode(): boolean {
    return false;
  },
  get browser() {
    return echoBrowserCompatibility;
  },
} as const;
