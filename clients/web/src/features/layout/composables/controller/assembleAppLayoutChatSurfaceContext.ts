import type { AppLayoutChatSurfaceProvideDeps } from '@/features/layout/composables/messaging/useAppLayoutChatSurfaceProvide';
import type { useForumPostsController } from '@/features/layout/composables/controller/useForumPostsController';
import type { LayoutChatSurfaceContext } from '@/features/layout/layoutInjectionKeys';
import {
  assembleChatSurfaceDmCall,
  assembleChatSurfaceFindChannel,
  assembleChatSurfaceHeaderSearch,
  assembleChatSurfaceMessages,
  assembleChatSurfaceProfile,
  assembleChatSurfaceShell,
  assembleChatSurfaceSocial,
} from '@/features/layout/composables/controller/assembleAppLayoutChatSurfaceSlices';
import {
  assembleChatSurfaceActivity,
  assembleChatSurfaceForum,
  assembleChatSurfaceLiveKit,
  assembleChatSurfaceWatchMedia,
} from '@/features/layout/composables/voice/assembleAppLayoutChatSurfaceVoice';

type ChatSurfaceDerived = {
  surfaceSwitchLoading: LayoutChatSurfaceContext['surfaceSwitchLoading'];
  dmThreadSwitchLoading: LayoutChatSurfaceContext['dmThreadSwitchLoading'];
  currentUser: LayoutChatSurfaceContext['currentUser'];
  getChannelDisplayName: (name?: string) => string;
};

export function assembleAppLayoutChatSurfaceContext(
  deps: AppLayoutChatSurfaceProvideDeps,
  derived: ChatSurfaceDerived,
  forum: ReturnType<typeof useForumPostsController>,
): LayoutChatSurfaceContext {
  return {
    ...assembleChatSurfaceShell(deps, derived),
    ...assembleChatSurfaceHeaderSearch(deps, derived),
    ...assembleChatSurfaceDmCall(deps, derived),
    ...assembleChatSurfaceMessages(deps),
    ...assembleChatSurfaceSocial(deps),
    ...assembleChatSurfaceProfile(deps),
    ...assembleChatSurfaceLiveKit(deps),
    ...assembleChatSurfaceActivity(deps),
    ...assembleChatSurfaceWatchMedia(deps),
    ...assembleChatSurfaceForum(deps, forum),
    ...assembleChatSurfaceFindChannel(deps),
  } as LayoutChatSurfaceContext;
}
