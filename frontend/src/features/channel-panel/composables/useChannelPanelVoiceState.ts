import { computed, unref, type Ref } from 'vue';
import type { ChannelPermissionKey, ChannelSummary } from '@shared/types';
import { canonicalVoiceParticipantIdsForLiveKitRoom } from '@/features/layout/domain/voiceParticipantState';

export interface ChannelWithParticipants extends ChannelSummary {
  voiceParticipantIds?: ChannelSummary['voiceParticipantIds'];
  voiceServerMuteByUserId?: ChannelSummary['voiceServerMuteByUserId'];
  voiceServerDeafenByUserId?: ChannelSummary['voiceServerDeafenByUserId'];
}

export interface ChannelCategory {
  id: string;
  name: string;
  channels: ChannelWithParticipants[];
  channelPermissionDefaults?: Partial<Record<ChannelPermissionKey, boolean>>;
  hideCategoryHeader?: boolean;
}

/** Same participant row shape as CallView / `voiceSessionParticipants` (subset for ordering). */
export type LiveVoiceParticipantSortSource = {
  id: string;
  muted: boolean;
  deafened: boolean;
  streaming: boolean;
  video: boolean;
};

interface VoiceStateOptions {
  categories: ChannelCategory[] | Ref<ChannelCategory[]>;
  getCurrentVoiceChannelId: () => string | null | undefined;
  getCurrentUserId: () => string | undefined;
  users:
    | Array<{ id: string; name: string; pfp: string }>
    | Ref<Array<{ id: string; name: string; pfp: string }>>;
  getVcMuted: () => boolean | undefined;
  getVcDeafened: () => boolean | undefined;
  getVcVideo: () => boolean | undefined;
  getVcScreenshare: () => boolean | undefined;
  /**
   * LiveKit session rows for the connected VC. When set, remote participant **sort ranks**
   * follow mute/deafen/video/screen like CallView (not only the local user).
   */
  getLiveVoiceParticipants?: () =>
    | ReadonlyArray<LiveVoiceParticipantSortSource>
    | null
    | undefined;
  /**
   * Echo/mock server mute–deafen for the **current** voice channel when a user is not in
   * `getLiveVoiceParticipants` (snapshot lag or not yet connected).
   */
  getServerVoiceModerationForUser?: (userId: string) => {
    serverMuted: boolean;
    serverDeafened: boolean;
  };
  /**
   * When in a LiveKit voice session, keep the Echo roster and add LiveKit-only remotes
   * so the channel list matches CallView while transport and snapshot state converge.
   */
  getLiveKitVoiceFilter?: () => {
    remoteIdentities: string[];
    currentUserId: string | undefined;
    channelId: string;
  } | null;
}

export function useChannelPanelVoiceState(options: VoiceStateOptions) {
  const usersList = computed(() => unref(options.users));

  function getUserById(id: string) {
    return usersList.value.find((u) => u.id === id);
  }

  function isVcMicOff() {
    return (
      (options.getVcMuted() ?? false) || (options.getVcDeafened() ?? false)
    );
  }

  function isVcHeadphonesOff() {
    return options.getVcDeafened() ?? false;
  }

  function getVoiceParticipantState(userId: string) {
    if (userId === options.getCurrentUserId()) {
      return {
        streaming: options.getVcScreenshare() ?? false,
        video: options.getVcVideo() ?? false,
        deafened: options.getVcDeafened() ?? false,
        muted: isVcMicOff(),
      };
    }
    const live = options.getLiveVoiceParticipants?.();
    if (live?.length) {
      const p = live.find((x) => x.id === userId);
      if (p) {
        return {
          streaming: !!p.streaming,
          video: !!p.video,
          deafened: !!p.deafened,
          muted: !!p.muted,
        };
      }
    }
    const mod = options.getServerVoiceModerationForUser?.(userId);
    if (mod) {
      const { serverMuted, serverDeafened } = mod;
      return {
        streaming: false,
        video: false,
        deafened: serverDeafened,
        muted: serverMuted || serverDeafened,
      };
    }
    return { streaming: false, video: false, deafened: false, muted: false };
  }

  function getVoiceParticipantSortRank(userId: string) {
    const state = getVoiceParticipantState(userId);
    if (state.streaming) return 4;
    if (state.video) return 3;
    if (state.deafened) return 0;
    if (state.muted) return 1;
    return 2;
  }

  const categoriesList = computed(() => unref(options.categories));

  /** Only shallow-clone the category that contains the active voice channel; avoids remapping the whole tree. */
  const effectiveCategories = computed(() => {
    const list = categoriesList.value;
    const vcId = options.getCurrentVoiceChannelId();
    const uid = options.getCurrentUserId();
    if (!vcId || !uid) return list;

    for (let ci = 0; ci < list.length; ci++) {
      const cat = list[ci]!;
      const chIdx = cat.channels.findIndex(
        (ch) => ch.id === vcId && ch.type === 'voice',
      );
      if (chIdx < 0) continue;

      const ch = cat.channels[chIdx]!;
      const base = (ch as ChannelWithParticipants).voiceParticipantIds ?? [];
      let ids = base.includes(uid) ? base : [...base, uid];
      const lk = options.getLiveKitVoiceFilter?.();
      if (lk && vcId === lk.channelId) {
        ids = canonicalVoiceParticipantIdsForLiveKitRoom(ids, {
          remoteIdentities: lk.remoteIdentities,
          currentUserId: lk.currentUserId,
          liveKitConnected: true,
          channelMatches: vcId === lk.channelId,
        });
      }
      const sorted = [...ids].sort((a, b) => {
        const ra = getVoiceParticipantSortRank(a);
        const rb = getVoiceParticipantSortRank(b);
        if (ra !== rb) return rb - ra;
        const ua = getUserById(a)?.name ?? '';
        const ub = getUserById(b)?.name ?? '';
        return ua.localeCompare(ub);
      });
      const updatedCh = {
        ...ch,
        voiceParticipantIds: sorted,
      } as ChannelWithParticipants;
      const newChannels = cat.channels.slice();
      newChannels[chIdx] = updatedCh;
      const newCat = { ...cat, channels: newChannels };
      const out = list.slice();
      out[ci] = newCat;
      return out;
    }

    return list;
  });

  return {
    getUserById,
    isVcMicOff,
    isVcHeadphonesOff,
    getVoiceParticipantState,
    effectiveCategories,
  };
}
