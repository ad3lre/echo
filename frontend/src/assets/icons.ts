import type { EchoChannelType } from '@shared/types';
import iconHashtag from './icons/hashtag.svg?url';
import { iconEcho, iconEchoRounded } from './branding';
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
import iconGif from './icons/GIF.svg?url';
import iconGifLight from './icons/GIF-light.svg?url';
import iconEmotes from './icons/Emotes.svg?url';
import iconEmotesLight from './icons/Emotes-light.svg?url';
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

/** Inline `<svg><path d="...">` for a compact server owner crown (matches `crown.svg`). */
export const iconCrownSvgPath =
  'm4.863 15.876-1.819-7.033a1.174 1.174 0 0 1 1.783-1.286l2.316 1.543a.978.978 0 0 0 1.428-.4l2.364-5.029a1.174 1.174 0 0 1 2.124 0l2.37 5.032a.978.978 0 0 0 1.427.4l2.317-1.545a1.174 1.174 0 0 1 1.783 1.286l-1.819 7.033a1.5 1.5 0 0 1 -1.452 1.123h-11.37a1.5 1.5 0 0 1 -1.452-1.124zm14.387 4.124a.75.75 0 0 0 -.75-.75h-13a.75.75 0 0 0 0 1.5h13a.75.75 0 0 0 .75-.75z';

/** YouTube play logo (matches `youtube.svg`); use with `fill="currentColor"` in `<svg>`. */
export const iconYoutubeSvgPath =
  'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z';
import iconTelescope from './icons/telescope.svg?url';
import iconRocketLaunch from './icons/rocket launch.svg?url';
import iconMugHot from './icons/mug-hot.svg?url';
import iconSofa from './icons/sofa.svg?url';
import iconPuzzle from './icons/puzzle.svg?url';
import iconGlobe from './icons/globe.svg?url';
import iconLeaf from './icons/leaf.svg?url';
import iconImageGallery from './icons/image gallery.svg?url';
import iconFolder from './icons/folder.svg?url';
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
import iconYoutube from './icons/youtube.svg?url';
import iconGoogle from './icons/google.svg?url';
import iconImageRemove from './icons/IMAGE-REMOVE.svg?url';
import iconDiscordStage from './icons/discord-stage.svg?url';
import iconDiscordMark from './icons/discord-mark.svg?url';
import iconChatLock from './icons/chat-lock.svg?url';
import iconFile from './icons/file.svg?url';
import iconLifeRing from './icons/life ring.svg?url';
import iconUserTag from './icons/USER-AVATAR-TAG.svg?url';
import iconSparkle from './icons/sparkle.svg?url';
import iconMathCalculator from './icons/math-calculator.svg?url';
import iconHobbyGameController from './icons/hobby-game-controller.svg?url';
import iconHobbyTrophy from './icons/hobby-trophy.svg?url';
import { getIconFilenameByUrl, getIconUrlByFilename } from './iconCatalog';
import { safeImageUrl } from '@/utils/safeImageUrl';
import {
  type ChannelIconEmojiUrlLookup,
  isEchoChannelIconImageUrlKey,
  parseCustomEmojiChannelIconKey,
  resolveChannelIconRasterUrl,
} from '@/utils/channelIconKeys';

export {
  CUSTOM_EMOJI_CHANNEL_ICON_PREFIX,
  makeCustomEmojiChannelIconKey,
  parseCustomEmojiChannelIconKey,
  isEchoChannelIconImageUrlKey,
  channelIconKeyUsesSvgInvertFilter,
} from '@/utils/channelIconKeys';

export const icons = {
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
  gif: iconGif ?? '',
  /** Light shell — tuned pill/ink (composer toolbar). */
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
  /** Server access / closed community (distinct from Audit Log list icon). */
  chatLock: iconChatLock ?? '',
  leaf: iconLeaf ?? '',
  imageGallery: iconImageGallery ?? '',
  /** Saved media / favorites folder (GIF & image popout). */
  folder: iconFolder ?? '',
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
  /** YouTube play mark (channel icon picker + links). */
  youtube: iconYoutube ?? '',
  /** Google "G" mark (settings nav + integrations). */
  google: iconGoogle ?? '',
  kick: iconImageRemove ?? '',
  discordStage: iconDiscordStage ?? '',
  /** Legacy “Clyde” mark — OAuth / Discord sync (distinct from stage-channel glyph). */
  discordMark: iconDiscordMark ?? '',
  /** Paper channel default glyph. */
  file: iconFile ?? '',
  /** Support / ticket system (server settings). */
  lifeRing: iconLifeRing ?? '',
  /** Self-assignable roles (server settings). */
  userTag: iconUserTag ?? '',
  /** Sticker packs (server settings). */
  sparkle: iconSparkle ?? '',
};

export type AppIconKey = keyof typeof icons;

export const channelIcons = {
  text: iconMessage,
  voice: iconVolumeUp,
  /** Forum hub / threaded listing (distinct from plain # text). */
  forum: iconMessageAlt,
  /** Collaborative document channel. */
  paper: iconFile,
  /** Built-in self-assignable roles widget channel. */
  selfRoles: iconUserTag ?? iconFile,
} as const;

function defaultChannelGlyphUrl(type?: EchoChannelType): string {
  if (type === 'voice') return channelIcons.voice;
  if (type === 'stage') return icons.sofa;
  if (type === 'forum') return channelIcons.forum;
  if (type === 'paper') return channelIcons.paper;
  if (type === 'selfRoles') return channelIcons.selfRoles;
  return channelIcons.text;
}

/**
 * Discord channel names usually lead with emoji + space. Keyword icon heuristics
 * should run on the remainder so imported servers match intent ("general-cafe")
 * instead of spurious substring hits on emoji bytes / discord decorations.
 */
export function stripLeadingChannelEmojiForMatching(name: string): string {
  const s = name.trimStart();
  if (!s) return name;
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') {
    return name;
  }
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const graphemes = [...seg.segment(s)].map((x) => x.segment);
  let cut = 0;
  let sawEmoji = false;
  let i = 0;
  while (i < graphemes.length) {
    const g = graphemes[i]!;
    if (/\p{Extended_Pictographic}/u.test(g)) {
      sawEmoji = true;
      cut += g.length;
      i++;
      while (i < graphemes.length) {
        const next = graphemes[i]!;
        if (next === '\uFE0F' || next === '\u200D') {
          cut += next.length;
          i++;
          continue;
        }
        if (/\p{Extended_Pictographic}/u.test(next)) {
          cut += next.length;
          i++;
          continue;
        }
        break;
      }
      continue;
    }
    if (sawEmoji && /^[\s\u200B]+$/u.test(g)) {
      cut += g.length;
      break;
    }
    break;
  }
  if (!sawEmoji) return name;
  const rest = s.slice(cut).trimStart();
  return rest.length ? rest : name.trim();
}

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
      'youtube',
      'yt',
      'watch party',
      'watch-together',
      'videos',
      'vods',
    ],
    icon: iconYoutube,
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

export function resolveIconKeyToUrl(
  key: string,
  lookup?: ChannelIconEmojiUrlLookup,
): string {
  if (parseEmojiIconKey(key)) return icons.message;
  const raster = resolveChannelIconRasterUrl(key, lookup);
  if (raster) return raster;
  const fromApp = key ? getAppIconUrlIfOwnKey(key) : undefined;
  if (fromApp) return fromApp;
  const fromCatalog = getIconUrlByFilename(key);
  if (fromCatalog) return fromCatalog;
  return icons.message;
}

export type ChannelIconVisual =
  | { kind: 'svg'; url: string }
  | { kind: 'emoji'; emoji: string }
  | { kind: 'image'; url: string };

export function getChannelIconVisual(
  channel:
    | {
        name: string;
        type?: EchoChannelType;
        iconKey?: string;
      }
    | null
    | undefined,
  lookup?: ChannelIconEmojiUrlLookup,
): ChannelIconVisual {
  if (!channel) return { kind: 'svg', url: channelIcons.text };
  const key = typeof channel.iconKey === 'string' ? channel.iconKey.trim() : '';
  const emoji = key ? parseEmojiIconKey(key) : null;
  if (emoji) return { kind: 'emoji', emoji };
  if (key) {
    const raster = resolveChannelIconRasterUrl(key, lookup);
    if (raster) return { kind: 'image', url: raster };
    const fromApp = getAppIconUrlIfOwnKey(key);
    if (fromApp) return { kind: 'svg', url: fromApp };
    const fromFile = getIconUrlByFilename(key);
    if (fromFile) return { kind: 'svg', url: fromFile };
  }
  if (!key) {
    if (channel.type === 'voice')
      return { kind: 'svg', url: channelIcons.voice };
    if (channel.type === 'stage') return { kind: 'svg', url: icons.sofa };
    if (channel.type === 'forum')
      return { kind: 'svg', url: channelIcons.forum };
    if (channel.type === 'paper')
      return { kind: 'svg', url: channelIcons.paper };
    if (channel.type === 'selfRoles')
      return { kind: 'svg', url: channelIcons.selfRoles };
  }
  const name = stripLeadingChannelEmojiForMatching(channel.name).toLowerCase();
  const match = channelIconMatchers.find(({ patterns }) =>
    patterns.some((pattern) => name.includes(pattern)),
  );
  if (match) return { kind: 'svg', url: match.icon };
  return {
    kind: 'svg',
    url: defaultChannelGlyphUrl(channel.type),
  };
}

/**
 * Icon key to keep in the channel editor and on save when the server omits
 * `iconKey`. The list still shows a glyph via name heuristics
 * (`getChannelIconVisual`); without this, the editor fell back to the plain
 * type default (`message` / `volumeUp` / …) and the next save stored that
 * value, wiping the name-matched icon.
 */
export function getChannelIconKeyForEdit(
  channel:
    | {
        name: string;
        type?: EchoChannelType;
        iconKey?: string;
      }
    | null
    | undefined,
): string {
  if (!channel) return 'message';
  const key = typeof channel.iconKey === 'string' ? channel.iconKey.trim() : '';
  if (key) return key;
  const visual = getChannelIconVisual({ ...channel, iconKey: undefined });
  if (visual.kind === 'emoji') {
    return makeEmojiIconKey(visual.emoji);
  }
  for (const [k, v] of Object.entries(icons) as [AppIconKey, string][]) {
    if (v && v === visual.url) return k;
  }
  const catalogId = getIconFilenameByUrl(visual.url);
  if (catalogId) return catalogId;
  if (channel.type === 'voice') return 'volumeUp';
  if (channel.type === 'stage') return 'sofa';
  if (channel.type === 'forum') return 'messageAlt';
  if (channel.type === 'paper') return 'file';
  if (channel.type === 'selfRoles') return 'userTag';
  return 'message';
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
  lookup?: ChannelIconEmojiUrlLookup,
): string {
  if (!channel) return channelIcons.text;
  const key = typeof channel.iconKey === 'string' ? channel.iconKey.trim() : '';
  if (parseEmojiIconKey(key)) {
    return defaultChannelGlyphUrl(channel.type);
  }
  if (key) {
    const raster = resolveChannelIconRasterUrl(key, lookup);
    if (raster) return raster;
    const fromApp = getAppIconUrlIfOwnKey(key);
    if (fromApp) return fromApp;
    const fromFile = getIconUrlByFilename(key);
    if (fromFile) return fromFile;
  }
  if (!key) {
    if (channel.type === 'voice') return channelIcons.voice;
    if (channel.type === 'stage') return icons.sofa;
    if (channel.type === 'forum') return channelIcons.forum;
    if (channel.type === 'paper') return channelIcons.paper;
  }
  const name = stripLeadingChannelEmojiForMatching(channel.name).toLowerCase();
  const match = channelIconMatchers.find(({ patterns }) =>
    patterns.some((pattern) => name.includes(pattern)),
  );
  if (match) return match.icon;
  return defaultChannelGlyphUrl(channel.type);
}

export function getChannelDisplayName(name: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed === 'self-assignable-roles') return 'Self-assignable roles';
  return trimmed;
}
