<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  unref,
  watch,
  withDefaults,
  type MaybeRef,
} from 'vue';
import { withBasePath } from '@/features/layout/urlNavigation';
import {
  parseYoutubeVideoId,
  youtubePrivacyEmbedUrl,
} from '@/utils/parseYoutubeVideoId';
import {
  fetchEchoYoutubePopular,
  fetchEchoYoutubeRelated,
  fetchEchoYoutubeVcSearch,
} from '@/api/echo/youtubeVc';
import type { EchoYoutubeSearchItem } from '@/api/echo/youtubeVc';
import {
  fetchEchoVcActivityPopularity,
  postEchoVcActivityOpen,
} from '@/api/echo/vcActivities';
import type { EchoHangmanActivityV1 } from '@/audio/voiceEchoLiveKitData';
import { useAuthSessionStore } from '@/stores/authSession';
import type { EchoVcActivityKey } from '@shared/vcActivityCatalog';
import type {
  VcActivityUiState,
  YoutubePlaylistEntry,
} from '@/features/voice/vcActivityTypes';
import {
  VC_CODENAMES_EMBED_URL,
  isVcIframeEmbedPhase,
  normalizeCodenamesRoomUrlForEmbed,
  vcIframeEmbedTitle,
  vcIframeEmbedUrl,
  youtubeNowPlaying,
} from '@/features/voice/vcActivityTypes';
import VcWordlineActivity from '@/features/voice/components/VcWordlineActivity.vue';
import VcHangmanGame from '@/features/voice/components/VcHangmanGame.vue';

const appBase = import.meta.env.BASE_URL || '/';
/**
 * Library card hero art (served from `public/vc-activities/`).
 * Source URLs and licenses: `public/vc-activities/sources.json`.
 */
const vcActivityArt = {
  youtube: withBasePath('/vc-activities/youtube-hero.svg', appBase),
  wordle: withBasePath('/vc-activities/wordle-hero.png', appBase),
  hangman: withBasePath('/vc-activities/hangman-hero.svg', appBase),
  openguessr: withBasePath('/vc-activities/openguessr-hero.jpg', appBase),
  skribblIo: withBasePath('/vc-activities/skribbl-hero.png', appBase),
  garticPhone: withBasePath('/vc-activities/gartic-phone-hero.png', appBase),
  krunker: withBasePath('/vc-activities/krunker-hero.jpg', appBase),
  codenames: withBasePath('/vc-activities/codenames-hero.avif', appBase),
  richup: withBasePath('/vc-activities/richup-hero.png', appBase),
  gooberDash: withBasePath('/vc-activities/goober-dash-hero.png', appBase),
  smashKarts: withBasePath('/vc-activities/smash-karts-hero.png', appBase),
  basketballStars2026: withBasePath(
    '/vc-activities/basketball-stars-2026-hero.jpg',
    appBase,
  ),
  clusterRush: withBasePath('/vc-activities/cluster-rush-hero.jpg', appBase),
} as const;

const VC_ACTIVITY_LIBRARY_CARDS: readonly {
  key: EchoVcActivityKey;
  artKey: keyof typeof vcActivityArt;
  widgetClass: string;
  title: string;
  description: string;
  ariaLabel: string;
}[] = [
  {
    key: 'youtube',
    artKey: 'youtube',
    widgetClass: 'vc-act-widget--youtube',
    title: 'YouTube',
    description: 'Shared queue with voice · playback is per person',
    ariaLabel: 'Open YouTube activity',
  },
  {
    key: 'wordle',
    artKey: 'wordle',
    widgetClass: 'vc-act-widget--wordle',
    title: 'Wordle',
    description: 'Daily puzzle · private to you in this activity',
    ariaLabel: 'Open Wordle activity',
  },
  {
    key: 'hangman',
    artKey: 'hangman',
    widgetClass: 'vc-act-widget--hangman',
    title: 'Hangman',
    description:
      'Echo voice classic · shared board, one puzzle master per round, guesses over the voice channel',
    ariaLabel: 'Open Hangman activity',
  },
  {
    key: 'openguessr',
    artKey: 'openguessr',
    widgetClass: 'vc-act-widget--openguessr',
    title: 'OpenGuessr',
    description: 'Geography guessing · play in voice together',
    ariaLabel: 'Open OpenGuessr activity',
  },
  {
    key: 'skribbl_io',
    artKey: 'skribblIo',
    widgetClass: 'vc-act-widget--skribblio',
    title: 'skribbl.io',
    description: 'Drawing & guessing party game · play in voice together',
    ariaLabel: 'Open skribbl.io activity',
  },
  {
    key: 'gartic_phone',
    artKey: 'garticPhone',
    widgetClass: 'vc-act-widget--garticphone',
    title: 'Gartic Phone',
    description: 'Drawing telephone · play in voice together',
    ariaLabel: 'Open Gartic Phone activity',
  },
  {
    key: 'krunker',
    artKey: 'krunker',
    widgetClass: 'vc-act-widget--krunker',
    title: 'Krunker',
    description: 'Browser FPS · play in voice together',
    ariaLabel: 'Open Krunker activity',
  },
  {
    key: 'goober_dash',
    artKey: 'gooberDash',
    widgetClass: 'vc-act-widget--gooberdash',
    title: 'Goober Dash',
    description:
      'Race royale by Winterpixel · runs in the embedded activity web client',
    ariaLabel: 'Open Goober Dash activity',
  },
  {
    key: 'smash_karts',
    artKey: 'smashKarts',
    widgetClass: 'vc-act-widget--smashkarts',
    title: 'Smash Karts',
    description:
      'Multiplayer kart battles by Tall Team · play in voice together',
    ariaLabel: 'Open Smash Karts activity',
  },
  {
    key: 'basketball_stars_2026',
    artKey: 'basketballStars2026',
    widgetClass: 'vc-act-widget--basketballstars2026',
    title: 'Basketball Stars 2026',
    description:
      '2v2 and tournament basketball by MadPuffers · GameDistribution embed in this activity',
    ariaLabel: 'Open Basketball Stars 2026 activity',
  },
  {
    key: 'cluster_rush',
    artKey: 'clusterRush',
    widgetClass: 'vc-act-widget--clusterrush',
    title: 'Cluster Rush',
    description:
      'First-person truck parkour (Unity WebGL on clusterrush.io) · local play in this activity',
    ariaLabel: 'Open Cluster Rush activity',
  },
  {
    key: 'codenames',
    artKey: 'codenames',
    widgetClass: 'vc-act-widget--codenames',
    title: 'Codenames',
    description: 'Team word game · play in voice together',
    ariaLabel: 'Open Codenames activity',
  },
  {
    key: 'richup',
    artKey: 'richup',
    widgetClass: 'vc-act-widget--richup',
    title: 'Richup.io',
    description: 'Online property board · play in voice together',
    ariaLabel: 'Open Richup.io activity',
  },
];

const props = withDefaults(
  defineProps<{
    state: MaybeRef<VcActivityUiState>;
    voiceChannelLabel: string;
    compactLayout?: boolean;
    /** When side chat is collapsed, show reopen in the activity header instead of the floating pill. */
    voiceSideChatCollapsed?: boolean;
    expandVoiceSideChat?: () => void;
    openVcActivityYoutubeBrowse: () => void;
    openVcActivityWordle: () => void;
    openVcActivityHangman: () => void;
    openVcActivityOpenGuessr: () => void;
    openVcActivitySkribblIo: () => void;
    openVcActivityGarticPhone: () => void;
    openVcActivityKrunker: () => void;
    openVcActivityCodenames: () => void;
    openVcActivityRichup: () => void;
    openVcActivityGooberDash: () => void;
    openVcActivitySmashKarts: () => void;
    openVcActivityBasketballStars2026: () => void;
    openVcActivityClusterRush: () => void;
    openVcActivityPicker: () => void;
    setVcActivityYoutubeVideo: (
      videoId: string,
      meta?: Partial<
        Pick<YoutubePlaylistEntry, 'title' | 'channelTitle' | 'thumbnailUrl'>
      >,
    ) => void;
    setVcYoutubeBrowseOpen: (open: boolean) => void;
    addVcYoutubeToQueue: (entry: YoutubePlaylistEntry) => void;
    removeVcYoutubeFromQueue: (index: number) => void;
    moveVcYoutubeInQueue: (from: number, to: number) => void;
    playVcYoutubeAtIndex: (index: number) => void;
    playVcYoutubeNext: () => void;
    playVcYoutubePrevious: () => void;
    closeVcActivity: () => void;
    vcHangmanActivity: MaybeRef<EchoHangmanActivityV1 | null>;
    hangmanRosterUserIds: MaybeRef<readonly string[]>;
    commitVcHangmanWord: (raw: string) => string | null;
    requestVcHangmanGuessLetter: (letter: string) => void;
    requestVcHangmanNextRound: () => void;
    activeVoiceChannelParticipants?: MaybeRef<
      readonly { id: string; name: string }[]
    >;
    setVcActivityCodenamesRoomUrl?: (url: string | null) => void;
    /** Lexicographically smallest VC user id — only they create the Codenames room (see `resolveVcCodenamesStarterUserId`). */
    vcCodenamesStarterUserId?: string | null;
    currentUserId?: string | null;
    /** Jump to owning guild and highlight this VC in the channel list (activity header title). */
    focusGuildVoiceChannelInSidebar?: () => void;
    channelPanelCollapsed?: boolean;
    expandChannels?: () => void;
    /** Guild tri-pane: same action as the floating “Back” control on the voice surface. */
    onMobileBackToChannels?: () => void;
    /** Sub-800px shell — channel column width is not part of the desktop grid. */
    isCompactShell?: boolean;
    /** Desktop: narrows the channel column when activity content still overflows vertically. */
    narrowChannelPanelForActivityOverflowStep?: () => boolean;
  }>(),
  {
    voiceSideChatCollapsed: false,
    expandVoiceSideChat: () => {},
    channelPanelCollapsed: false,
    isCompactShell: false,
    vcCodenamesStarterUserId: null,
    setVcActivityCodenamesRoomUrl: () => {},
    activeVoiceChannelParticipants: () => [],
  },
);

const hmActivity = computed(() => unref(props.vcHangmanActivity));
const hmRoster = computed(() => [...(unref(props.hangmanRosterUserIds) ?? [])]);
const hangmanVoiceParticipants = computed(() => {
  const rows = unref(props.activeVoiceChannelParticipants) ?? [];
  return rows.map((p) => ({ id: p.id, name: p.name }));
});

const auth = useAuthSessionStore();

const vcActivityPopularityByKey = ref(
  {} as Partial<Record<EchoVcActivityKey, number>>,
);

const sortedVcActivityLibraryCards = computed(() => {
  const pop = vcActivityPopularityByKey.value;
  return [...VC_ACTIVITY_LIBRARY_CARDS].sort((a, b) => {
    const ca = pop[a.key] ?? 0;
    const cb = pop[b.key] ?? 0;
    if (cb !== ca) return cb - ca;
    const t = a.title.localeCompare(b.title, undefined, {
      sensitivity: 'base',
    });
    if (t !== 0) return t;
    return a.key.localeCompare(b.key);
  });
});

async function refreshVcActivityLibraryPopularity(): Promise<void> {
  const token = auth.accessToken?.trim();
  if (!token) return;
  try {
    const res = await fetchEchoVcActivityPopularity(token);
    const next: Partial<Record<EchoVcActivityKey, number>> = {};
    for (const row of res.items) {
      if (typeof row.openCount === 'number' && Number.isFinite(row.openCount)) {
        next[row.activityKey] = row.openCount;
      }
    }
    vcActivityPopularityByKey.value = next;
  } catch {
    /* Non-fatal when offline or echo disabled — fall back to stable secondary sort only. */
  }
}

function recordVcActivityOpen(key: EchoVcActivityKey): void {
  const token = auth.accessToken?.trim();
  if (!token) return;
  void postEchoVcActivityOpen(token, key).catch(() => {});
}

type VcActivityLibraryCardKey =
  (typeof VC_ACTIVITY_LIBRARY_CARDS)[number]['key'];

function openActivityFromLibrary(key: VcActivityLibraryCardKey): void {
  recordVcActivityOpen(key);
  switch (key) {
    case 'youtube':
      props.openVcActivityYoutubeBrowse();
      break;
    case 'wordle':
      props.openVcActivityWordle();
      break;
    case 'hangman':
      props.openVcActivityHangman();
      break;
    case 'openguessr':
      props.openVcActivityOpenGuessr();
      break;
    case 'skribbl_io':
      props.openVcActivitySkribblIo();
      break;
    case 'gartic_phone':
      props.openVcActivityGarticPhone();
      break;
    case 'krunker':
      props.openVcActivityKrunker();
      break;
    case 'codenames':
      props.openVcActivityCodenames();
      break;
    case 'richup':
      props.openVcActivityRichup();
      break;
    case 'goober_dash':
      props.openVcActivityGooberDash();
      break;
    case 'smash_karts':
      props.openVcActivitySmashKarts();
      break;
    case 'basketball_stars_2026':
      props.openVcActivityBasketballStars2026();
      break;
    case 'cluster_rush':
      props.openVcActivityClusterRush();
      break;
    default: {
      const _exhaustive: never = key;
      void _exhaustive;
    }
  }
}

const st = computed(() => unref(props.state));

watch(
  () => st.value.phase,
  (phase) => {
    if (phase === 'pick') void refreshVcActivityLibraryPopularity();
  },
  { immediate: true },
);

const iframeEmbedKey = ref(0);

const stageRootRef = ref<HTMLElement | null>(null);
const activityFullscreenActive = ref(false);

function syncActivityFullscreenState() {
  const el = stageRootRef.value;
  activityFullscreenActive.value = !!el && document.fullscreenElement === el;
}

async function exitActivityFullscreenIfActive() {
  const el = stageRootRef.value;
  if (el && document.fullscreenElement === el) {
    try {
      await document.exitFullscreen();
    } catch {
      /* ignore */
    }
  }
}

async function toggleActivityFullscreen() {
  const el = stageRootRef.value;
  if (!el) return;
  try {
    if (document.fullscreenElement === el) {
      await document.exitFullscreen();
    } else {
      await el.requestFullscreen();
    }
  } catch {
    /* unsupported or denied */
  }
}

onMounted(() => {
  document.addEventListener('fullscreenchange', syncActivityFullscreenState);
  window.addEventListener('message', onWindowMessageForCodenames);
});

onUnmounted(() => {
  teardownActivityOverflowLayoutWatch();
  document.removeEventListener('fullscreenchange', syncActivityFullscreenState);
  window.removeEventListener('message', onWindowMessageForCodenames);
  if (codenamesWaitTimer) {
    clearTimeout(codenamesWaitTimer);
    codenamesWaitTimer = null;
  }
  void exitActivityFullscreenIfActive();
});

watch(
  () => [st.value.phase, st.value.codenamesRoomUrl ?? ''] as const,
  ([phase]) => {
    if (isVcIframeEmbedPhase(phase)) {
      iframeEmbedKey.value += 1;
    }
    if (phase === 'pick') void exitActivityFullscreenIfActive();
  },
);

const iframeEmbedPhase = computed(() => {
  const p = st.value.phase;
  if (p === 'codenames') return null;
  return isVcIframeEmbedPhase(p) ? p : null;
});

const iframeEmbedSrc = computed(() =>
  iframeEmbedPhase.value ? vcIframeEmbedUrl(iframeEmbedPhase.value) : '',
);

const iframeEmbedTitle = computed(() =>
  iframeEmbedPhase.value ? vcIframeEmbedTitle(iframeEmbedPhase.value) : '',
);

function tryExtractCodenamesUrlFromMessageData(data: unknown): string | null {
  const scan = (v: unknown): string | null => {
    if (typeof v === 'string') {
      const m = v.match(/https:\/\/(?:www\.)?codenames\.game[/\w\-?#=&.%+~]*/i);
      return m?.[0] ? normalizeCodenamesRoomUrlForEmbed(m[0]) : null;
    }
    if (v && typeof v === 'object') {
      for (const x of Object.values(v as Record<string, unknown>)) {
        const r = scan(x);
        if (r) return r;
      }
    }
    return null;
  };
  return scan(data);
}

const isCodenamesStarter = computed(() => {
  const self = props.currentUserId?.trim() ?? '';
  const host = props.vcCodenamesStarterUserId?.trim() ?? '';
  if (!host) return true;
  return !!self && self === host;
});

const codenamesSyncedUrl = computed(
  () => st.value.codenamesRoomUrl?.trim() ?? '',
);

function onWindowMessageForCodenames(ev: MessageEvent) {
  if (ev.origin !== 'https://codenames.game') return;
  if (!isCodenamesStarter.value) return;
  if (st.value.phase !== 'codenames') return;
  if (codenamesSyncedUrl.value) return;
  const extracted = tryExtractCodenamesUrlFromMessageData(ev.data);
  if (!extracted) return;
  props.setVcActivityCodenamesRoomUrl?.(extracted);
}

const codenamesHoldUi = computed(
  () =>
    st.value.phase === 'codenames' &&
    !codenamesSyncedUrl.value &&
    !isCodenamesStarter.value,
);

const codenamesEmbedSrc = computed(() => {
  if (st.value.phase !== 'codenames') return '';
  const u = codenamesSyncedUrl.value;
  return u || VC_CODENAMES_EMBED_URL;
});

const codenamesPasteDraft = ref('');

function applyCodenamesPaste() {
  const u = normalizeCodenamesRoomUrlForEmbed(codenamesPasteDraft.value);
  if (!u) return;
  props.setVcActivityCodenamesRoomUrl?.(u);
  codenamesPasteDraft.value = '';
}

const codenamesWaitTimedOut = ref(false);
let codenamesWaitTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () =>
    st.value.phase === 'codenames' &&
    !codenamesSyncedUrl.value &&
    !isCodenamesStarter.value,
  (holding) => {
    if (codenamesWaitTimer) {
      clearTimeout(codenamesWaitTimer);
      codenamesWaitTimer = null;
    }
    codenamesWaitTimedOut.value = false;
    if (holding) {
      codenamesWaitTimer = setTimeout(() => {
        codenamesWaitTimedOut.value = true;
      }, 90_000);
    }
  },
  { immediate: true },
);

const activityRegionLabel = computed(() => {
  const p = st.value.phase;
  if (p === 'pick') return 'Voice activities';
  if (p === 'wordle') return 'Wordle';
  if (p === 'hangman') return 'Hangman';
  if (p === 'codenames') return 'Codenames';
  if (isVcIframeEmbedPhase(p)) return vcIframeEmbedTitle(p);
  return 'YouTube watch together';
});

const showVcFullscreenControl = computed(
  () =>
    st.value.phase === 'youtube' ||
    st.value.phase === 'wordle' ||
    st.value.phase === 'hangman' ||
    st.value.phase === 'codenames' ||
    isVcIframeEmbedPhase(st.value.phase),
);

const searchDraft = ref('');
const searchLoading = ref(false);
const searchError = ref('');
const searchResults = ref<EchoYoutubeSearchItem[]>([]);
const searchHint = ref<string | null>(null);
/** Browse drawer: search vs queue list (compact). */
const browseTab = ref<'find' | 'queue'>('find');

const popularLoading = ref(false);
const popularError = ref('');
const popularItems = ref<EchoYoutubeSearchItem[]>([]);
const popularHint = ref<string | null>(null);

const QUICK_SEARCH_PRESETS: { label: string; q: string }[] = [
  { label: 'Music', q: 'popular music videos' },
  { label: 'Gaming', q: 'gaming highlights' },
  { label: 'News', q: 'world news today' },
  { label: 'Comedy', q: 'stand up comedy' },
  { label: 'Science', q: 'science documentary' },
];

const queueSuggestLoading = ref(false);
const queueSuggestError = ref('');
const queueSuggestHint = ref<string | null>(null);
const queueSuggestItems = ref<EchoYoutubeSearchItem[]>([]);

const primaryFindRows = computed(() =>
  searchResults.value.length ? searchResults.value : popularItems.value,
);

const queueSuggestSeedTitle = computed(() => {
  if (st.value.phase !== 'youtube') return '';
  const row = st.value.playlist[st.value.currentIndex];
  return row?.title?.trim() || '';
});

const nowPlaying = computed(() =>
  st.value.phase === 'youtube' ? youtubeNowPlaying(st.value) : null,
);

const nextInQueue = computed(() => {
  if (st.value.phase !== 'youtube' || !st.value.playlist.length) return null;
  const i = st.value.currentIndex;
  return st.value.playlist[i + 1] ?? null;
});

const embedSrc = computed(() =>
  st.value.phase === 'youtube' && st.value.youtubeVideoId
    ? youtubePrivacyEmbedUrl(st.value.youtubeVideoId)
    : '',
);

const hasQueue = computed(
  () => st.value.phase === 'youtube' && st.value.playlist.length > 0,
);

watch(
  () => st.value.phase,
  (phase) => {
    if (phase !== 'youtube') {
      searchDraft.value = '';
      searchResults.value = [];
      searchError.value = '';
      searchHint.value = null;
      searchLoading.value = false;
      popularError.value = '';
      popularHint.value = null;
      browseTab.value = 'find';
      queueSuggestItems.value = [];
      queueSuggestError.value = '';
      queueSuggestHint.value = null;
    } else {
      browseTab.value = 'find';
    }
  },
);

watch(
  () => st.value.phase === 'youtube',
  (isYt) => {
    if (isYt && !popularItems.value.length && !popularLoading.value) {
      void loadPopular();
    }
  },
  { immediate: true },
);

async function loadQueueSuggestions() {
  if (st.value.phase !== 'youtube') return;
  const pl = st.value.playlist;
  if (!pl.length) {
    queueSuggestItems.value = [];
    return;
  }
  const cur = pl[st.value.currentIndex];
  if (!cur?.id) return;
  queueSuggestLoading.value = true;
  queueSuggestError.value = '';
  queueSuggestHint.value = null;
  try {
    const res = await fetchEchoYoutubeRelated(
      auth.accessToken?.trim() ?? null,
      cur.id,
    );
    const inQueue = new Set(pl.map((e) => e.id));
    const raw = res.items ?? [];
    queueSuggestItems.value = raw.filter((i) => !inQueue.has(i.id));
    queueSuggestHint.value = res.hint?.trim() ? res.hint : null;
    if (!queueSuggestItems.value.length && raw.length > 0) {
      queueSuggestHint.value = 'Suggested picks are already in your queue.';
    } else if (!queueSuggestItems.value.length && !queueSuggestHint.value) {
      queueSuggestHint.value = 'No suggestions yet — try Search.';
    }
  } catch (e) {
    queueSuggestError.value =
      e instanceof Error ? e.message : 'Could not load suggestions.';
    queueSuggestItems.value = [];
  } finally {
    queueSuggestLoading.value = false;
  }
}

watch(
  () =>
    [
      browseTab.value,
      st.value.phase === 'youtube' ? st.value.currentIndex : -1,
      st.value.phase === 'youtube'
        ? st.value.playlist.map((p) => p.id).join('|')
        : '',
    ] as const,
  ([tab]) => {
    if (tab !== 'queue' || st.value.phase !== 'youtube') return;
    void loadQueueSuggestions();
  },
);

async function loadPopular() {
  popularLoading.value = true;
  popularError.value = '';
  popularHint.value = null;
  try {
    const res = await fetchEchoYoutubePopular(
      auth.accessToken?.trim() ?? null,
      'US',
    );
    popularItems.value = res.items ?? [];
    popularHint.value = res.hint?.trim() ? res.hint : null;
    if (!popularItems.value.length && !popularHint.value) {
      popularError.value =
        'No recommendations available. Try search or paste a link.';
    }
  } catch (e) {
    popularError.value =
      e instanceof Error ? e.message : 'Could not load recommendations.';
    popularItems.value = [];
  } finally {
    popularLoading.value = false;
  }
}

async function applyPresetSearch(q: string) {
  searchDraft.value = q;
  await runSearch();
}

async function runSearch() {
  const q = searchDraft.value.trim();
  if (q.length < 2) {
    searchError.value = 'Enter a search or a full YouTube link.';
    return;
  }
  searchLoading.value = true;
  searchError.value = '';
  searchHint.value = null;
  try {
    const res = await fetchEchoYoutubeVcSearch(
      auth.accessToken?.trim() ?? null,
      q,
    );
    searchResults.value = res.items ?? [];
    searchHint.value = res.hint?.trim() ? res.hint : null;
    if (!searchResults.value.length && !searchHint.value) {
      searchError.value =
        'No videos found. Try different words or paste a link.';
    }
  } catch (e) {
    searchError.value =
      e instanceof Error ? e.message : 'Search failed. Try again.';
    searchResults.value = [];
  } finally {
    searchLoading.value = false;
  }
}

function rowToMeta(v: EchoYoutubeSearchItem) {
  return {
    title: v.title,
    channelTitle: v.channelTitle,
    thumbnailUrl: v.thumbnailUrl,
  };
}

function entryFromItem(v: EchoYoutubeSearchItem): YoutubePlaylistEntry {
  return {
    id: v.id,
    title: v.title,
    channelTitle: v.channelTitle,
    thumbnailUrl: v.thumbnailUrl,
  };
}

/** Play now or append depending on whether a session is already playing. */
function pickVideo(v: EchoYoutubeSearchItem) {
  const meta = rowToMeta(v);
  if (st.value.phase !== 'youtube') return;
  if (hasQueue.value) {
    props.addVcYoutubeToQueue(entryFromItem(v));
  } else {
    props.setVcActivityYoutubeVideo(v.id, meta);
  }
}

/** Always replace queue and play this video (from queue row “play now” semantics). */
function playVideoNow(v: EchoYoutubeSearchItem) {
  props.setVcActivityYoutubeVideo(v.id, rowToMeta(v));
}

/** Single field: URL / video id plays immediately; otherwise YouTube search. */
async function submitFindField() {
  const raw = searchDraft.value.trim();
  if (!raw) return;
  const id = parseYoutubeVideoId(raw);
  if (id) {
    searchError.value = '';
    searchHint.value = null;
    props.setVcActivityYoutubeVideo(id);
    return;
  }
  await runSearch();
}

function openBrowseFind() {
  browseTab.value = 'find';
  props.setVcYoutubeBrowseOpen(true);
}

function openBrowseQueue() {
  browseTab.value = 'queue';
  props.setVcYoutubeBrowseOpen(true);
}

function toggleBrowseFind() {
  if (st.value.youtubeBrowseOpen && browseTab.value === 'find') {
    props.setVcYoutubeBrowseOpen(false);
  } else {
    openBrowseFind();
  }
}

function toggleBrowseQueue() {
  if (st.value.youtubeBrowseOpen && browseTab.value === 'queue') {
    props.setVcYoutubeBrowseOpen(false);
  } else {
    openBrowseQueue();
  }
}

function onKeydownRoot(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  if (st.value.phase === 'youtube') {
    if (st.value.youtubeBrowseOpen) {
      props.setVcYoutubeBrowseOpen(false);
    } else if (st.value.youtubeVideoId) {
      props.openVcActivityPicker();
    } else {
      props.openVcActivityPicker();
    }
  } else if (st.value.phase === 'wordle' || st.value.phase === 'hangman') {
    props.openVcActivityPicker();
  } else if (isVcIframeEmbedPhase(st.value.phase)) {
    props.openVcActivityPicker();
  } else {
    props.closeVcActivity();
  }
}

function headerBack() {
  if (
    st.value.phase === 'youtube' ||
    st.value.phase === 'wordle' ||
    st.value.phase === 'hangman' ||
    isVcIframeEmbedPhase(st.value.phase)
  ) {
    props.openVcActivityPicker();
  } else {
    props.closeVcActivity();
  }
}

const showRevealChannelListInActivityHeader = computed(() => {
  if (props.compactLayout) {
    return typeof props.onMobileBackToChannels === 'function';
  }
  return (
    !!props.channelPanelCollapsed && typeof props.expandChannels === 'function'
  );
});

function revealChannelListFromActivity() {
  if (props.compactLayout) {
    props.onMobileBackToChannels?.();
  } else {
    props.expandChannels?.();
  }
}

let activityOverflowRo: ResizeObserver | null = null;
let activityOverflowDebounce: ReturnType<typeof setTimeout> | null = null;

function teardownActivityOverflowLayoutWatch() {
  if (activityOverflowDebounce) {
    clearTimeout(activityOverflowDebounce);
    activityOverflowDebounce = null;
  }
  if (activityOverflowRo) {
    activityOverflowRo.disconnect();
    activityOverflowRo = null;
  }
}

function activitySubtreeHasCrampedVerticalScroll(root: HTMLElement): boolean {
  const stack: HTMLElement[] = [root];
  while (stack.length) {
    const el = stack.pop()!;
    const stl = getComputedStyle(el);
    const oy = stl.overflowY;
    if (oy !== 'auto' && oy !== 'scroll' && oy !== 'overlay') {
      for (const c of el.children) {
        if (c instanceof HTMLElement) stack.push(c);
      }
      continue;
    }
    const overflowPx = el.scrollHeight - el.clientHeight;
    if (overflowPx > 14 && el.scrollTop <= 10) {
      return true;
    }
    for (const c of el.children) {
      if (c instanceof HTMLElement) stack.push(c);
    }
  }
  return false;
}

function scheduleActivityOverflowChannelNarrow(root: HTMLElement) {
  if (props.isCompactShell) return;
  if (props.compactLayout) return;
  if (props.channelPanelCollapsed) return;
  if (st.value.phase === 'closed') return;
  const step = props.narrowChannelPanelForActivityOverflowStep;
  if (!step) return;
  if (activityOverflowDebounce) clearTimeout(activityOverflowDebounce);
  activityOverflowDebounce = setTimeout(() => {
    activityOverflowDebounce = null;
    if (!activitySubtreeHasCrampedVerticalScroll(root)) return;
    step();
  }, 120);
}

watch(
  [
    stageRootRef,
    () => st.value.phase,
    () => props.isCompactShell,
    () => props.compactLayout,
    () => props.channelPanelCollapsed,
  ],
  () => {
    teardownActivityOverflowLayoutWatch();
    const root = stageRootRef.value;
    const phase = st.value.phase;
    if (
      !root ||
      phase === 'closed' ||
      props.isCompactShell ||
      props.compactLayout
    ) {
      return;
    }
    if (!props.narrowChannelPanelForActivityOverflowStep) return;

    activityOverflowRo = new ResizeObserver(() => {
      scheduleActivityOverflowChannelNarrow(root);
    });
    activityOverflowRo.observe(root);
    void nextTick(() => scheduleActivityOverflowChannelNarrow(root));
  },
  { flush: 'post' },
);
</script>

<template>
  <div
    ref="stageRootRef"
    class="vc-act-stage flex min-h-0 min-w-0 flex-1 flex-col bg-bg text-fg"
    role="region"
    :aria-label="activityRegionLabel"
    tabindex="-1"
    @keydown="onKeydownRoot"
  >
    <header
      class="vc-act-header flex h-11 min-h-11 w-full min-w-0 shrink-0 items-center gap-1.5 border-b border-border bg-elevated px-2 sm:px-3"
    >
      <button
        type="button"
        class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
        aria-label="Back to activities"
        @click="headerBack"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <button
        v-if="showRevealChannelListInActivityHeader"
        type="button"
        class="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg sm:px-2"
        :aria-label="compactLayout ? 'Show channels' : 'Show channel list'"
        :title="compactLayout ? 'Show channels' : 'Show channel list'"
        @click="revealChannelListFromActivity"
      >
        <span class="hidden sm:inline">Show channel list</span>
        <span class="sm:hidden">Channels</span>
      </button>
      <div
        v-if="st.phase === 'pick'"
        class="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight"
        title="Activities"
      >
        Activities
      </div>
      <button
        v-else-if="focusGuildVoiceChannelInSidebar"
        type="button"
        class="min-w-0 flex-1 truncate rounded-md text-left text-[13px] font-semibold leading-tight text-fg transition hover:bg-glass-hover"
        :title="`${voiceChannelLabel} — Go to channel`"
        @click="focusGuildVoiceChannelInSidebar?.()"
      >
        {{ voiceChannelLabel }}
      </button>
      <div
        v-else
        class="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight"
        :title="voiceChannelLabel"
      >
        {{ voiceChannelLabel }}
      </div>
      <button
        v-if="voiceSideChatCollapsed"
        type="button"
        class="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg sm:px-2"
        aria-label="Reopen chat"
        title="Reopen chat"
        @click="expandVoiceSideChat()"
      >
        <svg
          class="h-4 w-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          />
        </svg>
        <span class="hidden sm:inline">Reopen chat</span>
      </button>
      <button
        v-if="showVcFullscreenControl"
        type="button"
        class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
        :aria-label="
          activityFullscreenActive ? 'Exit full screen' : 'Enter full screen'
        "
        :title="activityFullscreenActive ? 'Exit full screen' : 'Full screen'"
        @click="toggleActivityFullscreen"
      >
        <svg
          v-if="!activityFullscreenActive"
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="15 3 21 3 21 9" />
          <polyline points="9 21 3 21 3 15" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
        <svg
          v-else
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="4 14 10 14 10 20" />
          <polyline points="20 10 14 10 14 4" />
          <line x1="14" y1="10" x2="21" y2="3" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      </button>
      <button
        v-if="st.phase === 'youtube'"
        type="button"
        class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
        :class="
          st.youtubeBrowseOpen && browseTab === 'find'
            ? 'bg-glass-2 text-fg'
            : ''
        "
        :aria-pressed="st.youtubeBrowseOpen && browseTab === 'find'"
        aria-label="Search videos"
        title="Search"
        @click="toggleBrowseFind"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3-3" stroke-linecap="round" />
        </svg>
      </button>
      <button
        v-if="st.phase === 'youtube' && st.playlist.length"
        type="button"
        class="inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-0.5 rounded-md px-1.5 text-[11px] font-medium text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
        :class="
          st.youtubeBrowseOpen && browseTab === 'queue'
            ? 'bg-glass-2 text-fg'
            : ''
        "
        :aria-pressed="st.youtubeBrowseOpen && browseTab === 'queue'"
        :title="`Queue (${st.playlist.length})`"
        @click="toggleBrowseQueue"
      >
        <span class="hidden sm:inline">Queue</span>
        <span class="tabular-nums text-fg-subtle">{{
          st.playlist.length
        }}</span>
      </button>
      <button
        type="button"
        class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
        aria-label="Close activities"
        title="Close"
        @click="closeVcActivity"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </header>

    <!-- Activity library -->
    <div
      v-if="st.phase === 'pick'"
      class="vc-act-library custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6"
    >
      <div
        class="vc-act-library__intro mx-auto mb-5 w-full max-w-[min(100%,90rem)]"
      >
        <h2
          class="text-[1.05rem] font-bold leading-tight tracking-tight text-fg sm:text-xl"
        >
          Activity library
        </h2>
        <p
          class="mt-1.5 max-w-xl text-[11px] leading-snug text-fg-subtle sm:text-[13px]"
        >
          Launch something for your voice channel — each card opens in the
          activity panel next to chat.
        </p>
      </div>
      <div class="vc-act-library__grid mx-auto w-full max-w-[min(100%,90rem)]">
        <button
          v-for="card in sortedVcActivityLibraryCards"
          :key="card.key"
          type="button"
          class="vc-act-widget group text-left"
          :class="card.widgetClass"
          :aria-label="card.ariaLabel"
          @click="openActivityFromLibrary(card.key)"
        >
          <div class="vc-act-widget__media">
            <img
              :src="vcActivityArt[card.artKey]"
              alt=""
              width="640"
              height="400"
              class="vc-act-widget__img"
              loading="lazy"
              decoding="async"
            />
            <div class="vc-act-widget__media-scrim" aria-hidden="true" />
          </div>
          <div class="vc-act-widget__body">
            <div class="vc-act-widget__title-row">
              <span class="vc-act-widget__title">{{ card.title }}</span>
              <span class="vc-act-widget__cta" aria-hidden="true">Open</span>
            </div>
            <p class="vc-act-widget__desc">
              {{ card.description }}
            </p>
          </div>
        </button>
      </div>
    </div>

    <div
      v-else-if="st.phase === 'youtube'"
      class="relative flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row"
    >
      <!-- Mobile: quick open search (header has same actions) -->
      <button
        v-if="compactLayout && st.phase === 'youtube'"
        type="button"
        class="absolute bottom-3 right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-elevated text-fg-soft shadow-md sm:hidden"
        aria-label="Search"
        @click="toggleBrowseFind"
      >
        <svg
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3-3" stroke-linecap="round" />
        </svg>
      </button>

      <!-- Browse drawer: Search | Queue (compact) -->
      <aside
        v-show="st.youtubeBrowseOpen"
        class="vc-act-browse-drawer flex min-h-0 shrink-0 flex-col border-border bg-surface lg:relative lg:z-10 lg:max-h-none lg:w-[min(300px,36vw)] lg:border-r"
        :class="
          compactLayout
            ? 'absolute inset-0 z-[15] max-h-none border-r-0'
            : 'max-h-[42vh] border-b lg:max-h-none lg:border-b-0'
        "
      >
        <div
          v-if="compactLayout && st.youtubeBrowseOpen"
          class="flex shrink-0 items-center justify-end border-b border-border px-2 py-1"
        >
          <button
            type="button"
            class="rounded-md px-2.5 py-1 text-[13px] font-medium text-fg-soft hover:bg-glass-hover hover:text-fg"
            @click="setVcYoutubeBrowseOpen(false)"
          >
            Done
          </button>
        </div>
        <div
          class="flex shrink-0 gap-0.5 border-b border-border p-1.5"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            class="min-h-8 flex-1 rounded-md px-2 text-[11px] font-semibold transition-colors"
            :class="
              browseTab === 'find'
                ? 'bg-glass-2 text-fg'
                : 'text-fg-soft hover:bg-glass-hover hover:text-fg'
            "
            :aria-selected="browseTab === 'find'"
            @click="browseTab = 'find'"
          >
            Search
          </button>
          <button
            type="button"
            role="tab"
            class="min-h-8 flex-1 rounded-md px-2 text-[11px] font-semibold transition-colors"
            :class="
              browseTab === 'queue'
                ? 'bg-glass-2 text-fg'
                : 'text-fg-soft hover:bg-glass-hover hover:text-fg'
            "
            :aria-selected="browseTab === 'queue'"
            @click="browseTab = 'queue'"
          >
            Up next
            <span
              v-if="st.playlist.length"
              class="ml-0.5 tabular-nums text-fg-subtle"
              >{{ st.playlist.length }}</span
            >
          </button>
        </div>

        <!-- Find tab -->
        <div
          v-show="browseTab === 'find'"
          class="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <div class="shrink-0 border-b border-border p-2">
            <div class="flex gap-1.5">
              <input
                v-model="searchDraft"
                type="search"
                class="min-w-0 flex-1 rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-[13px] text-fg outline-none placeholder:text-fg-subtle focus:border-[color-mix(in_srgb,var(--accent)_50%,var(--border))]"
                placeholder="Search or paste a link…"
                autocomplete="off"
                @keydown.enter.prevent="submitFindField"
              />
              <button
                type="button"
                class="shrink-0 rounded-lg bg-red-600 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                :disabled="searchLoading"
                @click="submitFindField"
              >
                {{ searchLoading ? '…' : 'Go' }}
              </button>
            </div>
            <p v-if="searchError" class="vc-act-msg-err mt-1.5 text-[11px]">
              {{ searchError }}
            </p>
            <p
              v-else-if="searchHint"
              class="vc-act-msg-hint mt-1.5 text-[10px] leading-snug"
            >
              {{ searchHint }}
            </p>
          </div>
          <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-1.5">
            <div
              v-if="searchLoading"
              class="py-8 text-center text-[12px] text-fg-subtle"
            >
              Searching…
            </div>
            <template v-else>
              <div
                v-if="!searchResults.length"
                class="mb-2 space-y-2 border-b border-border/80 pb-2"
              >
                <div class="flex flex-wrap gap-1">
                  <button
                    v-for="p in QUICK_SEARCH_PRESETS"
                    :key="p.q"
                    type="button"
                    class="rounded-full border border-border bg-glass-1 px-2 py-0.5 text-[10px] font-medium text-fg-soft transition-colors hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] hover:bg-glass-hover hover:text-fg"
                    @click="applyPresetSearch(p.q)"
                  >
                    {{ p.label }}
                  </button>
                </div>
                <div class="flex items-center justify-between gap-2 px-0.5">
                  <span
                    class="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle"
                  >
                    Popular on YouTube
                  </span>
                  <button
                    type="button"
                    class="text-[10px] font-semibold text-fg-soft hover:text-fg disabled:opacity-40"
                    :disabled="popularLoading"
                    @click="loadPopular"
                  >
                    Refresh
                  </button>
                </div>
                <p v-if="popularError" class="vc-act-msg-err text-[11px]">
                  {{ popularError }}
                </p>
                <p
                  v-else-if="popularHint"
                  class="vc-act-msg-hint text-[10px] leading-snug"
                >
                  {{ popularHint }}
                </p>
              </div>
              <div
                v-if="
                  popularLoading &&
                  !searchResults.length &&
                  !popularItems.length
                "
                class="py-6 text-center text-[12px] text-fg-subtle"
              >
                Loading suggestions…
              </div>
              <ul v-else-if="primaryFindRows.length" class="space-y-0.5">
                <li v-for="v in primaryFindRows" :key="'vc-find-' + v.id">
                  <div
                    class="flex w-full gap-1.5 rounded-lg px-1 py-0.5 transition-colors"
                    :class="
                      st.youtubeVideoId === v.id
                        ? 'bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--accent)_40%,var(--border))]'
                        : 'hover:bg-glass-hover'
                    "
                  >
                    <button
                      type="button"
                      class="flex min-w-0 flex-1 gap-2 text-left"
                      @click="pickVideo(v)"
                    >
                      <div
                        class="relative h-9 w-16 shrink-0 overflow-hidden rounded bg-muted"
                      >
                        <img
                          v-if="v.thumbnailUrl"
                          :src="v.thumbnailUrl"
                          alt=""
                          class="h-full w-full object-cover"
                          loading="lazy"
                        />
                        <div
                          v-else
                          class="flex h-full w-full items-center justify-center text-[9px] text-fg-subtle"
                        >
                          ▶
                        </div>
                      </div>
                      <div class="min-w-0 flex-1 py-0.5">
                        <div
                          class="line-clamp-2 text-[12px] font-medium leading-tight"
                        >
                          {{ v.title }}
                        </div>
                        <div class="truncate text-[10px] text-fg-subtle">
                          {{ v.channelTitle }}
                        </div>
                      </div>
                    </button>
                    <button
                      v-if="hasQueue"
                      type="button"
                      class="shrink-0 self-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-fg-soft hover:bg-glass-hover"
                      title="Play now"
                      @click.stop="playVideoNow(v)"
                    >
                      Now
                    </button>
                  </div>
                </li>
              </ul>
              <p
                v-else
                class="px-1 py-6 text-center text-[11px] text-fg-subtle"
              >
                Results appear here. Try a quick topic above, trending, or paste
                a link.
              </p>
            </template>
          </div>
        </div>

        <!-- Queue tab: suggestions + full playlist (Legacy “Up next”) -->
        <div
          v-show="browseTab === 'queue'"
          class="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div
            v-if="st.playlist.length"
            class="shrink-0 border-b border-border bg-elevated/90 p-2"
          >
            <div class="mb-1.5 flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div
                  class="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle"
                >
                  Suggested next
                </div>
                <div
                  v-if="queueSuggestSeedTitle"
                  class="truncate text-[10px] text-fg-subtle"
                  :title="queueSuggestSeedTitle"
                >
                  Based on · {{ queueSuggestSeedTitle }}
                </div>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-fg-soft hover:bg-glass-hover hover:text-fg disabled:opacity-40"
                :disabled="queueSuggestLoading"
                @click="loadQueueSuggestions"
              >
                Refresh
              </button>
            </div>
            <p v-if="queueSuggestError" class="vc-act-msg-err mb-1 text-[11px]">
              {{ queueSuggestError }}
            </p>
            <div
              v-if="queueSuggestLoading && !queueSuggestItems.length"
              class="py-3 text-center text-[11px] text-fg-subtle"
            >
              Loading ideas…
            </div>
            <ul
              v-else-if="queueSuggestItems.length"
              class="max-h-[36vh] space-y-0.5 overflow-y-auto rounded-lg border border-border/60 bg-glass-1/50 p-1 lg:max-h-44"
            >
              <li v-for="v in queueSuggestItems" :key="'vc-q-sug-' + v.id">
                <div
                  class="flex w-full gap-1 rounded-md px-0.5 py-0.5 hover:bg-glass-hover"
                >
                  <button
                    type="button"
                    class="flex min-w-0 flex-1 gap-2 text-left"
                    @click="pickVideo(v)"
                  >
                    <div
                      class="relative h-8 w-14 shrink-0 overflow-hidden rounded bg-muted"
                    >
                      <img
                        v-if="v.thumbnailUrl"
                        :src="v.thumbnailUrl"
                        alt=""
                        class="h-full w-full object-cover"
                        loading="lazy"
                      />
                      <div
                        v-else
                        class="flex h-full w-full items-center justify-center text-[8px] text-fg-subtle"
                      >
                        ▶
                      </div>
                    </div>
                    <div class="min-w-0 flex-1 py-0.5">
                      <div
                        class="line-clamp-2 text-[11px] font-medium leading-tight"
                      >
                        {{ v.title }}
                      </div>
                      <div class="truncate text-[9px] text-fg-subtle">
                        {{ v.channelTitle }}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    class="shrink-0 self-center rounded bg-red-600/90 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-red-500"
                    @click.stop="pickVideo(v)"
                  >
                    Add
                  </button>
                </div>
              </li>
            </ul>
            <p
              v-else-if="queueSuggestHint && !queueSuggestLoading"
              class="text-[10px] leading-snug text-fg-subtle"
            >
              {{ queueSuggestHint }}
            </p>
          </div>
          <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-1.5">
            <p
              v-if="!st.playlist.length"
              class="px-1 py-8 text-center text-[11px] text-fg-subtle"
            >
              Nothing queued. Add videos from Search or from suggestions.
            </p>
            <ul v-else class="space-y-0.5">
              <li
                v-for="(row, i) in st.playlist"
                :key="row.id + ':' + i"
                class="flex items-center gap-0.5 rounded-lg px-1 py-0.5"
                :class="
                  i === st.currentIndex
                    ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]'
                    : 'hover:bg-glass-hover/80'
                "
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 gap-2 text-left"
                  @click="playVcYoutubeAtIndex(i)"
                >
                  <div
                    class="relative h-9 w-16 shrink-0 overflow-hidden rounded bg-muted"
                  >
                    <img
                      v-if="row.thumbnailUrl"
                      :src="row.thumbnailUrl"
                      alt=""
                      class="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div
                      v-else
                      class="flex h-full w-full items-center justify-center text-[9px] text-fg-subtle"
                    >
                      ▶
                    </div>
                  </div>
                  <div class="min-w-0 flex-1 py-0.5">
                    <div class="flex items-center gap-1">
                      <span
                        v-if="i === st.currentIndex"
                        class="shrink-0 text-[9px] font-bold uppercase text-fg-subtle"
                        >Now</span
                      >
                      <span
                        class="line-clamp-2 text-[12px] font-medium leading-tight"
                        >{{ row.title }}</span
                      >
                    </div>
                    <div class="truncate text-[10px] text-fg-subtle">
                      {{ row.channelTitle }}
                    </div>
                  </div>
                </button>
                <div class="flex shrink-0 flex-col">
                  <button
                    type="button"
                    class="rounded p-0.5 text-fg-soft hover:bg-glass-hover disabled:opacity-30"
                    aria-label="Move up"
                    :disabled="i === 0"
                    @click="moveVcYoutubeInQueue(i, i - 1)"
                  >
                    <svg
                      class="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M7 14l5-5 5 5H7z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="rounded p-0.5 text-fg-soft hover:bg-glass-hover disabled:opacity-30"
                    aria-label="Move down"
                    :disabled="i >= st.playlist.length - 1"
                    @click="moveVcYoutubeInQueue(i, i + 1)"
                  >
                    <svg
                      class="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M7 10l5 5 5-5H7z" />
                    </svg>
                  </button>
                </div>
                <button
                  type="button"
                  class="shrink-0 rounded p-1 text-fg-soft hover:bg-glass-hover hover:text-red-400"
                  aria-label="Remove from queue"
                  @click="removeVcYoutubeFromQueue(i)"
                >
                  <svg
                    class="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            </ul>
          </div>
        </div>
      </aside>

      <!-- Main + queue -->
      <div
        class="flex min-h-0 min-w-0 flex-1 flex-col"
        :class="st.youtubeBrowseOpen && !compactLayout ? 'lg:pl-0' : ''"
      >
        <div
          class="vc-act-player-pane relative min-h-0 min-w-0 flex-1"
          :class="[
            compactLayout ? 'min-h-[36vh]' : '',
            embedSrc ? 'bg-black' : 'bg-bg',
          ]"
        >
          <iframe
            v-if="embedSrc"
            :key="st.youtubeVideoId ?? ''"
            :src="embedSrc"
            class="absolute inset-0 h-full w-full border-0"
            title="YouTube video"
            allow="
              accelerometer;
              autoplay;
              clipboard-write;
              encrypted-media;
              gyroscope;
              picture-in-picture;
              web-share;
            "
            referrerpolicy="strict-origin-when-cross-origin"
            allowfullscreen
          />
          <div
            v-else
            class="custom-scrollbar absolute inset-0 overflow-y-auto px-2 py-2 sm:px-3"
          >
            <div class="mb-2 flex items-center justify-between gap-2">
              <span
                class="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle"
              >
                Suggested
              </span>
              <button
                type="button"
                class="text-[10px] font-semibold text-fg-soft hover:text-fg"
                :disabled="popularLoading"
                @click="loadPopular"
              >
                Refresh
              </button>
            </div>
            <p v-if="popularError" class="vc-act-msg-err mb-1.5 text-[11px]">
              {{ popularError }}
            </p>
            <p
              v-else-if="popularHint"
              class="vc-act-msg-hint mb-1.5 text-[10px] leading-snug"
            >
              {{ popularHint }}
            </p>
            <div
              v-if="popularLoading"
              class="py-10 text-center text-[12px] text-fg-subtle"
            >
              Loading…
            </div>
            <ul v-else class="mx-auto max-w-3xl space-y-0.5">
              <li v-for="v in popularItems" :key="v.id">
                <button
                  type="button"
                  class="flex w-full gap-2 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-glass-hover"
                  @click="pickVideo(v)"
                >
                  <div
                    class="relative h-9 w-16 shrink-0 overflow-hidden rounded bg-muted"
                  >
                    <img
                      v-if="v.thumbnailUrl"
                      :src="v.thumbnailUrl"
                      alt=""
                      class="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div class="min-w-0 flex-1 py-0.5">
                    <div
                      class="line-clamp-2 text-[12px] font-medium leading-tight"
                    >
                      {{ v.title }}
                    </div>
                    <div class="truncate text-[10px] text-fg-subtle">
                      {{ v.channelTitle }}
                    </div>
                  </div>
                </button>
              </li>
            </ul>
          </div>
        </div>

        <!-- Slim transport: prev/next + now playing + open queue (full list in drawer) -->
        <div
          v-if="st.phase === 'youtube' && st.playlist.length"
          class="vc-act-transport flex shrink-0 items-center gap-1 border-t border-border bg-elevated px-1.5 py-1"
        >
          <div class="flex shrink-0 items-center gap-px">
            <button
              type="button"
              class="rounded-md p-1 text-fg-soft hover:bg-glass-hover hover:text-fg disabled:opacity-35"
              aria-label="Previous in queue"
              :disabled="st.currentIndex <= 0"
              @click="playVcYoutubePrevious"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
              </svg>
            </button>
            <button
              type="button"
              class="rounded-md p-1 text-fg-soft hover:bg-glass-hover hover:text-fg disabled:opacity-35"
              aria-label="Next in queue"
              :disabled="st.currentIndex >= st.playlist.length - 1"
              @click="playVcYoutubeNext"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>
          </div>
          <div class="min-w-0 flex-1 px-1">
            <div
              class="truncate text-[11px] font-medium leading-tight"
              :title="nowPlaying?.title ?? ''"
            >
              {{ nowPlaying?.title ?? '—' }}
            </div>
            <div
              v-if="nextInQueue"
              class="truncate text-[10px] leading-tight text-fg-subtle"
              :title="nextInQueue.title"
            >
              Next · {{ nextInQueue.title }}
            </div>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-fg-soft hover:bg-glass-hover hover:text-fg sm:px-2"
            :title="`Up next · ${st.playlist.length} in queue`"
            @click="toggleBrowseQueue"
          >
            <span class="sm:hidden">{{ st.playlist.length }}</span>
            <span class="hidden sm:inline">Up next</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Wordline (Echo's in-client Wordle) -->
    <div
      v-else-if="st.phase === 'wordle'"
      class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <VcWordlineActivity
        class="min-h-0 min-w-0 flex-1"
        :account-user-id="currentUserId"
        :app-base="appBase"
      />
    </div>

    <!-- Hangman (voice-synced) -->
    <div
      v-else-if="st.phase === 'hangman'"
      class="custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    >
      <VcHangmanGame
        class="min-h-0 min-w-0 flex-1"
        :current-user-id="currentUserId ?? undefined"
        :hangman-activity="hmActivity"
        :hangman-roster-user-ids="hmRoster"
        :voice-participants="hangmanVoiceParticipants"
        :commit-word="props.commitVcHangmanWord"
        :guess-letter="props.requestVcHangmanGuessLetter"
        :next-round="props.requestVcHangmanNextRound"
      />
    </div>

    <!-- Codenames: one shared room URL synced over LiveKit (`youtube_activity.codenamesRoomUrl`). -->
    <div
      v-else-if="st.phase === 'codenames'"
      class="relative flex min-h-0 min-w-0 flex-1 flex-col bg-black"
    >
      <div
        v-if="codenamesHoldUi"
        class="custom-scrollbar flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center"
      >
        <div class="max-w-md space-y-2">
          <p class="text-[15px] font-semibold text-fg">
            Waiting for the Codenames host
          </p>
          <p class="text-sm leading-relaxed text-fg-soft">
            The session host is creating your shared room. You will join
            automatically as soon as the invite link is ready.
          </p>
          <p
            v-if="codenamesWaitTimedOut"
            class="text-xs leading-relaxed text-fg-subtle"
          >
            This is taking longer than expected. Ask the host to paste the
            invite link from Codenames, or try re-opening the activity.
          </p>
        </div>
      </div>
      <template v-else>
        <iframe
          :key="iframeEmbedKey"
          :src="codenamesEmbedSrc"
          class="absolute inset-0 h-full w-full border-0"
          title="Codenames"
          allow="
            accelerometer;
            autoplay;
            clipboard-write;
            encrypted-media;
            fullscreen;
            gamepad;
            geolocation;
            gyroscope;
            microphone;
            camera;
            payment;
            picture-in-picture;
          "
          referrerpolicy="strict-origin-when-cross-origin"
          allowfullscreen
        />
        <div
          v-if="isCodenamesStarter && !codenamesSyncedUrl"
          class="pointer-events-auto absolute bottom-0 left-0 right-0 border-t border-white/[0.08] bg-gradient-to-t from-black/95 via-black/70 to-transparent p-3"
        >
          <p class="mb-2 text-[11px] font-medium text-fg-soft">
            Have the invite link from your browser or the in-game share dialog?
            Paste it so everyone joins the same room.
          </p>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              v-model="codenamesPasteDraft"
              type="url"
              placeholder="https://codenames.game/…"
              class="min-h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/60 px-2.5 py-1.5 text-xs text-fg outline-none focus:border-sky-400/55 focus:ring-2 focus:ring-sky-400/20"
              autocomplete="off"
            />
            <button
              type="button"
              class="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-fg transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="!codenamesPasteDraft.trim()"
              @click="applyCodenamesPaste"
            >
              Share with voice
            </button>
          </div>
        </div>
      </template>
    </div>

    <!-- Third-party iframe games (OpenGuessr, skribbl.io, Gartic Phone, Krunker, Codenames, Richup, Goober Dash, Smash Karts, Basketball Stars 2026, Cluster Rush) -->
    <div
      v-else-if="iframeEmbedPhase"
      class="relative min-h-0 min-w-0 flex-1 bg-black"
    >
      <iframe
        :key="iframeEmbedKey"
        :src="iframeEmbedSrc"
        class="absolute inset-0 h-full w-full border-0"
        :title="iframeEmbedTitle"
        allow="
          accelerometer;
          autoplay;
          clipboard-write;
          encrypted-media;
          fullscreen;
          gamepad;
          geolocation;
          gyroscope;
          microphone;
          camera;
          payment;
          picture-in-picture;
        "
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
/* Activity library — image-forward grid cards */
.vc-act-library {
  background:
    radial-gradient(
      120% 80% at 50% -10%,
      color-mix(in srgb, var(--elevated) 88%, white 4%) 0%,
      transparent 55%
    ),
    var(--bg);
}

.vc-act-library__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.875rem;
}

@media (min-width: 480px) {
  .vc-act-library__grid {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 15.75rem), 1fr));
    gap: 1rem;
  }
}

@media (min-width: 900px) {
  .vc-act-library__grid {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 17.25rem), 1fr));
    gap: 1.125rem;
  }
}

@media (min-width: 1400px) {
  .vc-act-library__grid {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 18.5rem), 1fr));
    gap: 1.25rem;
  }
}

.vc-act-widget {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 1.125rem;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  background: color-mix(in srgb, var(--elevated) 96%, var(--bg));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 14px 36px color-mix(in srgb, black 22%, transparent);
  outline: none;
  transition:
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.22s ease,
    border-color 0.2s ease,
    background 0.25s ease;
}

.vc-act-widget:hover {
  transform: translateY(-3px);
  box-shadow:
    0 1px 0 color-mix(in srgb, white 10%, transparent) inset,
    0 22px 48px color-mix(in srgb, black 30%, transparent);
}

.vc-act-widget:focus-visible {
  box-shadow:
    0 0 0 2px color-mix(in srgb, #7dd3fc 45%, transparent),
    0 18px 40px color-mix(in srgb, black 26%, transparent);
}

/* —— Per-activity art direction (card + hero tile) —— */

.vc-act-widget--youtube {
  --vc-act-a1: #ff2d4d;
  --vc-act-a2: #6b1020;
  background:
    radial-gradient(
      125% 95% at 100% -5%,
      color-mix(in srgb, var(--vc-act-a1) 40%, transparent) 0%,
      transparent 52%
    ),
    radial-gradient(
      95% 85% at 0% 100%,
      color-mix(in srgb, var(--vc-act-a2) 32%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      168deg,
      color-mix(in srgb, var(--elevated) 90%, #140608) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 24%, var(--border));
}
.vc-act-widget--youtube .vc-act-widget__media {
  background: linear-gradient(150deg, #100508 0%, #1a0a10 45%, #0a1524 100%);
}
.vc-act-widget--youtube:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 44%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 9%, transparent) inset,
    0 24px 56px color-mix(in srgb, var(--vc-act-a1) 16%, black 28%);
}
.vc-act-widget--youtube:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 52%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 38%, transparent),
    0 20px 48px color-mix(in srgb, black 30%, transparent);
}
.vc-act-widget--youtube .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 78%, var(--vc-act-a1) 22%);
}

.vc-act-widget--wordle {
  --vc-act-a1: #6aaa64;
  --vc-act-a2: #2f4d2c;
  background:
    radial-gradient(
      120% 100% at 12% -8%,
      color-mix(in srgb, var(--vc-act-a1) 36%, transparent) 0%,
      transparent 50%
    ),
    radial-gradient(
      100% 90% at 95% 100%,
      color-mix(in srgb, var(--vc-act-a2) 38%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 88%, #060806) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 22%, var(--border));
}
.vc-act-widget--wordle .vc-act-widget__media {
  background: linear-gradient(155deg, #050806 0%, #0c120c 50%, #0a1410 100%);
}
.vc-act-widget--wordle:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 42%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 52px color-mix(in srgb, var(--vc-act-a1) 14%, black 26%);
}
.vc-act-widget--wordle:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 50%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 35%, transparent),
    0 20px 44px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--wordle .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 75%, var(--vc-act-a1) 25%);
}

.vc-act-widget--hangman {
  --vc-act-a1: #f59e0b;
  --vc-act-a2: #7c3aed;
  background:
    radial-gradient(
      115% 100% at 12% -5%,
      color-mix(in srgb, var(--vc-act-a1) 32%, transparent) 0%,
      transparent 50%
    ),
    radial-gradient(
      100% 95% at 100% 100%,
      color-mix(in srgb, var(--vc-act-a2) 30%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      172deg,
      color-mix(in srgb, var(--elevated) 90%, #120810) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 22%, var(--border));
}
.vc-act-widget--hangman .vc-act-widget__media {
  background: linear-gradient(150deg, #140c08 0%, #120a18 48%, #0a1018 100%);
}
.vc-act-widget--hangman:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 42%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 52px color-mix(in srgb, var(--vc-act-a1) 14%, black 26%);
}
.vc-act-widget--hangman:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 50%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 35%, transparent),
    0 20px 44px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--hangman .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 74%, var(--vc-act-a1) 26%);
}

.vc-act-widget--openguessr {
  --vc-act-a1: #2b8a7a;
  --vc-act-a2: #1e4d7a;
  background:
    radial-gradient(
      115% 95% at 0% 0%,
      color-mix(in srgb, var(--vc-act-a1) 34%, transparent) 0%,
      transparent 48%
    ),
    radial-gradient(
      110% 100% at 100% 100%,
      color-mix(in srgb, var(--vc-act-a2) 36%, transparent) 0%,
      transparent 52%
    ),
    linear-gradient(
      165deg,
      color-mix(in srgb, var(--elevated) 90%, #050c10) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 22%, var(--border));
}
.vc-act-widget--openguessr .vc-act-widget__media {
  background: linear-gradient(145deg, #041016 0%, #0a1a22 45%, #06120f 100%);
}
.vc-act-widget--openguessr:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 40%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 52px color-mix(in srgb, var(--vc-act-a2) 12%, black 26%);
}
.vc-act-widget--openguessr:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 48%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 34%, transparent),
    0 20px 44px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--openguessr .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 76%, var(--vc-act-a1) 24%);
}

.vc-act-widget--skribblio {
  --vc-act-a1: #22d3ee;
  --vc-act-a2: #0f766e;
  background:
    radial-gradient(
      115% 95% at 8% 0%,
      color-mix(in srgb, var(--vc-act-a1) 36%, transparent) 0%,
      transparent 48%
    ),
    radial-gradient(
      105% 100% at 100% 100%,
      color-mix(in srgb, var(--vc-act-a2) 32%, transparent) 0%,
      transparent 50%
    ),
    linear-gradient(
      168deg,
      color-mix(in srgb, var(--elevated) 88%, #041216) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 24%, var(--border));
}
.vc-act-widget--skribblio .vc-act-widget__media {
  background: linear-gradient(150deg, #041a1c 0%, #0c1e2e 48%, #061814 100%);
}
.vc-act-widget--skribblio:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 44%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 52px color-mix(in srgb, var(--vc-act-a1) 14%, black 26%);
}
.vc-act-widget--skribblio:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 50%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 36%, transparent),
    0 20px 44px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--skribblio .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 74%, var(--vc-act-a1) 26%);
}

.vc-act-widget--garticphone {
  --vc-act-a1: #c084fc;
  --vc-act-a2: #db2777;
  background:
    radial-gradient(
      120% 100% at 100% 0%,
      color-mix(in srgb, var(--vc-act-a1) 32%, transparent) 0%,
      transparent 50%
    ),
    radial-gradient(
      95% 90% at 0% 100%,
      color-mix(in srgb, var(--vc-act-a2) 28%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      170deg,
      color-mix(in srgb, var(--elevated) 88%, #120818) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 24%, var(--border));
}
.vc-act-widget--garticphone .vc-act-widget__media {
  background: linear-gradient(160deg, #140818 0%, #1a0a16 40%, #0c1020 100%);
}
.vc-act-widget--garticphone:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 42%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 9%, transparent) inset,
    0 24px 54px color-mix(in srgb, var(--vc-act-a2) 14%, black 26%);
}
.vc-act-widget--garticphone:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 50%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 36%, transparent),
    0 20px 46px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--garticphone .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 74%, var(--vc-act-a1) 26%);
}

.vc-act-widget--krunker {
  --vc-act-a1: #f97316;
  --vc-act-a2: #0d4d3d;
  background:
    radial-gradient(
      110% 100% at 85% -5%,
      color-mix(in srgb, var(--vc-act-a1) 34%, transparent) 0%,
      transparent 48%
    ),
    radial-gradient(
      100% 95% at 0% 100%,
      color-mix(in srgb, var(--vc-act-a2) 32%, transparent) 0%,
      transparent 50%
    ),
    linear-gradient(
      172deg,
      color-mix(in srgb, var(--elevated) 88%, #0a0c0a) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 22%, var(--border));
}
.vc-act-widget--krunker .vc-act-widget__media {
  background: linear-gradient(150deg, #0a0e0c 0%, #122018 48%, #1a1208 100%);
}
.vc-act-widget--krunker:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 44%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 54px color-mix(in srgb, var(--vc-act-a1) 15%, black 27%);
}
.vc-act-widget--krunker:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 52%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 36%, transparent),
    0 20px 46px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--krunker .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 72%, var(--vc-act-a1) 28%);
}

.vc-act-widget--gooberdash {
  --vc-act-a1: #e879f9;
  --vc-act-a2: #22d3ee;
  background:
    radial-gradient(
      100% 100% at 10% 0%,
      color-mix(in srgb, var(--vc-act-a1) 38%, transparent) 0%,
      transparent 46%
    ),
    radial-gradient(
      100% 95% at 100% 100%,
      color-mix(in srgb, var(--vc-act-a2) 34%, transparent) 0%,
      transparent 50%
    ),
    linear-gradient(
      168deg,
      color-mix(in srgb, var(--elevated) 88%, #0c0614) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 26%, var(--border));
}
.vc-act-widget--gooberdash .vc-act-widget__media {
  background: linear-gradient(148deg, #12081a 0%, #0a1622 48%, #1a0a18 100%);
}
.vc-act-widget--gooberdash:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 44%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 54px color-mix(in srgb, var(--vc-act-a2) 18%, black 26%);
}
.vc-act-widget--gooberdash:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 52%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 38%, transparent),
    0 20px 46px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--gooberdash .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 70%, var(--vc-act-a1) 30%);
}

.vc-act-widget--smashkarts {
  --vc-act-a1: #f97316;
  --vc-act-a2: #38bdf8;
  background:
    radial-gradient(
      105% 100% at 90% 0%,
      color-mix(in srgb, var(--vc-act-a1) 38%, transparent) 0%,
      transparent 48%
    ),
    radial-gradient(
      95% 95% at 8% 100%,
      color-mix(in srgb, var(--vc-act-a2) 32%, transparent) 0%,
      transparent 52%
    ),
    linear-gradient(
      168deg,
      color-mix(in srgb, var(--elevated) 88%, #160a04) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 26%, var(--border));
}
.vc-act-widget--smashkarts .vc-act-widget__media {
  background: linear-gradient(150deg, #1c0a04 0%, #122135 52%, #2a1004 100%);
}
.vc-act-widget--smashkarts:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 46%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 54px color-mix(in srgb, var(--vc-act-a1) 16%, black 26%);
}
.vc-act-widget--smashkarts:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 54%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 38%, transparent),
    0 20px 46px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--smashkarts .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 70%, var(--vc-act-a1) 30%);
}

.vc-act-widget--basketballstars2026 {
  --vc-act-a1: #ea580c;
  --vc-act-a2: #1d4ed8;
  background:
    radial-gradient(
      100% 90% at 12% 8%,
      color-mix(in srgb, var(--vc-act-a1) 34%, transparent) 0%,
      transparent 46%
    ),
    radial-gradient(
      95% 90% at 88% 92%,
      color-mix(in srgb, var(--vc-act-a2) 30%, transparent) 0%,
      transparent 50%
    ),
    linear-gradient(
      168deg,
      color-mix(in srgb, var(--elevated) 90%, #120804) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 24%, var(--border));
}
.vc-act-widget--basketballstars2026 .vc-act-widget__media {
  background: linear-gradient(152deg, #1a0a04 0%, #0f172a 48%, #0c1a3a 100%);
}
.vc-act-widget--basketballstars2026:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 42%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 54px color-mix(in srgb, var(--vc-act-a1) 14%, black 26%);
}
.vc-act-widget--basketballstars2026:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 50%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 36%, transparent),
    0 20px 46px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--basketballstars2026 .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 70%, var(--vc-act-a1) 30%);
}

.vc-act-widget--clusterrush {
  --vc-act-a1: #ff3814;
  --vc-act-a2: #003afa;
  background:
    radial-gradient(
      100% 90% at 14% 12%,
      color-mix(in srgb, var(--vc-act-a1) 34%, transparent) 0%,
      transparent 46%
    ),
    radial-gradient(
      95% 90% at 90% 88%,
      color-mix(in srgb, var(--vc-act-a2) 28%, transparent) 0%,
      transparent 50%
    ),
    linear-gradient(
      168deg,
      color-mix(in srgb, var(--elevated) 90%, #0a0a0a) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 22%, var(--border));
}
.vc-act-widget--clusterrush .vc-act-widget__media {
  background: linear-gradient(152deg, #0a0a0a 0%, #0f172a 45%, #120808 100%);
}
.vc-act-widget--clusterrush:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 40%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 54px color-mix(in srgb, var(--vc-act-a1) 14%, black 26%);
}
.vc-act-widget--clusterrush:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 48%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 34%, transparent),
    0 20px 46px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--clusterrush .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 70%, var(--vc-act-a1) 30%);
}

.vc-act-widget--codenames {
  --vc-act-a1: #1d4ed8;
  --vc-act-a2: #b91c1c;
  background:
    radial-gradient(
      100% 100% at 0% 0%,
      color-mix(in srgb, var(--vc-act-a1) 30%, transparent) 0%,
      transparent 46%
    ),
    radial-gradient(
      100% 100% at 100% 100%,
      color-mix(in srgb, var(--vc-act-a2) 28%, transparent) 0%,
      transparent 46%
    ),
    linear-gradient(
      168deg,
      color-mix(in srgb, var(--elevated) 90%, #080a12) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 20%, var(--border));
}
.vc-act-widget--codenames .vc-act-widget__media {
  background: linear-gradient(145deg, #0a0e18 0%, #120c0c 50%, #0c1420 100%);
}
.vc-act-widget--codenames:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 36%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 52px color-mix(in srgb, var(--vc-act-a2) 12%, black 26%);
}
.vc-act-widget--codenames:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 44%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 32%, transparent),
    0 20px 44px color-mix(in srgb, black 28%, transparent);
}
.vc-act-widget--codenames .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 78%, var(--vc-act-a1) 22%);
}

.vc-act-widget--richup {
  --vc-act-a1: #059669;
  --vc-act-a2: #ca8a04;
  background:
    radial-gradient(
      115% 100% at 15% -10%,
      color-mix(in srgb, var(--vc-act-a1) 32%, transparent) 0%,
      transparent 48%
    ),
    radial-gradient(
      100% 90% at 100% 100%,
      color-mix(in srgb, var(--vc-act-a2) 26%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      170deg,
      color-mix(in srgb, var(--elevated) 90%, #06120e) 0%,
      color-mix(in srgb, var(--elevated) 98%, var(--bg)) 100%
    );
  border-color: color-mix(in srgb, var(--vc-act-a1) 24%, var(--border));
}
.vc-act-widget--richup .vc-act-widget__media {
  background: linear-gradient(155deg, #051210 0%, #0c1812 45%, #141006 100%);
}
.vc-act-widget--richup:hover {
  border-color: color-mix(in srgb, var(--vc-act-a1) 40%, var(--border));
  box-shadow:
    0 1px 0 color-mix(in srgb, white 8%, transparent) inset,
    0 24px 52px color-mix(in srgb, var(--vc-act-a2) 12%, black 25%);
}
.vc-act-widget--richup:focus-visible {
  border-color: color-mix(in srgb, var(--vc-act-a1) 48%, var(--border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--vc-act-a1) 32%, transparent),
    0 20px 44px color-mix(in srgb, black 27%, transparent);
}
.vc-act-widget--richup .vc-act-widget__cta {
  color: color-mix(in srgb, var(--fg-soft) 74%, var(--vc-act-a1) 26%);
}

/* Light theme: softer washes so cards stay readable */
:global(html[data-theme='light']) .vc-act-widget--youtube {
  background:
    radial-gradient(
      115% 90% at 100% 0%,
      color-mix(in srgb, #ff5c7a 22%, transparent) 0%,
      transparent 50%
    ),
    radial-gradient(
      90% 85% at 0% 100%,
      color-mix(in srgb, #fecdd3 45%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 96%, #fff5f6) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--youtube
  .vc-act-widget__media {
  background: linear-gradient(150deg, #fff1f3 0%, #ffe8ec 40%, #f0f4ff 100%);
}

:global(html[data-theme='light']) .vc-act-widget--wordle {
  background:
    radial-gradient(
      110% 95% at 10% 0%,
      color-mix(in srgb, #86c97f 28%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 97%, #ecfdf3) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light']) .vc-act-widget--wordle .vc-act-widget__media {
  background: linear-gradient(155deg, #ecfdf3 0%, #e7f6ec 55%, #f0fdf4 100%);
}

:global(html[data-theme='light']) .vc-act-widget--hangman {
  background:
    radial-gradient(
      110% 95% at 10% 0%,
      color-mix(in srgb, #fcd34d 38%, transparent) 0%,
      transparent 48%
    ),
    radial-gradient(
      100% 90% at 100% 100%,
      color-mix(in srgb, #c4b5fd 34%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 96%, #fffbeb) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--hangman
  .vc-act-widget__media {
  background: linear-gradient(150deg, #fffbeb 0%, #faf5ff 50%, #f8fafc 100%);
}

:global(html[data-theme='light']) .vc-act-widget--openguessr {
  background:
    radial-gradient(
      110% 95% at 0% 0%,
      color-mix(in srgb, #5eead4 22%, transparent) 0%,
      transparent 46%
    ),
    radial-gradient(
      100% 90% at 100% 100%,
      color-mix(in srgb, #93c5fd 28%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 96%, #ecfeff) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--openguessr
  .vc-act-widget__media {
  background: linear-gradient(145deg, #ecfeff 0%, #e0f2fe 50%, #f0fdf9 100%);
}

:global(html[data-theme='light']) .vc-act-widget--skribblio {
  background:
    radial-gradient(
      110% 95% at 10% 0%,
      color-mix(in srgb, #67e8f9 30%, transparent) 0%,
      transparent 46%
    ),
    radial-gradient(
      100% 90% at 100% 100%,
      color-mix(in srgb, #5eead4 26%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 96%, #ecfeff) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--skribblio
  .vc-act-widget__media {
  background: linear-gradient(148deg, #ecfeff 0%, #cffafe 50%, #f0fdfa 100%);
}

:global(html[data-theme='light']) .vc-act-widget--garticphone {
  background:
    radial-gradient(
      115% 100% at 100% 0%,
      color-mix(in srgb, #e9d5ff 55%, transparent) 0%,
      transparent 50%
    ),
    radial-gradient(
      95% 90% at 0% 100%,
      color-mix(in srgb, #fce7f3 50%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 95%, #fdf4ff) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--garticphone
  .vc-act-widget__media {
  background: linear-gradient(160deg, #faf5ff 0%, #fdf2f8 45%, #f5f3ff 100%);
}

:global(html[data-theme='light']) .vc-act-widget--krunker {
  background:
    radial-gradient(
      110% 95% at 90% 0%,
      color-mix(in srgb, #fdba74 35%, transparent) 0%,
      transparent 48%
    ),
    radial-gradient(
      95% 90% at 0% 100%,
      color-mix(in srgb, #6ee7b7 22%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 95%, #fffbeb) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--krunker
  .vc-act-widget__media {
  background: linear-gradient(150deg, #fffbeb 0%, #ecfdf5 50%, #fff7ed 100%);
}

:global(html[data-theme='light']) .vc-act-widget--gooberdash {
  background:
    radial-gradient(
      100% 100% at 8% 0%,
      color-mix(in srgb, #f0abfc 42%, transparent) 0%,
      transparent 46%
    ),
    radial-gradient(
      100% 95% at 100% 100%,
      color-mix(in srgb, #67e8f9 32%, transparent) 0%,
      transparent 50%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 95%, #fdf4ff) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--gooberdash
  .vc-act-widget__media {
  background: linear-gradient(152deg, #faf5ff 0%, #ecfeff 48%, #fdf2f8 100%);
}

:global(html[data-theme='light']) .vc-act-widget--codenames {
  background:
    radial-gradient(
      100% 100% at 0% 0%,
      color-mix(in srgb, #bfdbfe 55%, transparent) 0%,
      transparent 46%
    ),
    radial-gradient(
      100% 100% at 100% 100%,
      color-mix(in srgb, #fecaca 45%, transparent) 0%,
      transparent 46%
    ),
    linear-gradient(
      175deg,
      var(--elevated) 0%,
      color-mix(in srgb, var(--elevated) 96%, #f8fafc) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--codenames
  .vc-act-widget__media {
  background: linear-gradient(145deg, #eff6ff 0%, #fef2f2 50%, #f8fafc 100%);
}

:global(html[data-theme='light']) .vc-act-widget--richup {
  background:
    radial-gradient(
      110% 95% at 12% 0%,
      color-mix(in srgb, #6ee7b7 30%, transparent) 0%,
      transparent 48%
    ),
    radial-gradient(
      100% 90% at 100% 100%,
      color-mix(in srgb, #fde68a 40%, transparent) 0%,
      transparent 48%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 96%, #ecfdf5) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light']) .vc-act-widget--richup .vc-act-widget__media {
  background: linear-gradient(155deg, #ecfdf5 0%, #fffbeb 50%, #f0fdf4 100%);
}

:global(html[data-theme='light']) .vc-act-widget--smashkarts {
  background:
    radial-gradient(
      105% 100% at 92% 0%,
      color-mix(in srgb, #fb923c 38%, transparent) 0%,
      transparent 48%
    ),
    radial-gradient(
      95% 95% at 8% 100%,
      color-mix(in srgb, #7dd3fc 32%, transparent) 0%,
      transparent 52%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 95%, #fff7ed) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--smashkarts
  .vc-act-widget__media {
  background: linear-gradient(150deg, #fff7ed 0%, #e0f2fe 52%, #ffedd5 100%);
}

:global(html[data-theme='light']) .vc-act-widget--basketballstars2026 {
  background:
    radial-gradient(
      100% 90% at 12% 8%,
      color-mix(in srgb, #fdba74 36%, transparent) 0%,
      transparent 46%
    ),
    radial-gradient(
      95% 90% at 88% 92%,
      color-mix(in srgb, #93c5fd 32%, transparent) 0%,
      transparent 50%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 95%, #fff7ed) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--basketballstars2026
  .vc-act-widget__media {
  background: linear-gradient(152deg, #fff7ed 0%, #eff6ff 48%, #dbeafe 100%);
}

:global(html[data-theme='light']) .vc-act-widget--clusterrush {
  background:
    radial-gradient(
      100% 90% at 14% 12%,
      color-mix(in srgb, #fca5a5 36%, transparent) 0%,
      transparent 46%
    ),
    radial-gradient(
      95% 90% at 90% 88%,
      color-mix(in srgb, #93c5fd 34%, transparent) 0%,
      transparent 50%
    ),
    linear-gradient(
      175deg,
      color-mix(in srgb, var(--elevated) 96%, #fef2f2) 0%,
      var(--elevated) 100%
    );
}
:global(html[data-theme='light'])
  .vc-act-widget--clusterrush
  .vc-act-widget__media {
  background: linear-gradient(152deg, #fef2f2 0%, #eff6ff 45%, #f8fafc 100%);
}

:global(html[data-theme='light'][data-echo-light-variant='sunny'])
  .vc-act-widget.vc-act-widget--youtube:hover {
  border-color: color-mix(
    in srgb,
    #fb7185 38%,
    rgb(217, 119, 6) 22%,
    var(--border)
  );
}
:global(html[data-theme='light'][data-echo-light-variant='sunny'])
  .vc-act-widget.vc-act-widget--wordle:hover {
  border-color: color-mix(
    in srgb,
    #4ade80 36%,
    rgb(217, 119, 6) 22%,
    var(--border)
  );
}
:global(html[data-theme='light'][data-echo-light-variant='sunny'])
  .vc-act-widget.vc-act-widget--hangman:hover {
  border-color: color-mix(
    in srgb,
    #fbbf24 36%,
    rgb(217, 119, 6) 22%,
    var(--border)
  );
}
:global(html[data-theme='light'][data-echo-light-variant='sunny'])
  .vc-act-widget.vc-act-widget--openguessr:hover {
  border-color: color-mix(
    in srgb,
    #2dd4bf 34%,
    rgb(217, 119, 6) 22%,
    var(--border)
  );
}
:global(html[data-theme='light'][data-echo-light-variant='sunny'])
  .vc-act-widget.vc-act-widget--skribblio:hover {
  border-color: color-mix(
    in srgb,
    #22d3ee 36%,
    rgb(217, 119, 6) 20%,
    var(--border)
  );
}
:global(html[data-theme='light'][data-echo-light-variant='sunny'])
  .vc-act-widget.vc-act-widget--garticphone:hover {
  border-color: color-mix(
    in srgb,
    #c084fc 34%,
    rgb(217, 119, 6) 22%,
    var(--border)
  );
}
:global(html[data-theme='light'][data-echo-light-variant='sunny'])
  .vc-act-widget.vc-act-widget--krunker:hover {
  border-color: color-mix(
    in srgb,
    #fb923c 38%,
    rgb(217, 119, 6) 22%,
    var(--border)
  );
}
:global(html[data-theme='light'][data-echo-light-variant='sunny'])
  .vc-act-widget.vc-act-widget--gooberdash:hover {
  border-color: color-mix(
    in srgb,
    #e879f9 34%,
    rgb(217, 119, 6) 22%,
    var(--border)
  );
}
:global(html[data-theme='light'][data-echo-light-variant='sunny'])
  .vc-act-widget.vc-act-widget--codenames:hover {
  border-color: color-mix(
    in srgb,
    #60a5fa 32%,
    rgb(217, 119, 6) 24%,
    var(--border)
  );
}
:global(html[data-theme='light'][data-echo-light-variant='sunny'])
  .vc-act-widget.vc-act-widget--richup:hover {
  border-color: color-mix(
    in srgb,
    #34d399 34%,
    rgb(217, 119, 6) 22%,
    var(--border)
  );
}
:global(html[data-theme='light'][data-echo-light-variant='sunny'])
  .vc-act-widget.vc-act-widget--smashkarts:hover {
  border-color: color-mix(
    in srgb,
    #fb923c 38%,
    rgb(217, 119, 6) 22%,
    var(--border)
  );
}
:global(html[data-theme='light'][data-echo-light-variant='sunny'])
  .vc-act-widget.vc-act-widget--basketballstars2026:hover {
  border-color: color-mix(
    in srgb,
    #fb923c 36%,
    rgb(217, 119, 6) 22%,
    var(--border)
  );
}
:global(html[data-theme='light'][data-echo-light-variant='sunny'])
  .vc-act-widget.vc-act-widget--clusterrush:hover {
  border-color: color-mix(
    in srgb,
    #f87171 34%,
    rgb(217, 119, 6) 22%,
    var(--border)
  );
}

.vc-act-widget__media {
  position: relative;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg) 42%, var(--surface) 58%);
}

.vc-act-widget__img {
  display: block;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 0;
  object-fit: cover;
  object-position: center;
  transform: scale(1.02);
  transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.vc-act-widget:hover .vc-act-widget__img {
  transform: scale(1.05);
}

.vc-act-widget__media-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    transparent 42%,
    color-mix(in srgb, var(--bg) 55%, black 45%) 100%
  );
  opacity: 0.55;
  pointer-events: none;
}

:global(html[data-theme='light']) .vc-act-widget__media-scrim {
  background: linear-gradient(
    180deg,
    transparent 42%,
    color-mix(in srgb, var(--surface) 40%, var(--text) 60%) 100%
  );
  opacity: 0.28;
}

.vc-act-widget__body {
  padding: 0.7rem 0.85rem 0.85rem;
}

.vc-act-widget__title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.vc-act-widget__title {
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--foreground);
}

.vc-act-widget__cta {
  font-size: 0.625rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: color-mix(in srgb, var(--fg-soft) 92%, #7dd3fc 8%);
  opacity: 0;
  transform: translateX(4px);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.vc-act-widget:hover .vc-act-widget__cta,
.vc-act-widget:focus-visible .vc-act-widget__cta {
  opacity: 1;
  transform: translateX(0);
}

.vc-act-widget__desc {
  margin-top: 0.25rem;
  font-size: 0.6875rem;
  line-height: 1.35;
  color: var(--fg-subtle);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .vc-act-widget,
  .vc-act-widget__img {
    transition: none;
  }
  .vc-act-widget:hover {
    transform: none;
  }
  .vc-act-widget:hover .vc-act-widget__img {
    transform: none;
  }
}

.vc-act-msg-err {
  color: rgb(251, 113, 133);
}

[data-theme='light'] .vc-act-msg-err {
  color: rgb(190, 18, 60);
}

.vc-act-msg-hint {
  color: color-mix(in srgb, rgb(253, 230, 138) 88%, white);
}
[data-theme='light'] .vc-act-msg-hint {
  color: rgb(146, 64, 14);
}

[data-theme='light'] .vc-act-header {
  background: color-mix(in srgb, var(--elevated) 94%, var(--bg));
}

@media (min-width: 1024px) {
  .vc-act-browse-drawer {
    box-shadow: none;
  }
}
</style>
