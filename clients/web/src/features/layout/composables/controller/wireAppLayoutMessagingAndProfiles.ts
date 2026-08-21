import { defineAsyncComponent } from 'vue';
import { buildAppLayoutExpose } from './useAppLayoutController.expose';
import { assembleAppLayoutControllerContext } from './assembleAppLayoutControllerContext';
import {
  buildAppLayoutAssemblyDeps,
  type WireAppLayoutAssemblyInput,
} from './buildAppLayoutAssemblyDeps';
import { useAppLayoutWorkspaceReadyComputed } from '../workspace/useAppLayoutWorkspaceReadyComputed';
import { useAppLayoutMessagingProfilesSetup } from './useAppLayoutMessagingProfilesSetup';
import { useAppLayoutMessagingSearchSetup } from '../messaging/useAppLayoutMessagingSearchSetup';
import { useAppLayoutMessagingForwardAddServer } from '../messaging/useAppLayoutMessagingForwardAddServer';
import { useAppLayoutMessagingActionsInbox } from '../messaging/useAppLayoutMessagingActionsInbox';
import { useAppLayoutMessagingGroupDmChrome } from '../dm/useAppLayoutMessagingGroupDmChrome';
import { useAppLayoutMessagingSurfaceAdapters } from '../messaging/useAppLayoutMessagingSurfaceAdapters';
import type { WireAppLayoutVoiceAndRealtimeResult } from './wireAppLayoutVoiceAndRealtime';

const ExploreView = defineAsyncComponent(
  () => import('@/features/layout/components/ExploreView.vue'),
);

function mergeMessagingAssemblyInput(
  phase2: WireAppLayoutVoiceAndRealtimeResult,
  parts: {
    profiles: ReturnType<typeof useAppLayoutMessagingProfilesSetup>;
    search: ReturnType<typeof useAppLayoutMessagingSearchSetup>;
    sendMessage: WireAppLayoutVoiceAndRealtimeResult['sendMessageViaSocket'];
    workspaceReady: ReturnType<typeof useAppLayoutWorkspaceReadyComputed>;
    forwardAdd: ReturnType<typeof useAppLayoutMessagingForwardAddServer>;
    actionsInbox: ReturnType<typeof useAppLayoutMessagingActionsInbox>;
    groupDmChrome: ReturnType<typeof useAppLayoutMessagingGroupDmChrome>;
  },
): WireAppLayoutAssemblyInput {
  return {
    ...phase2,
    ...parts.profiles.assembly,
    ...parts.search.assembly,
    socketSendMessage: parts.sendMessage,
    sendMessage: parts.sendMessage,
    workspaceReady: parts.workspaceReady,
    ...parts.forwardAdd.assembly,
    ...parts.actionsInbox.assembly,
    ...parts.groupDmChrome.assembly,
    ExploreView,
  } as WireAppLayoutAssemblyInput;
}

export function wireAppLayoutMessagingAndProfiles(
  phase2: WireAppLayoutVoiceAndRealtimeResult,
) {
  const profiles = useAppLayoutMessagingProfilesSetup(phase2);
  const search = useAppLayoutMessagingSearchSetup(phase2, {
    memberListUsers: profiles.memberListUsers,
  });
  const sendMessage = phase2.sendMessageViaSocket;
  const workspaceReady = useAppLayoutWorkspaceReadyComputed(
    phase2.workspace.loading,
  );
  const forwardAdd = useAppLayoutMessagingForwardAddServer(phase2, {
    sendMessage,
  });
  const actionsInbox = useAppLayoutMessagingActionsInbox(phase2, {
    clearSearch: search.clearSearch,
  });
  const groupDmChrome = useAppLayoutMessagingGroupDmChrome(phase2, {
    clearSearch: search.clearSearch,
  });
  const context = assembleAppLayoutControllerContext(
    buildAppLayoutAssemblyDeps(
      mergeMessagingAssemblyInput(phase2, {
        profiles,
        search,
        sendMessage,
        workspaceReady,
        forwardAdd,
        actionsInbox,
        groupDmChrome,
      }),
    ),
  );
  const adapters = useAppLayoutMessagingSurfaceAdapters(phase2, {
    profiles,
    groupDmActions: groupDmChrome.groupDmActions,
    handleExpandedProfileOpenServer: forwardAdd.handleExpandedProfileOpenServer,
  });
  return Object.assign(buildAppLayoutExpose(context), adapters);
}
