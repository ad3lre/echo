import { computed, type Ref } from 'vue';
import type {
  EchoAttentionChannelSummary,
  EchoAttentionServerSummary,
} from '@shared/types';
import {
  computeChannelMissedActivityByChannelId,
  computeServerPingBubbleForServer,
  computeServerUnreadActivityDotByServerId,
  listServerPingChannelDotsForServer,
  type ServerPingBubbleDisplay,
} from '@shared/attentionPing';
import type { ServerNotificationLevel } from '@/features/server-notifications/types';
import type {
  ServerPingChannelDotsForServerRail,
  ServerPingChannelDotWithLabel,
  ServerPingKind,
} from '@/features/server-notifications/serverPing';

const MAX_SERVER_PING_CHANNEL_DOTS = 12;

export function useAppLayoutServerPingIndicators(deps: {
  serverAttentionByServerId: Ref<Record<string, EchoAttentionServerSummary>>;
  channelAttentionByChannelId: Ref<Record<string, EchoAttentionChannelSummary>>;
  readStateByChannelId: Ref<Record<string, string | null>>;
  serverNotificationLevelByServerId: Ref<
    Record<string, ServerNotificationLevel>
  >;
  /** Channel id → display name for server-rail ping dot tooltips. */
  channelDisplayNameByChannelId: Ref<Record<string, string>>;
}) {
  const serverPingKindByServerId = computed(() => {
    const byServer: Record<string, ServerPingKind> = {};
    for (const [serverId, summary] of Object.entries(
      deps.serverAttentionByServerId.value,
    )) {
      if (summary.pingKind) byServer[serverId] = summary.pingKind;
    }
    return byServer;
  });

  const serverPingBubbleByServerId = computed(() => {
    const channels = Object.values(deps.channelAttentionByChannelId.value);
    const levels = deps.serverNotificationLevelByServerId.value;
    const readMap = deps.readStateByChannelId.value;
    const byServer: Record<string, ServerPingBubbleDisplay> = {};
    const serverIds = new Set<string>();
    for (const ch of channels) {
      if (ch.kind === 'server' && ch.serverId) serverIds.add(ch.serverId);
    }
    for (const sid of Object.keys(deps.serverAttentionByServerId.value)) {
      serverIds.add(sid);
    }
    for (const serverId of serverIds) {
      const bubble = computeServerPingBubbleForServer({
        channelSummaries: channels,
        serverId,
        notificationLevel: levels[serverId],
        readStateByChannelId: readMap,
      });
      if (bubble) byServer[serverId] = bubble;
    }
    return byServer;
  });

  const serverPingChannelDotsByServerId = computed(() => {
    const channels = Object.values(deps.channelAttentionByChannelId.value);
    const levels = deps.serverNotificationLevelByServerId.value;
    const readMap = deps.readStateByChannelId.value;
    const labels = deps.channelDisplayNameByChannelId.value;
    const byServer: Record<string, ServerPingChannelDotsForServerRail> = {};
    const serverIds = new Set<string>();
    for (const ch of channels) {
      if (ch.kind === 'server' && ch.serverId) serverIds.add(ch.serverId);
    }
    for (const sid of Object.keys(deps.serverAttentionByServerId.value)) {
      serverIds.add(sid);
    }
    for (const serverId of serverIds) {
      const rawDots = listServerPingChannelDotsForServer({
        channelSummaries: channels,
        serverId,
        notificationLevel: levels[serverId],
        readStateByChannelId: readMap,
      });
      if (!rawDots.length) continue;
      const capped = rawDots.slice(0, MAX_SERVER_PING_CHANNEL_DOTS);
      const withLabels: ServerPingChannelDotWithLabel[] = capped.map((d) => ({
        ...d,
        label: (labels[d.channelId]?.trim() || 'Channel').trim(),
      }));
      byServer[serverId] = {
        dots: withLabels,
        overflowCount: Math.max(0, rawDots.length - capped.length),
      };
    }
    return byServer;
  });

  const serverUnreadActivityDotByServerId = computed(() =>
    computeServerUnreadActivityDotByServerId({
      channelSummaries: Object.values(deps.channelAttentionByChannelId.value),
      readStateByChannelId: deps.readStateByChannelId.value,
      serverNotificationLevelByServerId:
        deps.serverNotificationLevelByServerId.value,
    }),
  );

  const channelMissedActivityByChannelId = computed(() =>
    computeChannelMissedActivityByChannelId({
      channelSummaries: Object.values(deps.channelAttentionByChannelId.value),
      readStateByChannelId: deps.readStateByChannelId.value,
    }),
  );

  return {
    serverPingKindByServerId,
    serverPingBubbleByServerId,
    serverPingChannelDotsByServerId,
    serverUnreadActivityDotByServerId,
    channelMissedActivityByChannelId,
  };
}
