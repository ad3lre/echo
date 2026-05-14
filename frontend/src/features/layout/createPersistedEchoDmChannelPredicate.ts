import { isDmThreadId } from '@/features/layout/mainSurface';

/** Guild switch: treat DM thread ids + persisted Echo DM channels as “leave server channel surface”. */
export function createPersistedEchoDmChannelPredicate(deps: {
  echoDmThreadIds: () => ReadonlySet<string>;
}) {
  return (channelId: string) =>
    isDmThreadId(channelId) || deps.echoDmThreadIds().has(channelId);
}
