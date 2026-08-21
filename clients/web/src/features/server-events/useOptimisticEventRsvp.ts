import { ref, watch, type Ref } from 'vue';
import type {
  EventRsvpChoice,
  EventRsvpStatus,
} from '@/features/server-events/rsvpUi';

type EventWithRsvp = { id: string; userRsvp?: EventRsvpChoice };

const DECLINE_FEEDBACK_MS = 480;

/**
 * Immediate RSVP feedback while the server round-trip completes.
 * "Going" sticks until props match; "declined" holds briefly so the choice is visible.
 */
export function useOptimisticEventRsvp(events: Ref<readonly EventWithRsvp[]>) {
  const pendingRsvpByEventId = ref<Record<string, EventRsvpStatus>>({});
  const declineHoldUntilByEventId = ref<Record<string, number>>({});
  /** Bumped when a decline feedback window ends so lists re-filter. */
  const declineHoldTick = ref(0);

  function rsvpFor(
    eventId: string,
    serverRsvp: EventRsvpChoice,
  ): EventRsvpChoice {
    return pendingRsvpByEventId.value[eventId] ?? serverRsvp ?? null;
  }

  function isEventVisible(
    eventId: string,
    serverRsvp: EventRsvpChoice,
  ): boolean {
    void declineHoldTick.value;
    const effective = rsvpFor(eventId, serverRsvp);
    if (effective !== 'declined') return true;
    const holdUntil = declineHoldUntilByEventId.value[eventId];
    return holdUntil != null && Date.now() < holdUntil;
  }

  function setRsvp(eventId: string, status: EventRsvpStatus) {
    pendingRsvpByEventId.value = {
      ...pendingRsvpByEventId.value,
      [eventId]: status,
    };
    if (status === 'declined') {
      const until = Date.now() + DECLINE_FEEDBACK_MS;
      declineHoldUntilByEventId.value = {
        ...declineHoldUntilByEventId.value,
        [eventId]: until,
      };
      window.setTimeout(() => {
        const nextHold = { ...declineHoldUntilByEventId.value };
        delete nextHold[eventId];
        declineHoldUntilByEventId.value = nextHold;
        declineHoldTick.value += 1;
      }, DECLINE_FEEDBACK_MS);
    }
  }

  watch(
    events,
    (list) => {
      const nextPending = { ...pendingRsvpByEventId.value };
      let changed = false;
      for (const ev of list) {
        const pending = nextPending[ev.id];
        if (pending != null && ev.userRsvp === pending) {
          delete nextPending[ev.id];
          changed = true;
        }
      }
      if (changed) pendingRsvpByEventId.value = nextPending;
    },
    { deep: true },
  );

  return {
    rsvpFor,
    isEventVisible,
    setRsvp,
  };
}
