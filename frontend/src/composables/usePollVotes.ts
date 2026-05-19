import type { Ref } from 'vue';
import type { RawMessage } from './useChatMessages';
import type { PollOption } from '@shared/types';
import { updateChannelMessageInBucket } from '@/services/realtime/channelMessageAuthority';
import { isPollEnded } from '@/utils/formatPollTime';

export function usePollVotes(messages: Ref<Record<string, RawMessage[]>>) {
  function votePoll(
    channelId: string,
    messageId: string,
    optionId: string,
    userId: string,
  ) {
    const channelMessages = messages.value[channelId];
    if (!channelMessages) return;
    const msgIdx = channelMessages.findIndex((m) => m.id === messageId);
    if (msgIdx < 0 || !channelMessages[msgIdx]?.poll) return;

    const msg = channelMessages[msgIdx]!;
    const poll = msg.poll!;
    if (isPollEnded(poll.endsAt)) return;

    const newOptions: PollOption[] = poll.options.map((opt) => {
      const hasVoted = opt.voterIds.includes(userId);
      const isTarget = opt.id === optionId;
      if (isTarget && !hasVoted) {
        return {
          ...opt,
          voterIds: [...opt.voterIds, userId],
          votes: opt.votes + 1,
        };
      }
      if (hasVoted && !isTarget) {
        return {
          ...opt,
          voterIds: opt.voterIds.filter((id) => id !== userId),
          votes: Math.max(0, opt.votes - 1),
        };
      }
      return opt;
    });

    const nextPoll = { ...poll, options: newOptions };
    updateChannelMessageInBucket(channelId, messageId, {
      poll: nextPoll,
    });
  }

  return { votePoll };
}
