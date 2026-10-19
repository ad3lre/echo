/**
 * Shell / AppLayout cold-path icons only.
 *
 * Import this from sync layout chrome (rail, toast, members, assembly deps) so the
 * full SVG barrel in `icons.ts` (channel heuristics, composer, settings glyphs) stays
 * off modules that do not need it. Chat / settings / channel-icon resolve keep using
 * `@/assets/icons`.
 */
import { iconEcho, iconEchoRounded } from './branding';
import iconHashtag from './icons/hashtag.svg?url';
import iconVolumeUp from './icons/volume up.svg?url';
import iconUsersAvatar from './icons/Users avatar.svg?url';
import iconMic from './icons/mic.svg?url';
import iconHeadphones from './icons/headphones.svg?url';
import iconPhoneCall from './icons/phone-call.svg?url';
import iconSettings from './icons/settings.svg?url';
import iconPlus from './icons/plus.svg?url';
import iconLogIn from './icons/log in.svg?url';
import iconList from './icons/list.svg?url';
import iconArrowLeft from './icons/arrow-left-straight.svg?url';
import iconSearch from './icons/SEARCH-NORMAL.svg?url';
import iconMessage from './icons/message.svg?url';
import iconMessageFilled from './icons/message-filled.svg?url';
import iconMessageAlt from './icons/MESSAGE-STYLED-RIGHT-ALIGNMENT-SEMI.svg?url';
import iconMore from './icons/more information.svg?url';
import iconMoreVertical from './icons/MORE-INFORMATION-DOTS-SEPERATED-VERTICALLY.svg?url';
import iconFriendAdd from './icons/USER-AVATAR-PLUSSY.svg?url';
import iconFriendAdded from './icons/USER-AVATAR-CORRECT.svg?url';
import iconCameraOn from './icons/camera-on.svg?url';
import iconDesktop from './icons/desktop.svg?url';
import iconStream from './icons/stream.svg?url';
import iconLogOut from './icons/log out.svg?url';
import iconExplore from './icons/rocket-outline.svg?url';
import iconExploreFilled from './icons/rocket-filled.svg?url';
import iconCommunity from './icons/multiple-users-silhouette.svg?url';
import iconCommunityFilled from './icons/multiple-users-silhouette-filled.svg?url';
import iconBellSchool from './icons/bell-school.svg?url';
import iconCamera from './icons/camera.svg?url';
import iconFolder from './icons/folder.svg?url';
import iconThumbtack from './icons/thumbtack.svg?url';
import iconProfileView from './icons/USER-AVATAR-IDENTIFY.svg?url';
import iconNotificationsOff from './icons/notifications-off.svg?url';
import iconBanUser from './icons/ban user.svg?url';
import iconShield from './icons/shield.svg?url';
import iconTrash from './icons/trash.svg?url';
import iconPen from './icons/pen.svg?url';
import iconStopwatch from './icons/stopwatch.svg?url';
import iconSofa from './icons/sofa.svg?url';
import iconFile from './icons/file.svg?url';
import iconUserTag from './icons/USER-AVATAR-TAG.svg?url';
import iconChatLock from './icons/chat-lock.svg?url';
import iconPuzzle from './icons/puzzle.svg?url';

export const iconsCritical = {
  echoRounded: iconEchoRounded ?? '',
  echo: iconEcho ?? '',
  hashtag: iconHashtag ?? '',
  volumeUp: iconVolumeUp ?? '',
  usersAvatar: iconUsersAvatar ?? '',
  mic: iconMic ?? '',
  headphones: iconHeadphones ?? '',
  phoneCall: iconPhoneCall ?? '',
  settings: iconSettings ?? '',
  plus: iconPlus ?? '',
  logIn: iconLogIn ?? '',
  list: iconList ?? '',
  /** Back / return (e.g. mobile channel header) */
  arrowLeft: iconArrowLeft ?? '',
  search: iconSearch ?? '',
  message: iconMessage ?? '',
  messageFilled: iconMessageFilled ?? '',
  messageAlt: iconMessageAlt ?? '',
  more: iconMore ?? '',
  /** Vertical ⋮ — overflow / profile menus */
  moreVertical: iconMoreVertical ?? '',
  friendAdd: iconFriendAdd ?? '',
  friendAdded: iconFriendAdded ?? '',
  cameraOn: iconCameraOn ?? '',
  desktop: iconDesktop ?? '',
  stream: iconStream ?? '',
  logOut: iconLogOut ?? '',
  explore: iconExplore ?? '',
  exploreFilled: iconExploreFilled ?? '',
  community: iconCommunity ?? '',
  communityFilled: iconCommunityFilled ?? '',
  bellSchool: iconBellSchool ?? '',
  camera: iconCamera ?? '',
  folder: iconFolder ?? '',
  thumbtack: iconThumbtack ?? '',
  profileView: iconProfileView ?? '',
  notificationsOff: iconNotificationsOff ?? '',
  banUser: iconBanUser ?? '',
  shield: iconShield ?? '',
  trash: iconTrash ?? '',
  pen: iconPen ?? '',
  stopwatch: iconStopwatch ?? '',
  sofa: iconSofa ?? '',
  /** Paper channel default glyph. */
  file: iconFile ?? '',
  /** Self-assignable roles (channel type glyph). */
  userTag: iconUserTag ?? '',
  /** Server access / closed community. */
  chatLock: iconChatLock ?? '',
  /** VC activity / meme glyph (voice panel + channel heuristics). */
  puzzle: iconPuzzle ?? '',
} as const;

export type AppIconCriticalKey = keyof typeof iconsCritical;

/** Raw URL exports for `icons.ts` channel matchers / channelIcons (avoid duplicate SVG imports). */
export const criticalIconUrls = {
  hashtag: iconHashtag,
  volumeUp: iconVolumeUp,
  usersAvatar: iconUsersAvatar,
  message: iconMessage,
  messageAlt: iconMessageAlt,
  bellSchool: iconBellSchool,
  camera: iconCamera,
  sofa: iconSofa,
  file: iconFile,
  userTag: iconUserTag,
  puzzle: iconPuzzle,
  list: iconList,
} as const;
