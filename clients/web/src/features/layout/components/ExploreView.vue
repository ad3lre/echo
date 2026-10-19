<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, onBeforeUnmount, onMounted, ref, unref, watch } from 'vue';
import { iconEchoRounded } from '@/assets/branding';
import { icons } from '@/assets/icons';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';
import { serverGuildIconDisplayUrl } from '@/features/layout/display/serverGuildIconDisplayUrl';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { exploreDirectoryBlurb } from '@/features/layout/composables/server/exploreDirectory';
import EchoDropdown from '@/components/EchoDropdown.vue';
import {
  collectExploreQuickFilters,
  exploreTagDisplayLabel,
  filterExploreDirectoryRowsBySearch,
  filterExploreDirectoryRowsByTags,
  isExploreDirectoryJoinLockedForGuest,
  normalizeExploreDirectoryTags,
  sortExploreRecommendedServers,
  sortExploreServersWithVoicePriority,
} from '@/features/layout/exploreDirectoryRows';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { useServerStore } from '@/features/layout/server';
import { isEchoGraphId } from '@/features/layout/ids/echoIds';
import { requestGuestExploreJoinBlockedModal } from '@/features/layout/composables/guest/guestJoinExploreBlockedDialog';

type DiscoverableServer = {
  id?: string;
  name: string;
  pfp: string;
  banner?: string;
  description?: string;
  tags?: string[];
  memberCount?: number;
  voiceParticipantCount?: number;
  lastVoiceActivityAt?: string;
  lastChatActivityAt?: string;
  createdAt?: string;
  allowGlobalGuests?: boolean;
};

type SortMode = 'default' | 'alphabetical' | 'trendy' | 'members' | 'recent';

const EXPLORE_PAGE_SIZE = 21;

type ListedServer = {
  id: string;
  name: string;
  pfp: string;
  banner: string;
  /** True when the directory row has a non-default server icon (not the Echo placeholder). */
  hasCustomIcon: boolean;
  /** True when the server has an explicit banner URL (not the pfp fallback used for display). */
  hasRealBanner: boolean;
  order: number;
  descriptionRaw: string;
  blurb: string;
  tags: string[];
  memberCount: number;
  voiceParticipantCount: number;
  lastVoiceActivityAt?: string;
  lastChatActivityAt?: string;
  hasDescription: boolean;
  createdAtMs: number | null;
  allowGlobalGuests?: boolean;
  joinLocked: boolean;
  /** User is already in this server (show Open instead of Join). */
  alreadyMember: boolean;
};

const props = defineProps<{
  discoverableServers:
    | DiscoverableServer[]
    | import('vue').Ref<DiscoverableServer[]>;
  /** True while an Explore directory join/open action is in progress. */
  directoryJoinBusy?: boolean;
  /** Compact/mobile shell: show a header control to leave Explore (e.g. back to Servers). */
  showMobileBack?: boolean;
}>();

const emit = defineEmits<{
  'create-server': [];
  'join-server': [inviteLink?: string];
  'join-suggested': [
    payload: { id: string; name: string; pfp: string; memberCount?: number },
  ];
  back: [];
}>();

const authSession = useAuthSessionStore();
const serverStore = useServerStore();
const isGuestUser = computed(() => authSession.backendUser?.isGuest === true);

const joinedServerIds = computed(
  () => new Set(serverStore.servers.map((s) => s.id)),
);

function isAlreadyJoinedServer(serverId: string): boolean {
  const id = serverId.trim();
  if (!id || !isEchoGraphId(id)) return false;
  return joinedServerIds.value.has(id);
}

const searchQuery = ref('');
const sortMode = ref<SortMode>('default');
/** At most one category tag — exclusive filter (this tag or none). */
const selectedQuickFilterTag = ref<string | null>(null);
const quickFilterExpanded = ref(false);
const alphabeticalDescending = ref(false);
const exploreListPage = ref(1);
const quickFilterRowRef = ref<HTMLElement | null>(null);
const quickFilterRowWidth = ref(0);
let quickFilterResizeObserver: ResizeObserver | null = null;
let quickFilterResizeFallback: (() => void) | null = null;

const sortDropdownOptions = computed(() => [
  { label: echoT('b13.explore.sortRecommended'), value: 'default' },
  { label: echoT('b13.explore.sortAlphabetical'), value: 'alphabetical' },
  { label: echoT('b13.explore.sortTrendy'), value: 'trendy' },
  { label: echoT('b13.explore.sortMembers'), value: 'members' },
  { label: echoT('b13.explore.sortRecent'), value: 'recent' },
]);

const compactCountFormatter = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function parseCreatedAtMs(iso: string | undefined): number | null {
  const t = iso?.trim();
  if (!t) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}

function onSortModeChange(value: string) {
  const next = value as SortMode;
  if (next === 'alphabetical' && sortMode.value !== 'alphabetical') {
    alphabeticalDescending.value = false;
  }
  sortMode.value = next;
}

function toggleAlphabeticalDirection() {
  if (sortMode.value !== 'alphabetical') return;
  alphabeticalDescending.value = !alphabeticalDescending.value;
}

function toggleQuickFilter(tag: string) {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) return;
  selectedQuickFilterTag.value =
    selectedQuickFilterTag.value === normalized ? null : normalized;
}

function clearQuickFilters() {
  selectedQuickFilterTag.value = null;
}

function formatMemberCount(memberCount: number): string {
  if (memberCount <= 0) return echoT('b13.explore.memberNew');
  return echoT('b13.explore.memberCount', {
    count: compactCountFormatter.format(memberCount),
  });
}

function formatVoiceActivityLabel(voiceParticipantCount: number): string {
  if (voiceParticipantCount <= 0) return '';
  if (voiceParticipantCount === 1) return echoT('b13.explore.inVoice');
  return echoT('b13.explore.inVoiceCount', { count: voiceParticipantCount });
}

const sortTriggerLabel = computed(() => {
  if (sortMode.value !== 'alphabetical') return undefined;
  return alphabeticalDescending.value
    ? echoT('b13.explore.sortAlphaZA')
    : echoT('b13.explore.sortAlphaAZ');
});

const discoverableList = computed(() => {
  const list = unref(props.discoverableServers);
  return list ?? [];
});

function bannerFor(server: DiscoverableServer): string {
  const b = server.banner?.trim();
  if (b) return b;
  return server.pfp;
}

const listedServers = computed<ListedServer[]>(() =>
  discoverableList.value.map((server, index) => {
    const descriptionRaw = server.description?.trim() ?? '';
    const hasDescription = descriptionRaw.length > 0;
    const mc = server.memberCount;
    const memberCount =
      typeof mc === 'number' && Number.isFinite(mc) && mc >= 0
        ? Math.floor(mc)
        : 0;
    const vpc = server.voiceParticipantCount;
    const voiceParticipantCount =
      typeof vpc === 'number' && Number.isFinite(vpc) && vpc >= 0
        ? Math.floor(vpc)
        : 0;
    const pfp = server.pfp;
    const id = server.id ?? `explore-${server.name}-${index}`;
    return {
      id,
      name: server.name,
      pfp,
      banner: bannerFor(server),
      hasCustomIcon: pfp.trim() !== '' && pfp !== iconEchoRounded,
      hasRealBanner: Boolean(server.banner?.trim()),
      order: index,
      descriptionRaw,
      blurb: exploreDirectoryBlurb(server.description),
      tags: normalizeExploreDirectoryTags(server.tags),
      memberCount,
      voiceParticipantCount,
      ...(server.lastVoiceActivityAt?.trim()
        ? { lastVoiceActivityAt: server.lastVoiceActivityAt.trim() }
        : {}),
      ...(server.lastChatActivityAt?.trim()
        ? { lastChatActivityAt: server.lastChatActivityAt.trim() }
        : {}),
      hasDescription,
      createdAtMs: parseCreatedAtMs(server.createdAt),
      allowGlobalGuests: server.allowGlobalGuests,
      joinLocked: isExploreDirectoryJoinLockedForGuest(
        isGuestUser.value,
        server.allowGlobalGuests,
      ),
      alreadyMember: isAlreadyJoinedServer(id),
    };
  }),
);

const guestJoinLockedHint = () => echoT('b13.explore.guestJoinLockedHint');

async function onExploreServerJoinClick(server: ListedServer) {
  if (props.directoryJoinBusy) return;
  if (server.joinLocked) {
    await requestGuestExploreJoinBlockedModal(guestJoinLockedHint());
    return;
  }
  emit('join-suggested', {
    id: server.id,
    name: server.name,
    pfp: server.pfp,
    memberCount: server.memberCount,
  });
}

/** Search-matched directory (ignores selected tag) — drives tag chip counts. */
const searchMatchedServers = computed(() =>
  filterExploreDirectoryRowsBySearch(listedServers.value, searchQuery.value),
);

const quickFilters = computed(() =>
  collectExploreQuickFilters(searchMatchedServers.value),
);

const quickFilterVisibleSlots = computed(() => {
  const width = quickFilterRowWidth.value;
  if (width <= 0) return 8;
  if (width < 520) return 4;
  if (width < 720) return 6;
  if (width < 920) return 8;
  return 10;
});

const collapsedVisibleQuickFilters = computed(() => {
  const slots = Math.max(1, quickFilterVisibleSlots.value - 1); // -1 for "All"
  return quickFilters.value.slice(0, slots);
});

const hiddenQuickFilters = computed(() => {
  const slots = Math.max(1, quickFilterVisibleSlots.value - 1);
  return quickFilters.value.slice(slots);
});

const hiddenQuickFiltersBatchA = computed(() => {
  const hidden = hiddenQuickFilters.value;
  const split = Math.ceil(hidden.length / 2);
  return hidden.slice(0, split);
});

const hiddenQuickFiltersBatchB = computed(() => {
  const hidden = hiddenQuickFilters.value;
  const split = Math.ceil(hidden.length / 2);
  return hidden.slice(split);
});

const filteredServers = computed(() =>
  filterExploreDirectoryRowsByTags(
    searchMatchedServers.value,
    selectedQuickFilterTag.value ? [selectedQuickFilterTag.value] : [],
  ),
);

/** Featured follows the active search + tag view; empty hides the section. */
const featuredServers = computed(() =>
  sortExploreRecommendedServers(filteredServers.value).slice(0, 6),
);

watch([quickFilters, selectedQuickFilterTag], () => {
  const sel = selectedQuickFilterTag.value;
  if (sel && !quickFilters.value.some((f) => f.tag === sel)) {
    selectedQuickFilterTag.value = null;
  }
});

function ageDaysForTrendy(s: ListedServer, listLen: number): number {
  if (s.createdAtMs != null) {
    return Math.max(0.5, (Date.now() - s.createdAtMs) / 86_400_000);
  }
  return Math.max(0.5, listLen - s.order);
}

function trendyScore(s: ListedServer, listLen: number): number {
  return s.memberCount / Math.sqrt(ageDaysForTrendy(s, listLen));
}

const sortedServers = computed(() => {
  const list = [...filteredServers.value];
  const listLen = listedServers.value.length || 1;
  const mode = sortMode.value;

  if (mode === 'alphabetical') {
    const cmp = (a: ListedServer, b: ListedServer) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    return sortExploreServersWithVoicePriority(list, (a, b) =>
      alphabeticalDescending.value ? -cmp(a, b) : cmp(a, b),
    );
  }

  if (mode === 'members') {
    return sortExploreServersWithVoicePriority(
      list,
      (a, b) => b.memberCount - a.memberCount,
    );
  }

  if (mode === 'recent') {
    return sortExploreServersWithVoicePriority(list, (a, b) => {
      const ta = a.createdAtMs;
      const tb = b.createdAtMs;
      if (ta != null && tb != null && tb !== ta) return tb - ta;
      if (ta != null && tb == null) return -1;
      if (ta == null && tb != null) return 1;
      return b.order - a.order;
    });
  }

  if (mode === 'trendy') {
    return sortExploreServersWithVoicePriority(
      list,
      (a, b) => trendyScore(b, listLen) - trendyScore(a, listLen),
    );
  }

  return sortExploreRecommendedServers(list);
});

const exploreTotalPages = computed(() => {
  const n = sortedServers.value.length;
  if (n === 0) return 0;
  return Math.ceil(n / EXPLORE_PAGE_SIZE);
});

const explorePaginatedServers = computed(() => {
  const list = sortedServers.value;
  if (list.length === 0) return [];
  const tp = exploreTotalPages.value;
  const page = Math.min(Math.max(1, exploreListPage.value), tp);
  const start = (page - 1) * EXPLORE_PAGE_SIZE;
  return list.slice(start, start + EXPLORE_PAGE_SIZE);
});

watch(
  [searchQuery, selectedQuickFilterTag, sortMode, alphabeticalDescending],
  () => {
    exploreListPage.value = 1;
  },
);

watch(
  () => quickFilters.value.length,
  () => {
    if (!hiddenQuickFilters.value.length) {
      quickFilterExpanded.value = false;
    }
  },
);

watch(
  () => sortedServers.value.length,
  () => {
    const tp = exploreTotalPages.value;
    if (tp === 0) return;
    if (exploreListPage.value > tp) exploreListPage.value = tp;
  },
);

function goExplorePage(next: number) {
  const tp = exploreTotalPages.value;
  if (tp === 0) return;
  exploreListPage.value = Math.min(Math.max(1, next), tp);
}

function updateQuickFilterStripWidth() {
  quickFilterRowWidth.value = quickFilterRowRef.value?.clientWidth ?? 0;
}

onMounted(() => {
  updateQuickFilterStripWidth();
  if (typeof ResizeObserver !== 'undefined') {
    quickFilterResizeObserver = new ResizeObserver(() =>
      updateQuickFilterStripWidth(),
    );
  } else {
    quickFilterResizeFallback = updateQuickFilterStripWidth;
    window.addEventListener('resize', quickFilterResizeFallback);
  }
});

watch(
  () => quickFilterRowRef.value,
  (el) => {
    updateQuickFilterStripWidth();
    if (!quickFilterResizeObserver) return;
    quickFilterResizeObserver.disconnect();
    if (el) quickFilterResizeObserver.observe(el);
  },
  { flush: 'post' },
);

onBeforeUnmount(() => {
  quickFilterResizeObserver?.disconnect();
  quickFilterResizeObserver = null;
  if (quickFilterResizeFallback) {
    window.removeEventListener('resize', quickFilterResizeFallback);
    quickFilterResizeFallback = null;
  }
});
</script>

<template>
  <div
    class="explore-view relative z-10 flex min-h-full min-w-0 w-full flex-col isolate text-foreground"
  >
    <div
      class="@container mx-auto flex w-full max-w-[1400px] shrink-0 flex-col gap-6 px-4 py-4 sm:gap-8 sm:px-6 sm:py-6 xl:px-8 xl:py-8"
    >
      <div v-if="props.showMobileBack" class="-mb-2 flex">
        <button
          type="button"
          class="explore-ghost-btn inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-fg-soft"
          :aria-label="echoT('b13.explore.backAria')"
          @click="emit('back')"
        >
          <img
            :src="icons.arrowLeft"
            alt=""
            class="h-4 w-4 shrink-0 opacity-90 brightness-0 invert"
          />
          <span>{{ echoT('b13.explore.back') }}</span>
        </button>
      </div>
      <header class="py-5 sm:py-6 lg:py-8">
        <div class="min-w-0">
          <div
            class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-soft"
          >
            <span class="inline-flex items-center gap-1.5">
              <img
                :src="icons.exploreFilled"
                alt=""
                class="h-3.5 w-3.5 filter invert opacity-70"
              />
              {{ echoT('b13.explore.exploreLabel') }}
            </span>
            <span class="text-fg-subtle">/</span>
            <span>{{ echoT('b13.explore.publicServers') }}</span>
          </div>

          <div class="mt-4 min-w-0">
            <div class="min-w-0">
              <h1
                class="text-[2rem] font-bold leading-[1.05] tracking-[-0.03em] text-foreground sm:whitespace-nowrap sm:text-[2.45rem] xl:text-[2.85rem]"
              >
                {{ echoT('b13.explore.heroTitle') }}
              </h1>
              <p
                class="mt-3 max-w-[46rem] text-sm leading-relaxed text-fg-soft sm:text-[15px] lg:max-w-[40rem] xl:max-w-[48rem]"
              >
                {{ echoT('b13.explore.heroLine1') }}
                <br class="hidden lg:block" />
                {{ echoT('b13.explore.heroLine2') }}
              </p>

              <div
                class="mt-5 grid grid-cols-1 gap-2.5 sm:max-w-xl sm:grid-cols-2"
              >
                <button
                  type="button"
                  class="explore-primary-btn rounded-2xl px-5 py-3 text-sm font-semibold text-white"
                  @click="emit('create-server')"
                >
                  {{ echoT('b13.explore.createServer') }}
                </button>
                <button
                  type="button"
                  class="explore-secondary-btn rounded-2xl px-5 py-3 text-sm font-semibold text-foreground"
                  @click="emit('join-server')"
                >
                  {{ echoT('b13.explore.joinWithInvite') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section
        v-if="featuredServers.length > 0"
        class="flex flex-col gap-3 @[1100px]:hidden"
      >
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-base font-semibold text-foreground">
            {{ echoT('b13.explore.featuredNow') }}
          </h2>
          <span class="text-xs uppercase tracking-[0.14em] text-fg-subtle">
            {{ echoT('b13.explore.swipe') }}
          </span>
        </div>
        <ul class="explore-featured-strip flex gap-3 overflow-x-auto pb-1">
          <li
            v-for="server in featuredServers"
            :key="server.id"
            class="w-[17.5rem] max-w-[86vw] shrink-0"
          >
            <button
              type="button"
              class="explore-featured-widget w-full overflow-hidden rounded-[1.25rem] text-left transition-[box-shadow,border-color] duration-200 disabled:pointer-events-none disabled:opacity-50"
              :class="{
                'explore-server-widget--join-locked': server.joinLocked,
              }"
              :disabled="directoryJoinBusy"
              @click="onExploreServerJoinClick(server)"
            >
              <div
                class="explore-server-widget__banner relative h-28 w-full overflow-hidden bg-[var(--echo-explore-banner-bg)]"
              >
                <div
                  class="explore-server-widget__banner-image absolute inset-0 bg-cover bg-center"
                  :style="{
                    backgroundImage: `url(${safeImageUrl(server.banner)})`,
                  }"
                />
                <div
                  class="explore-server-widget__banner-scrim pointer-events-none absolute inset-0"
                />
                <div
                  class="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--echo-explore-gradient-from)] via-transparent to-transparent opacity-95"
                />
              </div>
              <div
                class="explore-featured-widget__footer flex items-start gap-3 px-3 py-3"
              >
                <div
                  class="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl"
                >
                  <PausedGifAvatar
                    :src="serverGuildIconDisplayUrl(server.pfp)"
                    :alt="server.name"
                    :session-key="server.id"
                    img-class="rounded-xl object-cover"
                  />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-semibold text-foreground">
                    {{ server.name }}
                  </div>
                  <p
                    class="mt-1 line-clamp-2 text-[11px] leading-snug text-fg-subtle"
                  >
                    {{ server.blurb }}
                  </p>
                  <div
                    class="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-700/90 dark:text-cyan-200/80"
                  >
                    {{ formatMemberCount(server.memberCount) }}
                  </div>
                </div>
              </div>
            </button>
          </li>
        </ul>
      </section>

      <div
        class="grid gap-6 sm:gap-8"
        :class="
          featuredServers.length > 0
            ? '@[1100px]:grid-cols-[minmax(0,1fr)_300px]'
            : ''
        "
      >
        <div class="min-w-0">
          <div class="mb-4 px-0 sm:mb-5">
            <h2 class="text-xl font-semibold text-foreground">
              {{ echoT('b13.explore.recommendedCommunities') }}
            </h2>
            <p class="mt-1 text-sm text-fg-subtle">
              {{
                echoT(
                  sortedServers.length === 1
                    ? 'b13.explore.resultOne'
                    : 'b13.explore.resultMany',
                  { count: sortedServers.length },
                )
              }}
            </p>
          </div>

          <div class="mb-5 flex min-w-0 flex-col gap-3 sm:mb-6">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label
                class="explore-search flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 py-3"
              >
                <img
                  :src="icons.search"
                  alt=""
                  class="h-4 w-4 shrink-0 filter invert opacity-45"
                />
                <input
                  v-model="searchQuery"
                  type="text"
                  :placeholder="echoT('b13.explore.searchPlaceholder')"
                  class="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-fg-subtle"
                />
              </label>
              <button
                v-if="searchQuery.trim() || selectedQuickFilterTag"
                type="button"
                class="explore-ghost-btn shrink-0 rounded-2xl px-4 py-3 text-sm font-medium text-fg-soft"
                @click="
                  searchQuery = '';
                  clearQuickFilters();
                "
              >
                {{ echoT('b13.explore.clear') }}
              </button>
            </div>

            <div class="flex flex-col gap-2 pb-1">
              <div
                class="flex min-w-0 flex-row items-center gap-3 justify-between"
              >
                <div
                  v-if="quickFilters.length"
                  ref="quickFilterRowRef"
                  class="explore-filter-strip flex min-w-0 flex-1 flex-nowrap gap-2 overflow-hidden"
                >
                  <button
                    type="button"
                    class="explore-tag-chip shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors"
                    :class="
                      selectedQuickFilterTag === null
                        ? 'explore-tag-chip--active'
                        : 'explore-tag-chip--idle'
                    "
                    @click="clearQuickFilters"
                  >
                    {{ echoT('b13.explore.all') }}
                  </button>
                  <button
                    v-for="filter in collapsedVisibleQuickFilters"
                    :key="filter.tag"
                    type="button"
                    class="explore-tag-chip shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors"
                    :class="
                      selectedQuickFilterTag === filter.tag
                        ? 'explore-tag-chip--active'
                        : 'explore-tag-chip--idle'
                    "
                    @click="toggleQuickFilter(filter.tag)"
                  >
                    {{ exploreTagDisplayLabel(filter.tag) }}
                    <span class="ml-1 text-fg-subtle">{{ filter.count }}</span>
                  </button>
                  <button
                    v-if="hiddenQuickFilters.length"
                    type="button"
                    class="explore-tag-chip explore-tag-chip--more shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors"
                    :class="
                      quickFilterExpanded
                        ? 'explore-tag-chip--active'
                        : 'explore-tag-chip--idle'
                    "
                    @click="quickFilterExpanded = !quickFilterExpanded"
                  >
                    {{
                      quickFilterExpanded
                        ? echoT('b13.explore.less')
                        : echoT('b13.explore.more', {
                            count: hiddenQuickFilters.length,
                          })
                    }}
                  </button>
                </div>
                <div v-else class="min-w-0 flex-1" aria-hidden="true" />

                <div
                  class="flex max-w-full shrink-0 items-center gap-2 sm:max-w-[min(100%,18rem)]"
                >
                  <span
                    class="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
                    >{{ echoT('b13.explore.sort') }}</span
                  >
                  <div class="flex min-w-0 items-stretch gap-1.5">
                    <EchoDropdown
                      class="explore-sort-dropdown min-w-0"
                      :model-value="sortMode"
                      :options="sortDropdownOptions"
                      :trigger-label="sortTriggerLabel"
                      compact
                      @update:model-value="onSortModeChange"
                    />
                    <button
                      v-if="sortMode === 'alphabetical'"
                      type="button"
                      class="explore-alpha-toggle shrink-0 rounded-xl px-3 py-2 text-xs font-semibold tabular-nums text-fg-soft transition-colors"
                      :title="
                        alphabeticalDescending
                          ? echoT('b13.explore.switchToAZ')
                          : echoT('b13.explore.switchToZA')
                      "
                      @click="toggleAlphabeticalDirection"
                    >
                      {{ alphabeticalDescending ? 'A-Z' : 'Z-A' }}
                    </button>
                  </div>
                </div>
              </div>
              <div
                v-if="
                  quickFilters.length &&
                  quickFilterExpanded &&
                  hiddenQuickFilters.length
                "
                class="explore-filter-more-grid flex flex-col gap-2"
              >
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="filter in hiddenQuickFiltersBatchA"
                    :key="`a-${filter.tag}`"
                    type="button"
                    class="explore-tag-chip rounded-full px-3.5 py-2 text-xs font-semibold transition-colors"
                    :class="
                      selectedQuickFilterTag === filter.tag
                        ? 'explore-tag-chip--active'
                        : 'explore-tag-chip--idle'
                    "
                    @click="toggleQuickFilter(filter.tag)"
                  >
                    {{ exploreTagDisplayLabel(filter.tag) }}
                    <span class="ml-1 text-fg-subtle">{{ filter.count }}</span>
                  </button>
                </div>
                <div
                  v-if="hiddenQuickFiltersBatchB.length"
                  class="flex flex-wrap gap-2"
                >
                  <button
                    v-for="filter in hiddenQuickFiltersBatchB"
                    :key="`b-${filter.tag}`"
                    type="button"
                    class="explore-tag-chip rounded-full px-3.5 py-2 text-xs font-semibold transition-colors"
                    :class="
                      selectedQuickFilterTag === filter.tag
                        ? 'explore-tag-chip--active'
                        : 'explore-tag-chip--idle'
                    "
                    @click="toggleQuickFilter(filter.tag)"
                  >
                    {{ exploreTagDisplayLabel(filter.tag) }}
                    <span class="ml-1 text-fg-subtle">{{ filter.count }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <ul
            class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 2xl:grid-cols-3"
          >
            <li v-for="server in explorePaginatedServers" :key="server.id">
              <article
                class="explore-server-widget flex h-full flex-col overflow-hidden rounded-[1.5rem] transition-[box-shadow,border-color] duration-200"
                :class="{
                  'explore-server-widget--join-locked': server.joinLocked,
                }"
              >
                <div
                  class="explore-server-widget__banner relative h-36 w-full shrink-0 overflow-hidden bg-[var(--echo-explore-banner-bg)] sm:h-40"
                >
                  <div
                    class="explore-server-widget__banner-image absolute inset-0 bg-cover bg-center"
                    :style="{
                      backgroundImage: `url(${safeImageUrl(server.banner)})`,
                    }"
                  />
                  <div
                    class="explore-server-widget__banner-shine pointer-events-none absolute inset-0 opacity-0"
                    aria-hidden="true"
                  />
                  <div
                    class="explore-server-widget__banner-scrim pointer-events-none absolute inset-0"
                  />
                  <div
                    v-if="server.joinLocked"
                    class="explore-join-locked-badge pointer-events-none absolute right-3 top-3 z-[2] inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide"
                    :title="echoT('b13.explore.accountRequiredTitle')"
                  >
                    <img
                      :src="icons.chatLock"
                      alt=""
                      class="h-3 w-3 shrink-0 opacity-90 brightness-0 invert"
                    />
                    <span>{{ echoT('b13.explore.accountRequired') }}</span>
                  </div>
                  <div
                    v-else-if="server.voiceParticipantCount > 0"
                    class="explore-voice-badge pointer-events-none absolute right-3 top-3 z-[2] inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide"
                    :title="
                      formatVoiceActivityLabel(server.voiceParticipantCount)
                    "
                  >
                    <span
                      class="explore-voice-badge__dot h-1.5 w-1.5 shrink-0 rounded-full"
                      aria-hidden="true"
                    />
                    <span>{{
                      formatVoiceActivityLabel(server.voiceParticipantCount)
                    }}</span>
                  </div>
                  <div
                    class="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--echo-explore-gradient-deep)] via-[color-mix(in_srgb,var(--echo-explore-gradient-from)_55%,transparent)] to-[color-mix(in_srgb,var(--echo-explore-banner-bg)_25%,transparent)]"
                  />
                </div>

                <div
                  class="explore-server-widget__body relative flex flex-1 flex-col px-4 pb-4 pt-0 sm:px-5 sm:pb-5"
                >
                  <div class="relative z-[1] -mt-12 flex flex-1 flex-col">
                    <div class="flex items-end justify-between gap-3">
                      <div
                        class="inline-flex h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-2xl sm:h-[4.75rem] sm:w-[4.75rem]"
                      >
                        <PausedGifAvatar
                          :src="serverGuildIconDisplayUrl(server.pfp)"
                          :alt="server.name"
                          :session-key="server.id"
                          img-class="rounded-2xl object-cover"
                        />
                      </div>
                      <div
                        class="rounded-full border border-border bg-glass-1 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-soft"
                      >
                        {{ formatMemberCount(server.memberCount) }}
                      </div>
                    </div>
                    <h3
                      class="mt-3.5 line-clamp-2 text-lg font-bold leading-snug tracking-tight text-foreground"
                    >
                      {{ server.name }}
                    </h3>
                    <p
                      class="explore-server-widget__blurb mt-2 line-clamp-3 text-[13px] leading-relaxed"
                      :class="
                        server.descriptionRaw
                          ? 'text-fg-soft'
                          : 'text-fg-subtle italic'
                      "
                    >
                      {{ server.blurb }}
                    </p>
                    <div
                      v-if="server.tags.length"
                      class="mt-3 flex flex-wrap gap-1.5"
                    >
                      <span
                        v-for="tag in server.tags.slice(0, 4)"
                        :key="tag"
                        class="explore-server-tag rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide"
                      >
                        {{ exploreTagDisplayLabel(tag) }}
                      </span>
                    </div>
                  </div>

                  <div
                    class="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4"
                  >
                    <button
                      v-if="server.joinLocked"
                      type="button"
                      class="explore-join-locked-btn inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:pointer-events-none disabled:opacity-50"
                      :disabled="directoryJoinBusy"
                      @click="onExploreServerJoinClick(server)"
                    >
                      <img
                        :src="icons.chatLock"
                        alt=""
                        class="h-4 w-4 shrink-0 opacity-85 brightness-0 invert"
                      />
                      <span>{{
                        echoT('b13.explore.createAccountToJoin')
                      }}</span>
                    </button>
                    <button
                      v-else-if="server.alreadyMember"
                      type="button"
                      class="explore-open-btn inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:pointer-events-none disabled:opacity-50"
                      :disabled="directoryJoinBusy"
                      @click="onExploreServerJoinClick(server)"
                    >
                      <span>{{ echoT('b13.explore.openServer') }}</span>
                      <span class="opacity-80" aria-hidden="true">-></span>
                    </button>
                    <button
                      v-else
                      type="button"
                      class="explore-primary-btn inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:pointer-events-none disabled:opacity-50"
                      :disabled="directoryJoinBusy"
                      @click="onExploreServerJoinClick(server)"
                    >
                      <span>{{ echoT('b13.explore.joinServer') }}</span>
                      <span class="text-fg-soft" aria-hidden="true">-></span>
                    </button>
                  </div>
                </div>
              </article>
            </li>
          </ul>

          <nav
            v-if="exploreTotalPages > 1"
            class="mt-8 flex flex-wrap items-center justify-center gap-2 sm:justify-between"
            :aria-label="echoT('b13.explore.pagesAria')"
          >
            <button
              type="button"
              class="explore-ghost-btn rounded-xl px-4 py-2.5 text-sm font-medium text-fg-soft disabled:pointer-events-none disabled:opacity-35"
              :disabled="exploreListPage <= 1"
              @click="goExplorePage(exploreListPage - 1)"
            >
              {{ echoT('b13.explore.previous') }}
            </button>
            <span class="text-sm tabular-nums text-fg-subtle">
              {{
                echoT('b13.explore.pageOf', {
                  page: exploreListPage,
                  total: exploreTotalPages,
                })
              }}
            </span>
            <button
              type="button"
              class="explore-ghost-btn rounded-xl px-4 py-2.5 text-sm font-medium text-fg-soft disabled:pointer-events-none disabled:opacity-35"
              :disabled="exploreListPage >= exploreTotalPages"
              @click="goExplorePage(exploreListPage + 1)"
            >
              {{ echoT('b13.explore.next') }}
            </button>
          </nav>

          <div
            v-if="sortedServers.length === 0"
            class="explore-empty mt-2 rounded-[1.5rem] px-6 py-12 text-center"
          >
            <p class="text-base font-medium text-foreground">
              {{ echoT('b13.explore.noMatchTitle') }}
            </p>
            <p class="mt-2 text-sm text-fg-subtle">
              {{ echoT('b13.explore.noMatchBody') }}
            </p>
          </div>
        </div>

        <aside
          v-if="featuredServers.length > 0"
          class="explore-rail hidden min-w-0 @[1100px]:block"
        >
          <h3
            class="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
          >
            {{ echoT('b13.explore.featured') }}
          </h3>
          <ul class="mt-4 flex flex-col gap-4">
            <li v-for="server in featuredServers" :key="server.id">
              <button
                type="button"
                class="explore-featured-widget w-full overflow-hidden rounded-xl text-left transition-[box-shadow,border-color] duration-200 disabled:pointer-events-none disabled:opacity-50"
                :class="{
                  'explore-server-widget--join-locked': server.joinLocked,
                }"
                :disabled="directoryJoinBusy"
                @click="onExploreServerJoinClick(server)"
              >
                <div
                  class="explore-server-widget__banner relative h-24 w-full overflow-hidden bg-[var(--echo-explore-banner-bg)]"
                >
                  <div
                    class="explore-server-widget__banner-image absolute inset-0 bg-cover bg-center"
                    :style="{
                      backgroundImage: `url(${safeImageUrl(server.banner)})`,
                    }"
                  />
                  <div
                    class="explore-server-widget__banner-scrim pointer-events-none absolute inset-0"
                  />
                  <div
                    class="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--echo-explore-gradient-from)] via-transparent to-transparent opacity-95"
                  />
                </div>
                <div
                  class="explore-featured-widget__footer flex items-start gap-3 px-3 py-3"
                >
                  <div
                    class="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl"
                  >
                    <PausedGifAvatar
                      :src="serverGuildIconDisplayUrl(server.pfp)"
                      :alt="server.name"
                      :session-key="server.id"
                      img-class="rounded-xl object-cover"
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-semibold text-foreground">
                      {{ server.name }}
                    </div>
                    <p
                      class="mt-1 line-clamp-2 text-[11px] leading-snug text-fg-subtle"
                    >
                      {{ server.blurb }}
                    </p>
                    <div
                      class="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-700/90 dark:text-cyan-200/80"
                    >
                      {{ formatMemberCount(server.memberCount) }}
                    </div>
                  </div>
                </div>
              </button>
            </li>
          </ul>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss" src="./styles/ExploreView.scss"></style>

<style lang="scss">
[data-theme='light'] .explore-view {
  .explore-search {
    background: color-mix(in srgb, var(--elevated) 90%, transparent);
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--border) 75%, transparent);
  }

  .explore-tag-chip {
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--border) 72%, transparent),
      0 8px 22px color-mix(in srgb, var(--foreground) 5%, transparent);
  }

  .explore-tag-chip--idle {
    color: color-mix(in srgb, var(--text) 88%, var(--muted));
  }

  .explore-tag-chip--idle:hover {
    color: var(--text);
  }

  .explore-server-tag {
    background: color-mix(in srgb, var(--text) 6%, transparent);
    color: color-mix(in srgb, var(--text) 72%, var(--muted));
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--border) 65%, transparent);
  }

  .explore-secondary-btn {
    background: color-mix(in srgb, var(--text) 7%, var(--surface));
    border-color: color-mix(in srgb, var(--border) 88%, transparent);
    color: var(--text);
  }

  .explore-secondary-btn:hover {
    background: color-mix(in srgb, var(--text) 11%, var(--surface));
  }

  .explore-server-widget {
    box-shadow:
      inset 0 1px 0
        color-mix(in srgb, var(--echo-palette-fff-e08d) 85%, transparent),
      0 14px 36px color-mix(in srgb, var(--foreground) 7%, transparent);
    border-color: color-mix(in srgb, var(--border) 82%, transparent);
  }

  .explore-server-widget:hover {
    box-shadow:
      inset 0 1px 0
        color-mix(in srgb, var(--echo-palette-fff-e08d) 92%, transparent),
      0 18px 44px color-mix(in srgb, var(--foreground) 9%, transparent);
    border-color: color-mix(in srgb, var(--border) 70%, transparent);
  }

  img.filter.invert,
  img.brightness-0 {
    filter: none !important;
    opacity: 0.62;
  }

  .explore-voice-badge {
    color: color-mix(in srgb, var(--echo-palette-14532d-cf99) 92%, var(--text));
    background: color-mix(
      in srgb,
      var(--server-vc-active, var(--echo-palette-22c55e-8b8f)) 18%,
      var(--echo-palette-fff-e08d)
    );
    box-shadow:
      inset 0 0 0 1px
        color-mix(
          in srgb,
          var(--server-vc-active, var(--echo-palette-22c55e-8b8f)) 42%,
          transparent
        ),
      0 6px 16px color-mix(in srgb, var(--foreground) 6%, transparent);
  }

  .explore-voice-badge__dot {
    background: var(--server-vc-active, var(--echo-palette-16a34a-3c5c));
    box-shadow: 0 0 0 2px
      color-mix(
        in srgb,
        var(--server-vc-active, var(--echo-palette-22c55e-8b8f)) 28%,
        transparent
      );
  }

  .explore-join-locked-btn {
    color: color-mix(in srgb, var(--text) 88%, var(--muted));
    background: color-mix(in srgb, var(--text) 6%, var(--surface));
    border-color: color-mix(in srgb, var(--border) 88%, transparent);
  }

  .explore-join-locked-badge {
    color: color-mix(in srgb, var(--echo-palette-92400e-90b1) 92%, var(--text));
    background: color-mix(
      in srgb,
      var(--echo-palette-fef3c7-5106) 88%,
      var(--echo-palette-fff-e08d)
    );
    box-shadow:
      inset 0 0 0 1px
        color-mix(in srgb, var(--echo-palette-f59e0b-251a) 35%, transparent),
      0 6px 16px color-mix(in srgb, var(--foreground) 6%, transparent);
  }
}
</style>
