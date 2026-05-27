<script setup lang="ts">
import { computed, inject, nextTick, provide, unref, watch } from 'vue';
import type { MaybeRef } from 'vue';
import { getActivePinia, storeToRefs } from 'pinia';
import { useDevSettingsStore } from '@/stores/devSettings';
import AppLayoutChatHeader from '@/features/layout/components/AppLayoutChatHeader.vue';
import AppLayoutPinsDropdown from '@/features/layout/components/AppLayoutPinsDropdown.vue';
import AppLayoutVoiceSection from '@/features/layout/components/AppLayoutVoiceSection.vue';
import GuildVoiceFloatingSpeakerPill from '@/features/layout/components/GuildVoiceFloatingSpeakerPill.vue';
import GuildVoiceStreamPip from '@/features/layout/components/GuildVoiceStreamPip.vue';
import AppLayoutForumSection from '@/features/layout/components/AppLayoutForumSection.vue';
import AppLayoutPaperSection from '@/features/layout/components/AppLayoutPaperSection.vue';
import AppLayoutDmSection from '@/features/layout/components/AppLayoutDmSection.vue';
import AppLayoutDmSidePanel from '@/features/layout/components/AppLayoutDmSidePanel.vue';
import { APP_LAYOUT_SEARCH_PANEL_KEY } from '@/features/layout/chatSurfaceContext';
import { LAYOUT_CHAT_SURFACE_KEY } from '@/features/layout/layoutInjectionKeys';
import {
  CHAT_SURFACE_INJECT_KEYS,
  type AppLayoutChatSurfaceProps,
} from '@/features/layout/appLayoutChatSurfaceProps';
import type { FilterKey, HasType } from '@/composables/useSearch';
import { emitChatSwitchEvent } from '@/features/layout/chatSwitchPerfTrace';
import { useChatCustomEmojiResolvers } from '@/composables/useChatCustomEmojiResolvers';
import type { ChannelSummary, MessageWithAuthor } from '@shared/types';
import type { UserForAuthor } from '@/features/chat/chatMessageTypes';

const props = defineProps<Partial<AppLayoutChatSurfaceProps>>();

const activePinia = getActivePinia();
const devSettings = activePinia ? useDevSettingsStore(activePinia) : null;
const devModeIdsEnabled = activePinia
  ? storeToRefs(devSettings!).devModeIdsEnabled
  : computed(() => false);

const layoutChat = inject(LAYOUT_CHAT_SURFACE_KEY, null);

/** Merged inject + props; typed loosely so child layout components keep their own prop contracts. */
const chatCtx = computed(() => {
  const inj = layoutChat;
  const o: Record<string, unknown> = {};
  for (const key of CHAT_SURFACE_INJECT_KEYS) {
    const k = key as keyof AppLayoutChatSurfaceProps;
    if (inj && inj[k] !== undefined) {
      /**
       * Some injected values are *template refs* (Ref<HTMLElement | null>) that must
       * be passed through without `unref`, otherwise we lose the Ref wrapper and
       * downstream `:ref="..."` bindings stop working (pins dropdown anchor).
       */
      if (
        k === 'pinsButtonRefDm' ||
        k === 'pinsButtonRefServer' ||
        k === 'vcActivityUi'
      ) {
        o[k as string] = inj[k];
      } else {
        o[k as string] = unref(
          inj[k] as MaybeRef<AppLayoutChatSurfaceProps[typeof k]>,
        );
      }
    } else {
      o[k as string] = props[k];
    }
  }
  return o as any;
});

const searchPanel = inject(APP_LAYOUT_SEARCH_PANEL_KEY, null);

function fromSearchOrInjectOrProps<K extends keyof AppLayoutChatSurfaceProps>(
  key: K,
) {
  return computed(() => {
    if (searchPanel) {
      switch (key) {
        case 'searchText':
          return searchPanel.searchText.value as AppLayoutChatSurfaceProps[K];
        case 'filterChips':
          return searchPanel.filterChips.value as AppLayoutChatSurfaceProps[K];
        case 'allChannels':
          return searchPanel.allChannels.value as AppLayoutChatSurfaceProps[K];
        case 'paginatedSearchResults':
          return searchPanel.paginatedSearchResults
            .value as AppLayoutChatSurfaceProps[K];
        case 'searchResultMessagesCount':
          return searchPanel.searchResultMessages.value
            .length as AppLayoutChatSurfaceProps[K];
        case 'searchResultPage':
          return searchPanel.searchResultPage
            .value as AppLayoutChatSurfaceProps[K];
        case 'totalPages':
          return searchPanel.totalPages.value as AppLayoutChatSurfaceProps[K];
        case 'selectedServerName':
          return searchPanel.selectedServerName
            .value as AppLayoutChatSurfaceProps[K];
        case 'searchLoading':
          return searchPanel.searchLoading
            .value as AppLayoutChatSurfaceProps[K];
        case 'searchError':
          return searchPanel.searchError.value as AppLayoutChatSurfaceProps[K];
        case 'searchScopeHint':
          return searchPanel.searchScopeHint
            .value as AppLayoutChatSurfaceProps[K];
        default:
          break;
      }
    }
    const inj = layoutChat;
    if (inj && key in inj && inj[key] !== undefined) {
      return unref(inj[key] as MaybeRef<AppLayoutChatSurfaceProps[K]>);
    }
    return props[key];
  });
}

const resolvedSearchText = fromSearchOrInjectOrProps('searchText');
const resolvedFilterChips = fromSearchOrInjectOrProps('filterChips');
const resolvedAllChannels = fromSearchOrInjectOrProps('allChannels');
const resolvedPaginatedSearchResults = fromSearchOrInjectOrProps(
  'paginatedSearchResults',
);

/**
 * Chat header / search sit beside nested `ChatView` instances — provide shared
 * custom-emoji resolvers here so chrome and search previews resolve cross-guild.
 */
const chatSurfaceServerId = computed(() => {
  const id = chatCtx.value.selectedServerId;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
});

const chatSurfaceCustomEmoji = useChatCustomEmojiResolvers({
  serverId: chatSurfaceServerId,
  users: computed(() => chatCtx.value.users as UserForAuthor[] | undefined),
  channels: computed(
    () => chatCtx.value.channels as ChannelSummary[] | undefined,
  ),
  activeChannelMessages: computed(() => {
    const raw = chatCtx.value.activeChannelMessagesMap as
      | Map<string, MessageWithAuthor>
      | undefined;
    return raw?.size ? raw : undefined;
  }),
});

provide('customEmojiUrlById', chatSurfaceCustomEmoji.customEmojiUrlById);
provide('ensureCustomEmojiId', chatSurfaceCustomEmoji.ensureEmojiId);
provide('idTokenResolvers', chatSurfaceCustomEmoji.idTokenResolvers);

watch(
  resolvedPaginatedSearchResults,
  (results) => {
    const texts: string[] = [];
    for (const m of results ?? []) {
      const c = (m as MessageWithAuthor).content?.trim();
      if (c) texts.push(c);
    }
    chatSurfaceCustomEmoji.prefetchEmojiIdsFromTexts(texts);
  },
  { immediate: true },
);
const resolvedSearchResultMessagesCount = fromSearchOrInjectOrProps(
  'searchResultMessagesCount',
);
const resolvedSearchResultPage = fromSearchOrInjectOrProps('searchResultPage');
const resolvedTotalPages = fromSearchOrInjectOrProps('totalPages');
const resolvedSelectedServerName =
  fromSearchOrInjectOrProps('selectedServerName');

/** Search panel uses a slim channel shape; voice/DM children accept wider summaries via their own props. */
const allChannelsForVoice = computed(
  () => (resolvedAllChannels.value ?? []) as any,
);
const allChannelsForDm = computed(
  () => (chatCtx.value.allChannels ?? []) as any,
);

function resolvedOnSearchInput(v: string) {
  if (searchPanel) searchPanel.onSearchInput(v);
  else if (layoutChat?.onSearchInput !== undefined) {
    unref(layoutChat.onSearchInput)(v);
  } else props.onSearchInput?.(v);
}
function resolvedAddFilter(key: FilterKey, value: string | boolean | HasType) {
  if (searchPanel) searchPanel.addFilter(key, value);
  else if (layoutChat?.addFilter !== undefined) {
    unref(layoutChat.addFilter)(key, value);
  } else props.addFilter?.(key, value);
}
function resolvedRemoveFilter(key: FilterKey) {
  if (searchPanel) searchPanel.removeFilter(key);
  else if (layoutChat?.removeFilter !== undefined) {
    unref(layoutChat.removeFilter)(key);
  } else props.removeFilter?.(key);
}
function resolvedClearSearch() {
  if (searchPanel) searchPanel.clearSearch();
  else if (layoutChat?.clearSearch !== undefined) {
    unref(layoutChat.clearSearch)();
  } else props.clearSearch?.();
}
function resolvedGoToSearchPage(page: number) {
  if (searchPanel) searchPanel.goToSearchPage(page);
  else if (layoutChat?.goToSearchPage !== undefined) {
    unref(layoutChat.goToSearchPage)(page);
  } else props.goToSearchPage?.(page);
}
function resolvedHandleGoToMessage(channelId: string, messageId: string) {
  if (searchPanel) searchPanel.handleGoToMessage(channelId, messageId);
  else if (layoutChat?.handleGoToMessage !== undefined) {
    unref(layoutChat.handleGoToMessage)(channelId, messageId);
  } else props.handleGoToMessage?.(channelId, messageId);
}

const resolvedSearchLoading = computed(() => {
  if (searchPanel) return searchPanel.searchLoading.value;
  if (layoutChat && layoutChat.searchLoading !== undefined) {
    return unref(layoutChat.searchLoading);
  }
  return props.searchLoading ?? false;
});
const resolvedSearchError = computed(() => {
  if (searchPanel) return searchPanel.searchError.value;
  if (layoutChat && layoutChat.searchError !== undefined) {
    return unref(layoutChat.searchError);
  }
  return props.searchError ?? null;
});
const resolvedSearchScopeHint = computed(() => {
  if (searchPanel) return searchPanel.searchScopeHint.value;
  if (layoutChat && layoutChat.searchScopeHint !== undefined) {
    return unref(layoutChat.searchScopeHint);
  }
  return props.searchScopeHint ?? '';
});

watch(
  () => ({
    surfaceType: chatCtx.value.mainSurface?.type ?? 'unknown',
    channelId:
      chatCtx.value.mainSurface?.type === 'serverText' ||
      chatCtx.value.mainSurface?.type === 'serverVoice'
        ? chatCtx.value.mainSurface.channelId
        : (chatCtx.value.effectiveActiveChannel?.id ?? ''),
    selectedServerId: chatCtx.value.selectedServerId ?? null,
  }),
  (next, prev) => {
    if (!prev) return;
    if (
      next.surfaceType === prev.surfaceType &&
      next.channelId === prev.channelId &&
      next.selectedServerId === prev.selectedServerId
    ) {
      return;
    }
    void nextTick(() => {
      if (performance.mark)
        performance.mark(`chat-switch-ui-rendered-pre-emit-${next.channelId}`);
      emitChatSwitchEvent({
        event: 'chat_switch_ui_rendered',
        channelId: next.channelId,
        context: {
          surfaceType: next.surfaceType,
          selectedServerId: next.selectedServerId,
        },
      });
    });
  },
);

/** When true, DM quarter call chrome lives in AppLayoutChatHeader; hide duplicate bars in DMCallView. */
const suppressDmCallEmbeddedDuplicateCallUi = computed(() => {
  const c = chatCtx.value;
  const localCall = c.activeDmThreadCallUi;
  if (localCall?.fullscreen) return false;
  if (!localCall) return false;
  if (
    !localCall.quarterView ||
    !c.isInDMMode ||
    !c.isInDMChat ||
    c.dmActiveTab !== 'messages'
  ) {
    return false;
  }
  return !!(
    localCall.glassPeer ||
    c.dmPartnerUser ||
    (c.isGroupDM && c.activeGroupDM)
  );
});

/**
 * Extra scroll inset (px) for `MessageList` when the global `AppLayoutChatHeader` grows taller
 * than the normal `h-12` strip (DM quarter-call chrome uses `min-h-[9rem]`).
 *
 * Do not implement this as outer `padding-top` on the chat column: padding paints an opaque band
 * behind the absolutely positioned glass header, so `backdrop-filter` only blurs flat surface color
 * (looks “solid”), not the scrolling messages underneath.
 */
const shellHeaderOverlayInsetPx = computed<number | undefined>(() => {
  const c = chatCtx.value;
  const localCall = c.activeDmThreadCallUi;
  if (localCall?.fullscreen) return undefined;

  const isDmHub =
    c.mainSurface?.type === 'dmFriends' || c.mainSurface?.type === 'dmRequests';
  if (isDmHub) return undefined;

  const tallQuarterChrome =
    !!localCall &&
    localCall.quarterView &&
    c.isInDMMode &&
    c.isInDMChat &&
    c.dmActiveTab === 'messages' &&
    !!(
      localCall.glassPeer ||
      c.dmPartnerUser ||
      (c.isGroupDM && c.activeGroupDM)
    );
  if (!tallQuarterChrome) return undefined;
  return 9 * 16;
});
</script>

<template>
  <div
    class="chat-column relative flex min-w-0 min-h-0 flex-row overflow-hidden"
  >
    <div
      v-if="chatCtx.surfaceSwitchLoading"
      class="app-layout-surface-loading pointer-events-none absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden"
      aria-hidden="true"
    >
      <span class="app-layout-surface-loading__bar block h-full w-1/3" />
    </div>
    <!-- `relative` confines absolutely positioned chrome (chat header, resize handle) to this
         main column only — not the DM profile rail or members column, so headers cannot
         overlap adjacent panes. `isolate` keeps call / glass stacking predictable. -->
    <div class="relative isolate flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        v-if="
          !chatCtx.isViewingVoiceChannel &&
          !chatCtx.memberPanelCollapsed &&
          (chatCtx.mainSurface.type === 'serverText' ||
            chatCtx.callOverlay.type === 'serverVoice')
        "
        class="absolute right-0 top-0 bottom-0 w-2 -mr-1 cursor-col-resize z-[50]"
        style="background: transparent; border: none"
        aria-label="Resize member panel"
        @mousedown="chatCtx.startMemberResize"
        @dblclick="chatCtx.resetMemberWidth"
      />
      <AppLayoutChatHeader
        v-if="chatCtx.mainSurface.type !== 'serverPaper'"
        :chat-header-model="chatCtx.chatHeaderAdapter?.model?.value"
        :chat-header-intents="chatCtx.chatHeaderAdapter?.intents"
        :main-surface="chatCtx.mainSurface"
        :effective-active-channel="chatCtx.effectiveActiveChannel"
        :can-manage-stage-channel="
          !!chatCtx.liveChannelCapabilities?.canManageChannel
        "
        :is-viewing-voice-channel="chatCtx.isViewingVoiceChannel"
        :isInDMMode="chatCtx.isInDMMode"
        :isInDMChat="chatCtx.isInDMChat"
        :active-dm-thread-call-ui="chatCtx.activeDmThreadCallUi"
        :is-expanded-profile-side-panel="chatCtx.isExpandedProfileSidePanel"
        :is-expanded-profile-modal-open="chatCtx.isExpandedProfileModalOpen"
        :is-group-overview-open="chatCtx.isGroupOverviewOpen"
        :dm-partner-user="chatCtx.dmPartnerUser"
        :presence-by-user-id="chatCtx.presenceByUserId"
        :presence-mobile-by-user-id="chatCtx.presenceMobileByUserId"
        :open-expanded-profile-panel-for-user-id="
          chatCtx.openExpandedProfilePanelForUserId
        "
        :open-extended-profile-modal-for-user-id="
          chatCtx.openExtendedProfileModalForUserId
        "
        :handle-expanded-profile-open-profile="
          chatCtx.handleExpandedProfileOpenProfile
        "
        :isGroupDM="chatCtx.isGroupDM"
        :activeGroupDM="chatCtx.activeGroupDM"
        :icons="chatCtx.icons"
        :dm-active-tab="chatCtx.dmActiveTab"
        :get-channel-icon="chatCtx.getChannelIcon"
        :get-channel-display-name="chatCtx.getChannelDisplayName"
        :toggle-pins-dropdown="chatCtx.togglePinsDropdown"
        :is-role-preview-active-for-server="
          chatCtx.isRolePreviewActiveForServer
        "
        :role-preview="chatCtx.rolePreview"
        :clear-role-preview="chatCtx.clearRolePreview"
        :channel-panel-collapsed="chatCtx.channelPanelCollapsed"
        :member-panel-collapsed="chatCtx.memberPanelCollapsed"
        :member-panel-collapsed-raw="chatCtx.memberPanelCollapsedRaw"
        :compact-guild-tri-pane-nav="!!chatCtx.compactGuildTriPaneNav"
        :expand-channels="chatCtx.expandChannels"
        :collapse-members="chatCtx.collapseMembers"
        :expand-members="chatCtx.expandMembers"
        :member-panel-width="chatCtx.memberPanelWidth"
        :search-text="resolvedSearchText ?? ''"
        :filter-chips="resolvedFilterChips ?? []"
        :all-channels="resolvedAllChannels ?? []"
        :users="chatCtx.users"
        :paginated-search-results="resolvedPaginatedSearchResults ?? []"
        :search-result-messages-count="resolvedSearchResultMessagesCount ?? 0"
        :search-result-page="resolvedSearchResultPage ?? 1"
        :total-pages="resolvedTotalPages ?? 1"
        :selected-server-name="resolvedSelectedServerName ?? ''"
        :on-search-input="resolvedOnSearchInput"
        :add-filter="resolvedAddFilter"
        :remove-filter="resolvedRemoveFilter"
        :clear-search="resolvedClearSearch"
        :go-to-search-page="resolvedGoToSearchPage"
        :handle-go-to-message="resolvedHandleGoToMessage"
        :search-loading="resolvedSearchLoading"
        :search-error="resolvedSearchError"
        :search-scope-hint="resolvedSearchScopeHint"
        :end-dm-call="chatCtx.endDmCall"
        :leave-dm-call-voice="chatCtx.leaveDmCallVoice"
        :rejoin-dm-call-voice="chatCtx.rejoinDmCallVoice"
        :answer-dm-call="chatCtx.answerDmCall"
        :decline-dm-call="chatCtx.declineDmCall"
        :start-dm-call="chatCtx.startDmCall"
        :is-pins-dropdown-open="chatCtx.isPinsDropdownOpen"
        :pins-button-ref-dm="chatCtx.pinsButtonRefDm"
        :pins-button-ref-server="chatCtx.pinsButtonRefServer"
        :openGroupDMModal="chatCtx.openGroupDMModal"
        :open-group-settings-from-header="chatCtx.openGroupSettingsFromHeader"
        :handle-leave-group-dm="chatCtx.handleLeaveGroupDm"
        :start-group-call="chatCtx.startGroupCall"
        :open-group-overview-panel="chatCtx.openGroupOverviewPanel"
        :active-group-call-members="chatCtx.activeGroupCallMembers"
        :current-user="chatCtx.currentUser"
        :dm-call-video="chatCtx.dmCallVideo"
        :dm-call-screenshare="chatCtx.dmCallScreenshare"
        :dm-call-muted="chatCtx.dmCallMuted"
        :dm-call-deafened="chatCtx.dmCallDeafened"
        :on-toggle-dm-call-video="chatCtx.onToggleDmCallVideo"
        :on-toggle-dm-call-screenshare="chatCtx.onToggleDmCallScreenshare"
        :on-toggle-dm-call-muted="chatCtx.onToggleDmCallMuted"
        :on-toggle-dm-call-deafened="chatCtx.onToggleDmCallDeafened"
        :on-set-dm-call-fullscreen="chatCtx.onSetDmCallFullscreen"
        :dm-call-fullscreen="chatCtx.dmCallFullscreen"
        :dm-call-call-view-participants="chatCtx.dmCallCallViewParticipants"
        :get-remote-participant-volume="chatCtx.getRemoteParticipantVolume"
        :set-remote-participant-volume="chatCtx.setRemoteParticipantVolume"
        :on-request-fullscreen-stream="chatCtx.onRequestFullscreenStream"
        :fullscreen-stream-participant-id="
          chatCtx.fullscreenStreamParticipantId ?? null
        "
        :on-open-voice-audio-settings="chatCtx.onChannelOpenVoiceAudioSettings"
        :get-local-screen-track="chatCtx.getLocalScreenTrack"
        :get-local-camera-track="chatCtx.getLocalCameraTrack"
        :vc-mirror-camera="chatCtx.vcMirrorCamera"
        :vc-remote-participants="chatCtx.vcRemoteParticipants"
      />
      <AppLayoutPinsDropdown
        :is-open="chatCtx.isPinsDropdownOpen"
        :rect="chatCtx.pinsDropdownRect"
        :pinned-messages="chatCtx.pinnedMessagesForDropdown"
        :pin-preview="chatCtx.pinPreview"
        :close-pins-dropdown="chatCtx.closePinsDropdown"
        :go-to-pinned-message="chatCtx.goToPinnedMessage"
      />
      <AppLayoutVoiceSection
        v-if="
          chatCtx.callOverlay.type === 'serverVoice' ||
          chatCtx.mainSurface.type === 'serverVoice'
        "
        :is-viewing-voice-channel="chatCtx.isViewingVoiceChannel"
        :current-voice-channel-id="chatCtx.currentVoiceChannelId"
        :effective-active-channel="chatCtx.effectiveActiveChannel"
        :can-manage-stage-channel="
          !!chatCtx.liveChannelCapabilities?.canManageChannel
        "
        :get-channel-display-name="chatCtx.getChannelDisplayName"
        :active-voice-channel-participants="
          chatCtx.activeVoiceChannelParticipants
        "
        :current-user-id="chatCtx.currentUser?.id"
        :current-user-name="chatCtx.currentUser?.name"
        :current-user-pfp="chatCtx.currentUser?.pfp"
        :linked-discord-user-id="chatCtx.linkedDiscordUserId ?? null"
        :selected-server-id="chatCtx.selectedServerId"
        :users="chatCtx.users"
        :mention-users="chatCtx.usersForMentionAutocomplete"
        :all-channels="allChannelsForVoice"
        :active-channel-messages-map="chatCtx.activeChannelMessagesMap"
        :send-message="chatCtx.sendMessage"
        :on-request-forward="chatCtx.onRequestForward"
        :voice-side-chat-collapsed="chatCtx.voiceSideChatCollapsed"
        :voice-side-chat-width="chatCtx.voiceSideChatWidth"
        :start-voice-side-chat-resize="chatCtx.startVoiceSideChatResize"
        :reset-voice-side-chat-width="chatCtx.resetVoiceSideChatWidth"
        :expand-voice-side-chat="chatCtx.expandVoiceSideChat"
        :toggle-voice-side-chat="chatCtx.toggleVoiceSideChat"
        :voice-mobile-sheet-level="chatCtx.voiceMobileSheetLevel"
        :bump-voice-mobile-chat-from-call-scroll-up="
          chatCtx.bumpVoiceMobileChatFromCallScrollUp
        "
        :bump-voice-mobile-chat-from-call-scroll-down="
          chatCtx.bumpVoiceMobileChatFromCallScrollDown
        "
        :voice-mobile-dock-reserve-px="chatCtx.voiceMobileDockReservePx ?? 0"
        :is-compact-mobile-guild="!!chatCtx.compactGuildTriPaneNav"
        :is-compact-shell="!!chatCtx.isCompactShell"
        :narrow-channel-panel-for-activity-overflow-step="
          chatCtx.narrowChannelPanelForActivityOverflowStep
        "
        :handle-call-view-open-profile="chatCtx.handleCallViewOpenProfile"
        :can-moderate-vc-participant="chatCtx.canModerateVcParticipant"
        :can-vc-moderate-participant-action="
          chatCtx.canVcModerateParticipantAction
        "
        :handle-vc-moderate="chatCtx.handleVcModerate"
        :handle-poll-vote="chatCtx.handlePollVote"
        :edit-message="chatCtx.editMessage"
        :delete-message="chatCtx.deleteMessage"
        :handle-react="chatCtx.handleReact"
        :top-reactions="chatCtx.topReactions"
        :remove-reaction-favorite="chatCtx.removeReactionFavorite"
        :handle-go-to-channel="chatCtx.handleGoToChannel"
        :handle-go-to-message="resolvedHandleGoToMessage"
        :open-member-profile="chatCtx.openMemberProfile"
        :can-moderate-author="chatCtx.canModerateAuthor"
        :handle-moderate-user="chatCtx.handleModerateUser"
        :show-nsfw-chat-gate="chatCtx.showNsfwChatGate"
        :acknowledge-nsfw-channel="chatCtx.acknowledgeNsfwChannel"
        :decline-nsfw-gate="chatCtx.declineNsfwGate"
        :remote-participants="chatCtx.remoteParticipants"
        :lk-room="chatCtx.lkRoom"
        :mirror-local-camera="chatCtx.mirrorLocalCamera"
        :get-local-screen-track="chatCtx.getLocalScreenTrack"
        :get-local-camera-track="chatCtx.getLocalCameraTrack"
        :get-remote-participant-volume="chatCtx.getRemoteParticipantVolume"
        :set-remote-participant-volume="chatCtx.setRemoteParticipantVolume"
        :on-request-fullscreen-stream="chatCtx.onRequestFullscreenStream"
        :vc-activity-ui="chatCtx.vcActivityUi"
        :open-vc-activity-picker="chatCtx.openVcActivityPicker"
        :open-vc-activity-youtube-browse="chatCtx.openVcActivityYoutubeBrowse"
        :open-vc-activity-wordle="chatCtx.openVcActivityWordle"
        :open-vc-activity-hangman="chatCtx.openVcActivityHangman"
        :open-vc-activity-skriggles="chatCtx.openVcActivitySkriggles"
        :open-vc-activity-tic-tac-toe="chatCtx.openVcActivityTicTacToe"
        :vc-hangman-activity="chatCtx.vcHangmanActivity"
        :hangman-roster-user-ids="chatCtx.hangmanRosterUserIds"
        :commit-vc-hangman-word="chatCtx.commitVcHangmanWord"
        :request-vc-hangman-guess-letter="chatCtx.requestVcHangmanGuessLetter"
        :request-vc-hangman-next-round="chatCtx.requestVcHangmanNextRound"
        :vc-skriggles-activity="chatCtx.vcSkrigglesActivity"
        :skriggles-roster-user-ids="chatCtx.skrigglesRosterUserIds"
        :skriggles-canvas-events="chatCtx.skrigglesCanvasEvents"
        :commit-skriggles-word-choice="chatCtx.commitSkrigglesWordChoice"
        :submit-skriggles-guess="chatCtx.submitSkrigglesGuess"
        :update-skriggles-settings="chatCtx.updateSkrigglesSettings"
        :start-skriggles-game="chatCtx.startSkrigglesGame"
        :advance-skriggles-round="chatCtx.advanceSkrigglesRound"
        :publish-skriggles-stroke-batch="chatCtx.publishSkrigglesStrokeBatch"
        :publish-skriggles-canvas-cmd="chatCtx.publishSkrigglesCanvasCmd"
        :publish-skriggles-canvas-snapshot="
          chatCtx.publishSkrigglesCanvasSnapshot
        "
        :tick-skriggles-timers="chatCtx.tickSkrigglesTimers"
        :vc-tic-tac-toe-activity="chatCtx.vcTicTacToeActivity"
        :vc-tic-tac-toe-pending-invite="chatCtx.vcTicTacToePendingInvite"
        :send-vc-tic-tac-toe-challenge="chatCtx.sendVcTicTacToeChallenge"
        :respond-vc-tic-tac-toe-invite="chatCtx.respondVcTicTacToeInvite"
        :dismiss-vc-tic-tac-toe-invite="chatCtx.dismissVcTicTacToeInvite"
        :request-vc-tic-tac-toe-move="chatCtx.requestVcTicTacToeMove"
        :request-vc-tic-tac-toe-rematch="chatCtx.requestVcTicTacToeRematch"
        :vc-codenames-activity="chatCtx.vcCodenamesActivity"
        :codenames-roster-user-ids="chatCtx.codenamesRosterUserIds"
        :vc-codenames-spymaster-key="chatCtx.vcCodenamesSpymasterKey"
        :commit-vc-codenames-deal="chatCtx.commitVcCodenamesDeal"
        :request-vc-codenames-setup="chatCtx.requestVcCodenamesSetup"
        :request-vc-codenames-clue="chatCtx.requestVcCodenamesClue"
        :request-vc-codenames-reveal="chatCtx.requestVcCodenamesReveal"
        :request-vc-codenames-end-turn="chatCtx.requestVcCodenamesEndTurn"
        :request-vc-codenames-new-game="chatCtx.requestVcCodenamesNewGame"
        :request-vc-codenames-push-key-to-orchestrator="
          chatCtx.requestVcCodenamesPushKeyToOrchestrator
        "
        :open-vc-activity-open-guessr="chatCtx.openVcActivityOpenGuessr"
        :open-vc-activity-skribbl-io="chatCtx.openVcActivitySkribblIo"
        :open-vc-activity-gartic-phone="chatCtx.openVcActivityGarticPhone"
        :open-vc-activity-krunker="chatCtx.openVcActivityKrunker"
        :open-vc-activity-codenames="chatCtx.openVcActivityCodenames"
        :open-vc-activity-richup="chatCtx.openVcActivityRichup"
        :open-vc-activity-goober-dash="chatCtx.openVcActivityGooberDash"
        :open-vc-activity-smash-karts="chatCtx.openVcActivitySmashKarts"
        :open-vc-activity-cluster-rush="chatCtx.openVcActivityClusterRush"
        :set-vc-activity-youtube-video="chatCtx.setVcActivityYoutubeVideo"
        :set-vc-youtube-browse-open="chatCtx.setVcYoutubeBrowseOpen"
        :add-vc-youtube-to-queue="chatCtx.addVcYoutubeToQueue"
        :remove-vc-youtube-from-queue="chatCtx.removeVcYoutubeFromQueue"
        :move-vc-youtube-in-queue="chatCtx.moveVcYoutubeInQueue"
        :play-vc-youtube-at-index="chatCtx.playVcYoutubeAtIndex"
        :play-vc-youtube-next="chatCtx.playVcYoutubeNext"
        :play-vc-youtube-previous="chatCtx.playVcYoutubePrevious"
        :close-vc-activity="chatCtx.closeVcActivity"
        :publish-vc-youtube-playback-sync="chatCtx.publishVcYoutubePlaybackSync"
        :vc-youtube-remote-playback="chatCtx.vcYoutubeRemotePlayback"
        :vc-youtube-playback-should-publish="
          chatCtx.vcYoutubePlaybackShouldPublish
        "
        :can-show-discord-channel-import="chatCtx.canShowDiscordChannelImport"
        :guild-vc-muted="!!chatCtx.vcMuted"
        :guild-vc-deafened="!!chatCtx.vcDeafened"
        :guild-vc-video="!!chatCtx.vcVideo"
        :guild-vc-screenshare="!!chatCtx.vcScreenshare"
        :on-guild-vc-muted="chatCtx.onGuildChannelVcMuted"
        :on-guild-vc-deafened="chatCtx.onGuildChannelVcDeafened"
        :on-guild-vc-video="chatCtx.onGuildChannelVcVideo"
        :on-guild-vc-screenshare="chatCtx.onGuildChannelVcScreenshare"
        :on-leave-voice="chatCtx.handleChannelVoicePanelLeave"
        :channel-panel-collapsed="chatCtx.channelPanelCollapsed"
        :expand-channels="chatCtx.expandChannels"
        :on-mobile-back-to-channels="chatCtx.expandChannels"
        :focus-guild-voice-channel-in-sidebar="
          chatCtx.focusGuildVoiceChannelInSidebar
        "
        :join-voice-channel="chatCtx.joinVoiceChannel"
      />
      <AppLayoutPaperSection
        v-else-if="chatCtx.mainSurface.type === 'serverPaper'"
        :main-surface="chatCtx.mainSurface"
        :selected-server-id="chatCtx.selectedServerId"
        :users="chatCtx.users"
        :effective-active-channel="chatCtx.effectiveActiveChannel"
      />
      <AppLayoutForumSection
        v-else-if="chatCtx.mainSurface.type === 'serverForum'"
        :main-surface="chatCtx.mainSurface"
        :selected-server-id="chatCtx.selectedServerId"
        :users="chatCtx.users"
        :mention-users="chatCtx.usersForMentionAutocomplete"
        :all-channels="allChannelsForDm"
        :effective-active-channel="chatCtx.effectiveActiveChannel"
        :active-channel-messages-map="chatCtx.activeChannelMessagesMap"
        :send-message="chatCtx.sendMessage"
        :on-request-forward="chatCtx.onRequestForward"
        :on-poll-vote="chatCtx.handlePollVote"
        :on-save-edit="chatCtx.editMessage"
        :on-delete="chatCtx.deleteMessage"
        :on-react="chatCtx.handleReact"
        :on-go-to-channel="chatCtx.handleGoToChannel"
        :on-go-to-message="resolvedHandleGoToMessage"
        :on-open-profile="chatCtx.openMemberProfile"
        :on-open-profile-from-context-menu="chatCtx.openProfileFromContextMenu"
        :can-moderate-author="chatCtx.canModerateAuthor"
        :on-moderate-user="chatCtx.handleModerateUser"
        :resolve-author-role="chatCtx.resolveAuthorRole"
        :show-nsfw-gate="chatCtx.showNsfwChatGate"
        :on-nsfw-acknowledge="chatCtx.acknowledgeNsfwChannel"
        :on-nsfw-decline="chatCtx.declineNsfwGate"
        :can-show-discord-channel-import="chatCtx.canShowDiscordChannelImport"
        :on-open-explore="chatCtx.onOpenExplore"
        :transition-loading="chatCtx.surfaceSwitchLoading"
        :forum-posts-by-forum-id="chatCtx.forumPostsByForumId"
        :forum-posts-loading-by-forum-id="chatCtx.forumPostsLoadingByForumId"
        :forum-posts-error-by-forum-id="chatCtx.forumPostsErrorByForumId"
        :refresh-forum-posts="chatCtx.refreshForumPosts"
        :create-forum-post="chatCtx.createForumPost"
        :patch-forum-post="chatCtx.patchForumPost"
        :can-manage-forum-posts="!!chatCtx.canManageForumPosts"
        :current-user-id="chatCtx.currentUser?.id ?? ''"
        :linked-discord-user-id="chatCtx.linkedDiscordUserId ?? null"
        :top-reactions="chatCtx.topReactions"
        :remove-reaction-favorite="chatCtx.removeReactionFavorite"
      />
      <div v-else class="flex min-h-0 min-w-0 flex-1 flex-col">
        <AppLayoutDmSection
          :main-surface="chatCtx.mainSurface"
          :call-overlay="chatCtx.callOverlay"
          :is-dm-panel-open="chatCtx.isDMPanelOpen"
          :is-dm-ui-context="chatCtx.isDmUiContext"
          :dm-active-tab="chatCtx.dmActiveTab"
          :users="chatCtx.users"
          :mention-users="chatCtx.usersForMentionAutocomplete"
          :current-user-id="chatCtx.currentUser?.id ?? ''"
          :current-user-name="chatCtx.currentUser?.name"
          :current-user-pfp="chatCtx.currentUser?.pfp"
          :linked-discord-user-id="chatCtx.linkedDiscordUserId ?? null"
          :friend-ids="chatCtx.friendIds"
          :friend-requests-incoming="chatCtx.friendRequestsIncoming"
          :friend-requests-outgoing="chatCtx.friendRequestsOutgoing"
          :selected-dm-user-id="chatCtx.selectedDMUserId"
          :message-requests="chatCtx.messageRequests"
          :selected-message-request-id="chatCtx.selectedMessageRequestId"
          :messages="chatCtx.messages"
          :echo-peer-by-channel-id="chatCtx.echoDmPeerByChannelId"
          :send-message="chatCtx.sendMessage"
          :on-request-forward="chatCtx.onRequestForward"
          :select-dm="chatCtx.selectDM"
          :accept-friend-request="chatCtx.acceptFriendRequest"
          :decline-friend-request="chatCtx.declineFriendRequest"
          :cancel-friend-request="chatCtx.cancelFriendRequest"
          :send-friend-request="chatCtx.sendFriendRequest"
          :ignore-message-request="chatCtx.ignoreMessageRequest"
          :handle-accept-message-request="chatCtx.handleAcceptMessageRequest"
          :return-from-message-requests="chatCtx.returnFromMessageRequests"
          :dm-mention-notifications="chatCtx.dmMentionNotifications"
          :dm-notification-read-state-by-channel-id="
            chatCtx.dmNotificationReadStateByChannelId
          "
          :mention-notification-categories-by-server="
            chatCtx.mentionNotificationCategoriesByServer
          "
          :mention-notification-servers="chatCtx.mentionNotificationServers"
          :dm-notifications-read-preset="chatCtx.dmNotificationsReadPreset"
          :dm-notifications-source-key="chatCtx.dmNotificationsSourceKey"
          :on-update-dm-notifications-read-preset="
            chatCtx.onUpdateDmNotificationsReadPreset
          "
          :on-update-dm-notifications-source-key="
            chatCtx.onUpdateDmNotificationsSourceKey
          "
          :is-persisted-echo-dm-thread="chatCtx.isPersistedEchoDmThread"
          :on-open-mention-notification="chatCtx.onOpenMentionNotification"
          :on-mark-mention-notification-read="
            chatCtx.onMarkMentionNotificationRead
          "
          :is-in-dm-mode="chatCtx.isInDMMode"
          :is-group-dm="chatCtx.isGroupDM"
          :dm-partner-user="chatCtx.dmPartnerUser"
          :active-group-dm="chatCtx.activeGroupDM"
          :active-group-call-members="chatCtx.activeGroupCallMembers"
          :dm-call-with-user-id="chatCtx.dmCallWithUserId"
          :dm-call-ringing="chatCtx.dmCallRinging"
          :dm-call-awaiting-accept="chatCtx.dmCallAwaitingAccept"
          :dm-call-ring-ui="chatCtx.dmCallRingUi"
          :dm-call-lobby-after-self-leave="chatCtx.dmCallLobbyAfterSelfLeave"
          :dm-call-incoming="chatCtx.dmCallIncoming"
          :dm-call-ring-remote-vanishing="chatCtx.dmCallRingRemoteVanishing"
          :dm-call-muted="chatCtx.dmCallMuted"
          :dm-call-deafened="chatCtx.dmCallDeafened"
          :dm-call-video="chatCtx.dmCallVideo"
          :dm-call-screenshare="chatCtx.dmCallScreenshare"
          :dm-call-fullscreen="chatCtx.dmCallFullscreen"
          :end-dm-call="chatCtx.endDmCall"
          :leave-dm-call-voice="chatCtx.leaveDmCallVoice"
          :rejoin-dm-call-voice="chatCtx.rejoinDmCallVoice"
          :answer-dm-call="chatCtx.answerDmCall"
          :decline-dm-call="chatCtx.declineDmCall"
          :on-toggle-dm-call-muted="chatCtx.onToggleDmCallMuted"
          :on-toggle-dm-call-deafened="chatCtx.onToggleDmCallDeafened"
          :on-toggle-dm-call-video="chatCtx.onToggleDmCallVideo"
          :on-toggle-dm-call-screenshare="chatCtx.onToggleDmCallScreenshare"
          :on-set-dm-call-fullscreen="chatCtx.onSetDmCallFullscreen"
          :dm-call-call-view-participants="chatCtx.dmCallCallViewParticipants"
          :vc-remote-participants="chatCtx.remoteParticipants"
          :live-kit-room="chatCtx.lkRoom"
          :mirror-local-camera="chatCtx.mirrorLocalCamera"
          :get-local-screen-track="chatCtx.getLocalScreenTrack"
          :get-local-camera-track="chatCtx.getLocalCameraTrack"
          :get-remote-participant-volume="chatCtx.getRemoteParticipantVolume"
          :set-remote-participant-volume="chatCtx.setRemoteParticipantVolume"
          :on-request-dm-call-fullscreen-stream="
            chatCtx.onRequestFullscreenStream
          "
          :effective-active-channel="chatCtx.effectiveActiveChannel"
          :active-channel-messages-map="chatCtx.activeChannelMessagesMap"
          :all-channels="allChannelsForDm"
          :selected-server-id="chatCtx.selectedServerId"
          :pinned-message-ids-for-current-channel="
            chatCtx.pinnedMessageIdsForCurrentChannel
          "
          :handle-pin-message="chatCtx.handlePinMessage"
          :handle-unpin-message="chatCtx.handleUnpinMessage"
          :handle-poll-vote="chatCtx.handlePollVote"
          :edit-message="chatCtx.editMessage"
          :delete-message="chatCtx.deleteMessage"
          :handle-react="chatCtx.handleReact"
          :top-reactions="chatCtx.topReactions"
          :remove-reaction-favorite="chatCtx.removeReactionFavorite"
          :handle-go-to-channel="chatCtx.handleGoToChannel"
          :handle-go-to-message="resolvedHandleGoToMessage"
          :open-member-profile="chatCtx.openMemberProfile"
          :open-profile-from-context-menu="chatCtx.openProfileFromContextMenu"
          :can-moderate-author="chatCtx.canModerateAuthor"
          :handle-moderate-user="chatCtx.handleModerateUser"
          :resolve-author-role="chatCtx.resolveAuthorRole"
          :show-nsfw-chat-gate="chatCtx.showNsfwChatGate"
          :acknowledge-nsfw-channel="chatCtx.acknowledgeNsfwChannel"
          :decline-nsfw-gate="chatCtx.declineNsfwGate"
          :on-open-explore="chatCtx.onOpenExplore"
          :dm-thread-switch-loading="chatCtx.dmThreadSwitchLoading"
          :can-show-discord-channel-import="chatCtx.canShowDiscordChannelImport"
          :dm-call-can-answer-incoming="
            chatCtx.currentUser ? !chatCtx.currentUser.isGuest : true
          "
          :suppress-embedded-duplicate-call-ui="
            suppressDmCallEmbeddedDuplicateCallUi
          "
          :dm-call-matches-active-channel="chatCtx.dmCallMatchesActiveChannel"
          :active-dm-thread-call-ui="chatCtx.activeDmThreadCallUi"
          :header-overlay-inset-px="shellHeaderOverlayInsetPx"
          :on-open-voice-audio-settings="
            chatCtx.onChannelOpenVoiceAudioSettings
          "
          :on-mobile-back-to-channels="chatCtx.expandChannels"
          :open-expanded-profile-panel-for-user-id="
            chatCtx.openExpandedProfilePanelForUserId
          "
          :open-extended-profile-modal-for-user-id="
            chatCtx.openExtendedProfileModalForUserId
          "
        />
      </div>
    </div>

    <GuildVoiceFloatingSpeakerPill />
    <GuildVoiceStreamPip />

    <AppLayoutDmSidePanel
      :profile-surface-adapter="chatCtx.profileSurfaceAdapter"
      :is-visible="
        chatCtx.isInDMChat &&
        ((chatCtx.isExpandedProfileSidePanel &&
          chatCtx.isExpandedProfileModalOpen) ||
          chatCtx.isGroupOverviewOpen)
      "
      :presence-by-user-id="chatCtx.presenceByUserId"
      :presence-mobile-by-user-id="chatCtx.presenceMobileByUserId"
      :current-user-id="chatCtx.currentUser?.id"
      :is-expanded-profile-side-panel="chatCtx.isExpandedProfileSidePanel"
      :is-expanded-profile-modal-open="chatCtx.isExpandedProfileModalOpen"
      :expanded-profile="chatCtx.expandedProfile"
      :is-expanded-profile-friend="chatCtx.isExpandedProfileFriend"
      :is-expanded-profile-outgoing-request="
        chatCtx.isExpandedProfileOutgoingRequest
      "
      :friendship-known="chatCtx.friendshipKnown"
      :friend-ids="chatCtx.friendIds ?? []"
      :friend-ids-by-user-id="chatCtx.friendIdsByUserId ?? {}"
      :friend-requests-incoming="chatCtx.friendRequestsIncoming ?? []"
      :friend-requests-outgoing="chatCtx.friendRequestsOutgoing ?? []"
      :blocked-user-ids="chatCtx.blockedUserIds ?? []"
      :expanded-profile-note="chatCtx.expandedProfileNote"
      :active-group-dm="chatCtx.activeGroupDM"
      :active-group-call-members="chatCtx.activeGroupCallMembers"
      :is-group-overview-open="chatCtx.isGroupOverviewOpen"
      :on-update-expanded-profile-note="chatCtx.onUpdateExpandedProfileNote"
      :on-expanded-profile-modal-update="chatCtx.onExpandedProfileModalUpdate"
      :on-expanded-profile-open-server="chatCtx.handleExpandedProfileOpenServer"
      :on-expanded-profile-open-profile="
        chatCtx.handleExpandedProfileOpenProfile
      "
      :on-expand-dm-profile-to-full-modal="chatCtx.expandDmProfileToFullModal"
      :on-expanded-profile-open-dm="chatCtx.handleExpandedProfileOpenDM"
      :on-expanded-profile-send-friend-request="
        chatCtx.handleExpandedProfileSendFriendRequest
      "
      :on-expanded-profile-cancel-outgoing-friend-request="
        chatCtx.handleExpandedProfileCancelOutgoingFriendRequest
      "
      :on-expanded-profile-accept-incoming-friend-request="
        chatCtx.handleExpandedProfileAcceptIncomingFriendRequest
      "
      :on-expanded-profile-decline-incoming-friend-request="
        chatCtx.handleExpandedProfileDeclineIncomingFriendRequest
      "
      :on-expanded-profile-remove-friend="
        chatCtx.handleExpandedProfileRemoveFriend
      "
      :is-expanded-profile-target-blocked="
        chatCtx.isExpandedProfileTargetBlocked
      "
      :guest-friends-locked="chatCtx.guestFriendsLocked"
      :on-profile-block-user="chatCtx.handleProfileBlockUser"
      :on-profile-unblock-user="chatCtx.handleProfileUnblockUser"
      :on-profile-report-user="chatCtx.handleProfileReportUser"
      :on-close-group-overview="chatCtx.onCloseGroupOverview"
      :on-edit-group-avatar="() => chatCtx.openGroupSettingsFromHeader('icon')"
      :on-edit-group-name="() => chatCtx.openGroupSettingsFromHeader('name')"
      :on-rename-group-from-overview="
        (name: string) =>
          chatCtx.handleUpdateGroupFromSettings(
            {
              name,
              pfp: chatCtx.activeGroupDM?.pfp ?? '',
            },
            chatCtx.activeGroupDM?.id ?? null,
          )
      "
      :on-add-group-members="
        () =>
          chatCtx.openGroupDMModal({
            targetGroupId: chatCtx.activeGroupDM?.id ?? undefined,
            preselectedIds: (chatCtx.activeGroupDM?.memberIds ?? []).filter(
              (id: string) => id !== chatCtx.currentUser?.id,
            ),
            lockedIds: (chatCtx.activeGroupDM?.memberIds ?? []).filter(
              (id: string) => id !== chatCtx.currentUser?.id,
            ),
          })
      "
      :on-kick-group-dm-member="chatCtx.handleKickGroupDmMember"
    />
  </div>
</template>

<style scoped lang="scss">
.app-layout-surface-loading {
  background: var(--overlay-subtle);
}

.app-layout-surface-loading__bar {
  background: var(--accent);
  animation: app-layout-surface-loading-slide 950ms ease-in-out infinite;
}

@keyframes app-layout-surface-loading-slide {
  0% {
    transform: translateX(-120%);
  }
  60% {
    transform: translateX(220%);
  }
  100% {
    transform: translateX(220%);
  }
}
</style>
