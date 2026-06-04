/**
 * Centralized asset imports. Use these instead of /src/assets/ paths
 * so Vite can hash and bundle assets correctly for production.
 */

import type { EchoChannelType } from '@shared/types';

// Icons
import { iconEchoRounded, iconEcho } from './branding';
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
import iconGif from './icons/GIF.svg?url';
import iconGifLight from './icons/GIF-light.svg?url';
import iconEmotes from './icons/Emotes.svg?url';
import iconEmotesLight from './icons/Emotes-light.svg?url';
/** Stroke smiley — server settings Emoji tab only (composer uses `emotes`). */
import iconEmotesServerNav from './icons/Emotes-server-nav.svg?url';
import iconSearch from './icons/SEARCH-NORMAL.svg?url';
import iconSliders from './icons/sliders.svg?url';
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
import iconExploreFilled from './icons/rocket.svg?url';
import iconCommunity from './icons/multiple-users-silhouette.svg?url';
import iconCommunityFilled from './icons/multiple-users-silhouette-filled.svg?url';
import iconBellSchool from './icons/bell-school.svg?url';
import iconLaptopCode from './icons/laptop code.svg?url';
import iconCamera from './icons/camera.svg?url';
import iconMusicNote from './icons/music note.svg?url';
import iconSpeedometer from './icons/speedometer.svg?url';
import iconCrown from './icons/crown.svg?url';
import iconTelescope from './icons/telescope.svg?url';
import iconRocketLaunch from './icons/rocket launch.svg?url';
import iconMugHot from './icons/mug-hot.svg?url';
import iconSofa from './icons/sofa.svg?url';
import iconPuzzle from './icons/puzzle.svg?url';
import iconGlobe from './icons/globe.svg?url';
import iconLeaf from './icons/leaf.svg?url';
import iconImageGallery from './icons/image gallery.svg?url';
import iconThumbtack from './icons/thumbtack.svg?url';
import iconProfileView from './icons/USER-AVATAR-IDENTIFY.svg?url';
import iconSun from './icons/sun.svg?url';
import iconMoon from './icons/moon.svg?url';
import iconNotificationsOff from './icons/notifications-off.svg?url';
import iconBanUser from './icons/ban user.svg?url';
import iconShield from './icons/shield.svg?url';
import iconTrash from './icons/trash.svg?url';
import iconPen from './icons/pen.svg?url';
import iconCreditCard from './icons/credit card.svg?url';
import iconStopwatch from './icons/stopwatch.svg?url';
import iconUserBlock from './icons/user-block.svg?url';
import iconImageRemove from './icons/IMAGE-REMOVE.svg?url';
import iconDiscordStage from './icons/discord-stage.svg?url';
import iconDiscordMark from './icons/discord-mark.svg?url';
import iconMathCalculator from './icons/math-calculator.svg?url';
import iconHobbyGameController from './icons/hobby-game-controller.svg?url';
import iconHobbyTrophy from './icons/hobby-trophy.svg?url';
import { getIconUrlByFilename } from './iconCatalog';
import { stripLeadingChannelEmojiForMatching } from './icons';

// User avatars
import pfpDefault from './icons/pfp.webp?url';
import userBeemo from './users/Beemo.webp?url';
import userBlessed from './users/Blessed.webp?url';
import userClover from './users/Clover.webp?url';
import userCleo from './users/Cleo.webp?url';
import userDante from './users/Dante.webp?url';
import userDeirdre from './users/Deirdre.webp?url';
import userEun from './users/Eun.webp?url';
import userJulia from './users/Julia.webp?url';
import userLambSauce from './users/Lamb Sauce.webp?url';
import userLucy from './users/Lucy.webp?url';
import userRJ from './users/RJ.webp?url';
import userSebbie from './users/Sebbie.webp?url';
import userUncleSam from './users/Uncle Sam.webp?url';

/** Larger sources for full-screen / big-tile UI (DM call, etc.); PNG where available. */
import userBeemoPng from './users/Beemo.png?url';
import userBlessedPng from './users/Blessed.png?url';
import userCloverPng from './users/Clover.png?url';
import userDantePng from './users/Dante.png?url';
import userJuliaPng from './users/Julia.png?url';
import userLucyPng from './users/Lucy.png?url';
import userSebbiePng from './users/Sebbie.png?url';
import userUncleSamPng from './users/Uncle Sam.png?url';
import userEunPng from './users/Eun.png?url';

// Server icons
import serverQuantum from './server_icons/quantum.webp?url';
import serverEmpire from './server_icons/empire.webp?url';
import serverMti from './server_icons/mti.webp?url';
import serverTypeclub from './server_icons/typeclub.webp?url';
import serverKamauo from './server_icons/Kamauo.webp?url';
import serverCatLandia from './server_icons/CatLandia.webp?url';
import serverStarland from './server_icons/Starland.webp?url';
import serverSushi from './server_icons/Sushi.webp?url';
import serverPocki from './server_icons/Pocki.webp?url';
import serverMelonie from './server_icons/Melonie.webp?url';
import serverBeacon from './server_icons/Beacon.webp?url';
import serverSpace from './server_icons/Space.webp?url';
import serverStarch from './server_icons/Starch.webp?url';

export const icons = {
  echoRounded: iconEchoRounded ?? '',
  echo: iconEcho ?? '',
  hashtag: iconHashtag ?? '',
  volumeUp: iconVolumeUp ?? '',
  usersAvatar: iconUsersAvatar ?? '',
  mic: iconMic ?? '',
  headphones: iconHeadphones ?? '',
  /** In-call indicator (DM list, etc.) */
  phoneCall: iconPhoneCall ?? '',
  settings: iconSettings ?? '',
  plus: iconPlus ?? '',
  logIn: iconLogIn ?? '',
  list: iconList ?? '',
  gif: iconGif ?? '',
  gifLight: iconGifLight ?? '',
  emotes: iconEmotes ?? '',
  emotesLight: iconEmotesLight ?? '',
  emotesServerNav: iconEmotesServerNav ?? '',
  search: iconSearch ?? '',
  sliders: iconSliders ?? '',
  message: iconMessage ?? '',
  messageFilled: iconMessageFilled ?? '',
  messageAlt: iconMessageAlt ?? '',
  more: iconMore ?? '',
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
  laptopCode: iconLaptopCode ?? '',
  camera: iconCamera ?? '',
  musicNote: iconMusicNote ?? '',
  speedometer: iconSpeedometer ?? '',
  crown: iconCrown ?? '',
  telescope: iconTelescope ?? '',
  rocketLaunch: iconRocketLaunch ?? '',
  mugHot: iconMugHot ?? '',
  sofa: iconSofa ?? '',
  puzzle: iconPuzzle ?? '',
  globe: iconGlobe ?? '',
  leaf: iconLeaf ?? '',
  imageGallery: iconImageGallery ?? '',
  thumbtack: iconThumbtack ?? '',
  profileView: iconProfileView ?? '',
  sun: iconSun ?? '',
  moon: iconMoon ?? '',
  notificationsOff: iconNotificationsOff ?? '',
  banUser: iconBanUser ?? '',
  shield: iconShield ?? '',
  trash: iconTrash ?? '',
  pen: iconPen ?? '',
  creditCard: iconCreditCard ?? '',
  stopwatch: iconStopwatch ?? '',
  block: iconUserBlock ?? '',
  kick: iconImageRemove ?? '',
  /** Discord-imported stage channel (GUILD_STAGE_VOICE → Echo voice). */
  discordStage: iconDiscordStage ?? '',
  discordMark: iconDiscordMark ?? '',
};

export type AppIconKey = keyof typeof icons;

export const channelIcons = {
  text: iconMessage,
  voice: iconVolumeUp,
} as const;

const channelIconMatchers: Array<{ patterns: string[]; icon: string }> = [
  {
    patterns: ['announcement', 'announcements', 'news', 'updates'],
    icon: iconBellSchool,
  },
  { patterns: ['rule', 'rules'], icon: iconList },
  {
    patterns: [
      'resource',
      'resources',
      'help',
      'docs',
      'dev',
      'build',
      'open source',
      'pair program',
    ],
    icon: iconLaptopCode,
  },
  {
    patterns: ['photo', 'photos', 'image', 'gallery', 'showcase', 'art'],
    icon: iconCamera,
  },
  {
    patterns: ['playlist', 'lofi', 'music', 'jam', 'listening', 'artist'],
    icon: iconMusicNote,
  },
  {
    patterns: [
      'racing',
      'race',
      'pit',
      'engine',
      'wpm',
      'leaderboard',
      'practice',
    ],
    icon: iconSpeedometer,
  },
  {
    patterns: [
      'strategy',
      'war',
      'command',
      'conquest',
      'conquests',
      'mission control',
    ],
    icon: iconCrown,
  },
  {
    patterns: [
      'space',
      'astro',
      'star',
      'stargazer',
      'sky',
      'night',
      'discoveries',
      'sci-fi',
    ],
    icon: iconTelescope,
  },
  {
    patterns: ['mission', 'missions', 'rocket', 'launch', 'events', 'event'],
    icon: iconRocketLaunch,
  },
  {
    patterns: [
      'recipe',
      'recipes',
      'restaurant',
      'food',
      'ingredients',
      'kitchen',
    ],
    icon: iconMugHot,
  },
  {
    patterns: ['lounge', 'chill', 'cozy', 'bar', 'nap', 'study hall'],
    icon: iconSofa,
  },
  {
    patterns: ['meme', 'memes', 'random', 'off topic', 'off-topic'],
    icon: iconPuzzle,
  },
  {
    patterns: ['welcome', 'general', 'chat', 'talk', 'daily', 'share your day'],
    icon: iconMessage,
  },
  {
    patterns: ['community', 'collab', 'collabs', 'crew'],
    icon: iconUsersAvatar,
  },
  { patterns: ['future', 'typology', 'globe'], icon: iconGlobe },
  { patterns: ['cute', 'cat', 'purr', 'leaf', 'vibes'], icon: iconLeaf },
  {
    patterns: ['project', 'materials', 'tips', 'tool', 'workshop', 'maker'],
    icon: iconImageGallery,
  },
  {
    patterns: [
      'math',
      'algebra',
      'calculus',
      'geometry',
      'homework',
      'exam',
      'physics',
      'chemistry',
      'biology',
      'statistics',
      'stats',
      'lab',
      'study',
    ],
    icon: iconMathCalculator,
  },
  {
    patterns: [
      'gaming',
      'minecraft',
      'valorant',
      'league',
      'sports',
      'fitness',
      'workout',
      'anime',
      'cosplay',
      'craft',
      'hobby',
    ],
    icon: iconHobbyGameController,
  },
  {
    patterns: [
      'football',
      'soccer',
      'basketball',
      'tennis',
      'volleyball',
      'golf',
      'racing league',
    ],
    icon: iconHobbyTrophy,
  },
];

/** Only true for own keys on `icons` — `key in icons` is unsafe (e.g. `toString` hits Object.prototype). */
function getAppIconUrlIfOwnKey(key: string): string | undefined {
  if (!key || !Object.prototype.hasOwnProperty.call(icons, key))
    return undefined;
  const v = icons[key as keyof typeof icons];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export const EMOJI_ICON_PREFIX = 'emoji:' as const;

export function parseEmojiIconKey(key: string): string | null {
  if (!key) return null;
  const k = key.trim();
  if (!k.startsWith(EMOJI_ICON_PREFIX)) return null;
  const emoji = k.slice(EMOJI_ICON_PREFIX.length).trim();
  return emoji ? emoji : null;
}

export function makeEmojiIconKey(emoji: string): string {
  return `${EMOJI_ICON_PREFIX}${emoji.trim()}`;
}

/** Resolve curated key (e.g. `message`) or exact filename (e.g. `message.svg`) to a URL. */
export function resolveIconKeyToUrl(key: string): string {
  if (parseEmojiIconKey(key)) return icons.message;
  const fromApp = key ? getAppIconUrlIfOwnKey(key) : undefined;
  if (fromApp) return fromApp;
  const fromCatalog = getIconUrlByFilename(key);
  if (fromCatalog) return fromCatalog;
  return icons.message;
}

export type ChannelIconVisual =
  | { kind: 'svg'; url: string }
  | { kind: 'emoji'; emoji: string };

export function getChannelIconVisual(
  channel:
    | {
        name: string;
        type?: EchoChannelType;
        iconKey?: string;
      }
    | null
    | undefined,
): ChannelIconVisual {
  if (!channel) return { kind: 'svg', url: channelIcons.text };

  const key = typeof channel.iconKey === 'string' ? channel.iconKey.trim() : '';
  const emoji = key ? parseEmojiIconKey(key) : null;
  if (emoji) return { kind: 'emoji', emoji };

  if (key) {
    const fromApp = getAppIconUrlIfOwnKey(key);
    if (fromApp) return { kind: 'svg', url: fromApp };
    const fromFile = getIconUrlByFilename(key);
    if (fromFile) return { kind: 'svg', url: fromFile };
  }

  const name = stripLeadingChannelEmojiForMatching(channel.name).toLowerCase();
  const match = channelIconMatchers.find(({ patterns }) =>
    patterns.some((pattern) => name.includes(pattern)),
  );
  if (match) return { kind: 'svg', url: match.icon };

  return {
    kind: 'svg',
    url: channel.type === 'voice' ? channelIcons.voice : channelIcons.text,
  };
}

export function getChannelIcon(
  channel:
    | {
        name: string;
        type?: EchoChannelType;
        iconKey?: string;
      }
    | null
    | undefined,
): string {
  if (!channel) return channelIcons.text;

  const key = typeof channel.iconKey === 'string' ? channel.iconKey.trim() : '';
  if (parseEmojiIconKey(key))
    return channel.type === 'voice' ? channelIcons.voice : channelIcons.text;
  if (key) {
    const fromApp = getAppIconUrlIfOwnKey(key);
    if (fromApp) return fromApp;
    const fromFile = getIconUrlByFilename(key);
    if (fromFile) return fromFile;
  }

  const name = stripLeadingChannelEmojiForMatching(channel.name).toLowerCase();
  const match = channelIconMatchers.find(({ patterns }) =>
    patterns.some((pattern) => name.includes(pattern)),
  );

  if (match) return match.icon;
  return channel.type === 'voice' ? channelIcons.voice : channelIcons.text;
}

/** Channel / category label for UI: preserve emoji and full Unicode; trim whitespace only. */
export function getChannelDisplayName(name: string): string {
  if (!name) return '';
  return name.trim();
}

export const userAvatars = {
  u1: pfpDefault,
  u2: userBeemo,
  u3: userBlessed,
  u4: userClover,
  u5: userDante,
  u6: userJulia,
  u7: userLucy,
  u8: userSebbie,
  u9: userUncleSam,
  u10: userCleo,
  u11: userDeirdre,
  u12: userEun,
  u13: userLambSauce,
  u14: userRJ,
} as const;

/** Same keys as `userAvatars`; prefer PNG (or same URL) so large tiles stay sharp on HiDPI. */
export const userAvatarsHiRes = {
  u1: pfpDefault,
  u2: userBeemoPng,
  u3: userBlessedPng,
  u4: userCloverPng,
  u5: userDantePng,
  u6: userJuliaPng,
  u7: userLucyPng,
  u8: userSebbiePng,
  u9: userUncleSamPng,
  u10: userCleo,
  u11: userDeirdre,
  u12: userEunPng,
  u13: userLambSauce,
  u14: userRJ,
} as const;

export const serverIcons = {
  quantum: serverQuantum,
  empire: serverEmpire,
  mti: serverMti,
  typeclub: serverTypeclub,
  kamauo: serverKamauo,
  catLandia: serverCatLandia,
  starland: serverStarland,
  sushi: serverSushi,
  pocki: serverPocki,
  melonie: serverMelonie,
  beacon: serverBeacon,
  space: serverSpace,
  starch: serverStarch,
};

export { iconEchoRounded, iconEcho };
