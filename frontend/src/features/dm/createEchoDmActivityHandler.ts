import type { EchoDmActivityEvent, EchoDmRealtimeThread } from '@shared/types';

export function createEchoDmActivityHandler(deps: {
  mergeEchoDmThreadFromRealtime: (
    thread: EchoDmRealtimeThread,
    lastActivityId?: string,
  ) => void;
}) {
  return (payload: EchoDmActivityEvent) => {
    deps.mergeEchoDmThreadFromRealtime(payload.thread, payload.message.id);
  };
}
