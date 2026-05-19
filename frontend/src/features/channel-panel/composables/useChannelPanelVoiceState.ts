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

  /**
   * Workspace `voiceParticipantIds` can lag on moves (add to new VC before remove from old).
   * The client already knows `currentVoiceChannelId`, so treat that as membership authority
   * for **self**: strip the current user from every other voice channel’s roster for display.
   */
  const effectiveCategories = computed(() => {
    const list = categoriesList.value;
    const vcId = (options.getCurrentVoiceChannelId() ?? '').trim();
    const uid = (options.getCurrentUserId() ?? '').trim();
    if (!vcId || !uid) return list;

    const lk = options.getLiveKitVoiceFilter?.();
    const lkForCurrent =
      lk && vcId === (lk.channelId ?? '').trim() ? lk : null;

    const out: typeof list = [];
    let anyChange = false;

    for (const cat of list) {
      const nextChannels: ChannelWithParticipants[] = [];
      let catChanged = false;

      for (const ch of cat.channels) {
        if (ch.type !== 'voice') {
          nextChannels.push(ch as ChannelWithParticipants);
          continue;
        }
        const cwp = ch as ChannelWithParticipants;
        if (cwp.id !== vcId) {
          const base = cwp.voiceParticipantIds ?? [];
          if (!base.includes(uid)) {
            nextChannels.push(cwp);
            continue;
          }
          catChanged = true;
          anyChange = true;
          nextChannels.push({
            ...cwp,
            voiceParticipantIds: base.filter((id) => id !== uid),
          });
          continue;
        }

        const base = cwp.voiceParticipantIds ?? [];
        let ids = base.includes(uid) ? base : [...base, uid];
        if (lkForCurrent) {
          ids = canonicalVoiceParticipantIdsForLiveKitRoom(ids, {
            remoteIdentities: lkForCurrent.remoteIdentities,
            currentUserId: lkForCurrent.currentUserId,
            liveKitConnected: true,
            channelMatches: true,
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
        catChanged = true;
        anyChange = true;
        nextChannels.push({
          ...cwp,
          voiceParticipantIds: sorted,
        });
      }

      if (!catChanged) {
        out.push(cat);
      } else {
        out.push({ ...cat, channels: nextChannels });
      }
    }

    return anyChange ? out : list;
  });

  return {
    getUserById,
    isVcMicOff,
    isVcHeadphonesOff,
    getVoiceParticipantState,
    effectiveCategories,
  };
}
