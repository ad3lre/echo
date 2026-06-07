import {
  computed,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  type ComputedRef,
  type Ref,
} from 'vue';
import { clampMenuToViewport } from '@/features/chat/composables/useContextMenuPosition';
import {
  COMPOSER_INSERT_USER_MENTION_KEY,
  type InsertUserMentionFn,
} from '@/features/chat/chatComposerContext';
import type {
  CallViewParticipant,
  CallViewProps,
  RemoteTrackPublicationLike,
  StreamQuality,
  VcModerateAction,
} from '@/components/callViewTypes';
import { liveKitValueToStreamQuality } from '@/components/callViewTypes';

type ParticipantMenuState = ReturnType<typeof useCallViewMenuState>;

type ParticipantMenuDeps = {
  callMenuStreamQuality: Ref<StreamQuality>;
  getParticipantVideoPublication: (
    p: CallViewParticipant | null,
  ) => RemoteTrackPublicationLike | null;
  setParticipantStreamQuality: (
    p: CallViewParticipant | null | undefined,
    quality: StreamQuality,
  ) => void;
  streamLayerManualByParticipantId: Ref<Record<string, true>>;
};

function menuContainsEventTarget(menuEl: HTMLElement, e: MouseEvent): boolean {
  const path = e.composedPath();
  if (path.includes(menuEl)) return true;
  return path.some((n) => n instanceof Node && menuEl.contains(n));
}

function reclampMenuAfterRender(state: ParticipantMenuState) {
  void nextTick(() => {
    requestAnimationFrame(() => {
      const el = state.vcMenuRef.value;
      if (!el) return;
      const r = el.getBoundingClientRect();
      state.vcMenuPos.value = clampMenuToViewport(
        r.left,
        r.top,
        r.width,
        r.height,
      );
    });
  });
}

export function useCallViewMenuState(props: CallViewProps) {
  const vcMenuOpenForId = ref<string | null>(null);
  const vcMenuPos = ref({ left: 0, top: 0 });
  const vcMenuRef = ref<HTMLElement | null>(null);
  const vcMenuVolumeDraft = ref(100);
  const vcModerationTarget = computed(
    () =>
      props.participants.find((x) => x.id === vcMenuOpenForId.value) ?? null,
  );
  const closeVcMenu = () => {
    vcMenuOpenForId.value = null;
  };
  const onDocumentPointerDown = (e: MouseEvent) => {
    const menuEl = vcMenuRef.value;
    if (menuEl && menuContainsEventTarget(menuEl, e)) return;
    closeVcMenu();
  };

  onMounted(() => {
    document.addEventListener('mousedown', onDocumentPointerDown, true);
  });
  onUnmounted(() => {
    document.removeEventListener('mousedown', onDocumentPointerDown, true);
  });

  return {
    closeVcMenu,
    vcMenuOpenForId,
    vcMenuPos,
    vcMenuRef,
    vcMenuVolumeDraft,
    vcModerationTarget,
  };
}

export function useCallViewMenuMention(state: ParticipantMenuState) {
  const composerInsertUserMention =
    inject<Ref<InsertUserMentionFn | null> | null>(
      COMPOSER_INSERT_USER_MENTION_KEY,
      null,
    );
  const canQuickMentionFromCallMenu = computed(
    () => !!composerInsertUserMention?.value,
  );
  const mentionParticipantFromCallMenu = () => {
    const p = state.vcModerationTarget.value;
    const fn = composerInsertUserMention?.value;
    if (!p || !fn) return;
    state.closeVcMenu();
    fn({ userId: p.id, displayName: p.name });
  };
  return { canQuickMentionFromCallMenu, mentionParticipantFromCallMenu };
}

export function useCallViewMenuVolume(
  props: CallViewProps,
  state: ParticipantMenuState,
) {
  const callMenuHasVolumeControl = () =>
    typeof props.setRemoteParticipantVolume === 'function';
  const remoteStreamVolumeEnabled = (participantId: string | undefined) =>
    !!participantId &&
    typeof props.setRemoteParticipantVolume === 'function' &&
    participantId !== props.currentUserId;
  const remoteStreamVolumePercent = (participantId: string | undefined) =>
    participantId
      ? (props.getRemoteParticipantVolume?.(participantId) ?? 100)
      : 100;
  const onRemoteStreamVolume = (participantId: string, v: number) => {
    props.setRemoteParticipantVolume?.(participantId, v);
  };
  const onRemoteVideoPlaybackWired = (participantId: string) => {
    const id = participantId.trim();
    if (!id || !props.setRemoteParticipantVolume) return;
    props.setRemoteParticipantVolume(
      id,
      props.getRemoteParticipantVolume?.(id) ?? 100,
    );
  };
  const onCallMenuVolumeInput = (e: Event) => {
    const id = state.vcMenuOpenForId.value;
    const fn = props.setRemoteParticipantVolume;
    if (!id || !fn) return;
    const v = Number((e.target as HTMLInputElement).value);
    if (!Number.isFinite(v)) return;
    state.vcMenuVolumeDraft.value = v;
    fn(id, v);
  };
  return {
    callMenuHasVolumeControl,
    onCallMenuVolumeInput,
    onRemoteStreamVolume,
    onRemoteVideoPlaybackWired,
    remoteStreamVolumeEnabled,
    remoteStreamVolumePercent,
  };
}

export function useCallViewMenuModeration(
  props: CallViewProps,
  state: ParticipantMenuState,
) {
  const vcModAllowed = (userId: string, action: VcModerateAction) => {
    if (props.canVcModerateParticipantAction) {
      return props.canVcModerateParticipantAction(userId, action);
    }
    return props.canModerateParticipant?.(userId) ?? false;
  };
  const vcModSectionVisible = (userId: string) => {
    if (!props.canVcModerateParticipantAction) {
      return props.canModerateParticipant?.(userId) ?? false;
    }
    return (
      vcModAllowed(userId, 'serverMute') ||
      vcModAllowed(userId, 'serverDeafen') ||
      vcModAllowed(userId, 'disconnect') ||
      vcModAllowed(userId, 'stopCamera') ||
      vcModAllowed(userId, 'stopScreenShare')
    );
  };
  const emitVcModerate = (action: VcModerateAction, targetUserId: string) => {
    props.onVcModerate?.({
      action,
      targetUserId,
      contextVoiceChannelId: props.voiceModerationChannelId ?? undefined,
    });
    state.closeVcMenu();
  };
  return { emitVcModerate, vcModAllowed, vcModSectionVisible };
}

export function useCallViewMenuStreamQuality(
  state: ParticipantMenuState,
  deps: ParticipantMenuDeps,
) {
  const selectCallMenuStreamQuality = (q: StreamQuality) => {
    deps.callMenuStreamQuality.value = q;
    const id = state.vcMenuOpenForId.value;
    if (id) {
      deps.streamLayerManualByParticipantId.value = {
        ...deps.streamLayerManualByParticipantId.value,
        [id]: true,
      };
    }
    deps.setParticipantStreamQuality(state.vcModerationTarget.value, q);
  };
  return {
    selectCallMenuStreamQuality,
  };
}

export function useCallViewContextMenuOpen(
  props: CallViewProps,
  state: ParticipantMenuState,
  deps: ParticipantMenuDeps,
  canQuickMentionFromCallMenu: ComputedRef<boolean>,
  vcModSectionVisible: (userId: string) => boolean,
  callMenuHasVolumeControl: () => boolean,
) {
  const onTileContextMenu = (p: CallViewParticipant, e: MouseEvent) => {
    e.preventDefault();
    if (p.id === props.currentUserId) return;
    const hasStreamQuality = !!deps.getParticipantVideoPublication(p);
    if (
      !vcModSectionVisible(p.id) &&
      !canQuickMentionFromCallMenu.value &&
      !callMenuHasVolumeControl() &&
      !hasStreamQuality
    ) {
      return;
    }
    state.vcMenuVolumeDraft.value =
      props.getRemoteParticipantVolume?.(p.id) ?? 100;
    deps.callMenuStreamQuality.value = liveKitValueToStreamQuality(
      deps.getParticipantVideoPublication(p)?.videoQuality,
    );
    state.vcMenuPos.value = clampMenuToViewport(e.clientX, e.clientY, 240, 360);
    state.vcMenuOpenForId.value = p.id;
    reclampMenuAfterRender(state);
  };
  return { onTileContextMenu };
}
