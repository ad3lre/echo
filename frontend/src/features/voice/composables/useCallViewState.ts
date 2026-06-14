import type {
  CallViewParticipant,
  CallViewProps,
  VcModerateAction,
} from '@/features/voice/composables/callViewTypes';
import {
  STREAM_QUALITY_LABELS,
  STREAM_QUALITY_ORDER,
  dmCallPresenceLabel,
} from '@/features/voice/composables/callViewTypes';
import { useCallViewMediaTiles } from '@/features/voice/composables/useCallViewMediaTiles';
import { useCallViewStreamQuality } from '@/features/voice/composables/useCallViewStreamQuality';
import {
  useCallViewContextMenuOpen,
  useCallViewMenuMention,
  useCallViewMenuModeration,
  useCallViewMenuState,
  useCallViewMenuStreamQuality,
  useCallViewMenuVolume,
} from '@/features/voice/composables/useCallViewParticipantMenu';

export type { CallViewParticipant, CallViewProps, VcModerateAction };

type StreamQualityDeps = ReturnType<typeof useCallViewStreamQuality>;

function menuDepsFromStreamQuality(streamQuality: StreamQualityDeps) {
  return {
    callMenuStreamQuality: streamQuality.callMenuStreamQuality,
    getParticipantVideoPublication:
      streamQuality.getParticipantVideoPublication,
    setParticipantStreamQuality: streamQuality.setParticipantStreamQuality,
    streamLayerManualByParticipantId:
      streamQuality.streamLayerManualByParticipantId,
  };
}

export function useCallViewState(props: CallViewProps) {
  const media = useCallViewMediaTiles(props);
  const streamQuality = useCallViewStreamQuality(props);
  const menuState = useCallViewMenuState(props);
  const mention = useCallViewMenuMention(menuState);
  const volume = useCallViewMenuVolume(props, menuState);
  const moderation = useCallViewMenuModeration(props, menuState);
  const menuDeps = menuDepsFromStreamQuality(streamQuality);
  const menuQuality = useCallViewMenuStreamQuality(menuState, menuDeps);
  const contextMenu = useCallViewContextMenuOpen(
    props,
    menuState,
    menuDeps,
    mention.canQuickMentionFromCallMenu,
    moderation.vcModSectionVisible,
    volume.callMenuHasVolumeControl,
  );
  const onParticipantAvatarDblClick = (p: CallViewParticipant) => {
    if (p.streaming || p.video) streamQuality.handleRequestFullscreen(p.id);
  };

  return {
    STREAM_QUALITY_LABELS,
    STREAM_QUALITY_ORDER,
    dmCallPresenceLabel,
    onParticipantAvatarDblClick,
    ...media,
    ...streamQuality,
    ...menuState,
    ...mention,
    ...volume,
    ...moderation,
    ...menuQuality,
    ...contextMenu,
  };
}
