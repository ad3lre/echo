/**
 * Inline LiveKit E2EE worker (Element Call pattern). Bundles the worker into the
 * app chunk graph so production/CDN builds do not need a separate worker URL.
 */
import E2EEWorker from 'livekit-client/e2ee-worker?worker&inline';

export function createLiveKitE2eeWorker(): Worker {
  return new E2EEWorker();
}
