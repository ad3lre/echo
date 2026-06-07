export type VoiceRoutingDeps = {
  adapters: {
    socket?: { emit: (ev: string, p: unknown) => void };
  };
};

export function createVoiceRoutingService({ adapters }: VoiceRoutingDeps) {
  return {
    handleJoinVoice(serverId: string, channelId: string, userId: string) {
      // Simple orchestration example: notify server via socket adapter.
      adapters.socket?.emit('voice:join', { serverId, channelId, userId });
    },
    handleLeaveVoice(serverId: string, channelId: string, userId: string) {
      adapters.socket?.emit('voice:leave', { serverId, channelId, userId });
    },
  };
}
