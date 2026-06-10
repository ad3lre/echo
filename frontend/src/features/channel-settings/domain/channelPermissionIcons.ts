import type { ChannelPermissionKey } from '@shared/types';
import { icons } from '@/assets/icons';
import iconCalendar from '@/assets/icons/calendar.svg?url';
import iconChartBar from '@/assets/icons/math-chart-bar.svg?url';
import iconHand from '@/assets/icons/USER-AVATAR-IN-HAND.svg?url';
import iconVideoCamera from '@/assets/icons/video-camera.svg?url';
import iconWireless from '@/assets/icons/wireless-symbol.svg?url';

const CHANNEL_PERMISSION_ICON_URLS: Record<ChannelPermissionKey, string> = {
  viewChannel: icons.profileView,
  manageChannel: icons.settings,
  managePermissions: icons.sliders,
  manageWebhooks: iconWireless,
  createInvite: icons.friendAdd,
  sendMessages: icons.message,
  embedLinks: icons.globe,
  attachFiles: icons.file,
  addReactions: icons.emotes,
  useExternalEmoji: icons.emotes,
  useExternalStickers: icons.sparkle,
  mentionEveryone: icons.community,
  manageMessages: icons.pen,
  readMessageHistory: icons.list,
  sendTTS: icons.volumeUp,
  useApplicationCommands: icons.laptopCode,
  createPolls: iconChartBar,
  sendVoiceMessages: icons.mic,
  pinMessages: icons.thumbtack,
  bypassSlowmode: icons.stopwatch,
  useExternalApps: icons.puzzle,
  sendMessagesInThreads: icons.messageAlt,
  createPublicThreads: icons.community,
  createPrivateThreads: icons.chatLock,
  manageThreads: icons.messageAlt,
  connect: icons.phoneCall,
  speak: icons.mic,
  video: iconVideoCamera,
  muteMembers: icons.notificationsOff,
  deafenMembers: icons.headphones,
  moveMembers: icons.usersAvatar,
  useVoiceActivity: icons.volumeUp,
  prioritySpeaker: icons.crown,
  stream: icons.stream,
  useEmbeddedActivities: icons.puzzle,
  requestToSpeak: iconHand,
  manageEvents: iconCalendar,
  createEvents: iconCalendar,
  useSoundboard: icons.musicNote,
  useExternalSounds: icons.musicNote,
  commentOnPaper: icons.message,
};

export function channelPermissionIconUrl(key: ChannelPermissionKey): string {
  return CHANNEL_PERMISSION_ICON_URLS[key] ?? icons.sliders;
}
