import type { PollData } from './message';

/**
 * For anonymous polls, strip other users' voter ids from payloads sent to a given viewer.
 * Vote counts are unchanged.
 */
export function redactPollForViewer(
  poll: PollData,
  viewerUserId: string | undefined,
): PollData {
  if (poll.anonymous !== true) return poll;
  const uid = viewerUserId?.trim();
  if (!uid) {
    return {
      ...poll,
      options: poll.options.map((o) => ({ ...o, voterIds: [] })),
    };
  }
  return {
    ...poll,
    options: poll.options.map((o) => ({
      ...o,
      voterIds: o.voterIds.includes(uid) ? [uid] : [],
    })),
  };
}

export function redactPollOnMessage<M extends { poll?: PollData }>(
  msg: M,
  viewerUserId: string | undefined,
): M {
  if (!msg.poll) return msg;
  if (msg.poll.anonymous !== true) return msg;
  return { ...msg, poll: redactPollForViewer(msg.poll, viewerUserId) };
}
