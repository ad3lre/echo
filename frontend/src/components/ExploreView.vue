<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, unref, watch } from 'vue';
import { iconEchoRounded } from '@/assets/branding';
import { icons } from '@/assets/icons';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { exploreDirectoryBlurb } from '@/utils/exploreDirectory';
import EchoDropdown from '@/components/EchoDropdown.vue';
import {
  collectExploreQuickFilters,
  exploreTagDisplayLabel,
  filterExploreDirectoryRowsByTags,
  normalizeExploreDirectoryTags,
  sortExploreServersWithVoicePriority,
} from '@/services/domain/exploreDirectoryRows';

type DiscoverableServer = {
  id?: string;
  name: string;
  pfp: string;
  banner?: string;
  description?: string;
  tags?: string[];
  memberCount?: number;
  voiceParticipantCount?: number;
  createdAt?: string;
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
  featured: boolean;
  descriptionRaw: string;
  blurb: string;
  tags: string[];
  memberCount: number;
  voiceParticipantCount: number;
  createdAtMs: number | null;
};

const props = defineProps<{
  discoverableServers:
    | DiscoverableServer[]
    | import('vue').Ref<DiscoverableServer[]>;
  /** Compact/mobile shell: show a header control to leave Explore (e.g. back to Servers). */
  showMobileBack?: boolean;
}>();

const emit = defineEmits<{
  'create-server': [];
  'join-server': [inviteLink?: string];
  'join-suggested': [payload: { id: string; name: string; pfp: string }];
  back: [];
}>();

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

const sortDropdownOptions = [
  { label: 'Recommended', value: 'default' },
  { label: 'Alphabetical', value: 'alphabetical' },
  { label: 'Trendy', value: 'trendy' },
  { label: 'Most members', value: 'members' },
  { label: 'Recent', value: 'recent' },
] as const;

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
  if (memberCount <= 0) return 'New';
  return `${compactCountFormatter.format(memberCount)} members`;
}

function formatVoiceActivityLabel(voiceParticipantCount: number): string {
  if (voiceParticipantCount <= 0) return '';
  if (voiceParticipantCount === 1) return 'In voice';
  return `${voiceParticipantCount} in voice`;
}

const sortTriggerLabel = computed(() => {
  if (sortMode.value !== 'alphabetical') return undefined;
  return alphabeticalDescending.value
    ? 'Alphabetical - Z-A'
    : 'Alphabetical - A-Z';
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
    return {
      id: server.id ?? `explore-${server.name}-${index}`,
      name: server.name,
      pfp,
      banner: bannerFor(server),
      hasCustomIcon: pfp.trim() !== '' && pfp !== iconEchoRounded,
      hasRealBanner: Boolean(server.banner?.trim()),
      order: index,
      featured: index < 6,
      descriptionRaw,
      blurb: exploreDirectoryBlurb(server.description),
      tags: normalizeExploreDirectoryTags(server.tags),
      memberCount,
      voiceParticipantCount,
      createdAtMs: parseCreatedAtMs(server.createdAt),
    };
  }),
);

const quickFilters = computed(() =>
  collectExploreQuickFilters(listedServers.value),
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

const featuredServers = computed(() =>
  listedServers.value.filter((s) => s.featured),
);

const filteredServers = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  const tagFiltered = filterExploreDirectoryRowsByTags(
    listedServers.value,
    selectedQuickFilterTag.value ? [selectedQuickFilterTag.value] : [],
  );
  if (!query) return tagFiltered;
  return tagFiltered.filter(
    (s) =>
      s.name.toLowerCase().includes(query) ||
      s.blurb.toLowerCase().includes(query) ||
      s.descriptionRaw.toLowerCase().includes(query) ||
      s.tags.some((tag) => tag.includes(query)),
  );
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

function recommendedScore(s: ListedServer, listLen: number): number {
  const ageDays = ageDaysForTrendy(s, listLen);
  const pop = Math.log1p(Math.max(0, s.memberCount));
  const momentum = s.memberCount / ageDays;
  const descBoost = s.descriptionRaw.trim().length >= 12 ? 0.08 : 0;
  const featuredBoost = s.featured ? 0.1 : 0;

  // ~28d half-life: strongly favors newly listed servers without ignoring older ones entirely.
  const newness = Math.exp(-ageDays / 28);
  const newnessBoost = 0.55 * newness;

  let brandingBoost = 0;
  if (s.hasCustomIcon) brandingBoost += 0.1;
  if (s.hasRealBanner) brandingBoost += 0.1;
  if (s.hasCustomIcon && s.hasRealBanner) brandingBoost += 0.14;

  // Member growth proxy: no time-series in the directory payload, so weight members/day
  // more heavily while `newness` is high (young + rising count reads as "trending up").
  const momentumWeight = 0.3 + 0.45 * newness;
  const growthScore = momentumWeight * Math.log1p(momentum);

  return (
    pop + growthScore + newnessBoost + brandingBoost + descBoost + featuredBoost
  );
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

  return sortExploreServersWithVoicePriority(
    list,
    (a, b) => recommendedScore(b, listLen) - recommendedScore(a, listLen),
  );
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
          aria-label="Back to servers"
          @click="emit('back')"
        >
          <img
            :src="icons.arrowLeft"
            alt=""
            class="h-4 w-4 shrink-0 opacity-90 brightness-0 invert"
          />
          <span>Back</span>
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
              Explore
            </span>
            <span class="text-fg-subtle">/</span>
            <span>Public servers</span>
          </div>

          <div class="mt-4 min-w-0">
            <div class="min-w-0">
              <h1
                class="text-[2rem] font-bold leading-[1.05] tracking-[-0.03em] text-foreground sm:whitespace-nowrap sm:text-[2.45rem] xl:text-[2.85rem]"
              >
                Find your next corner of Echo.
              </h1>
              <p
                class="mt-3 max-w-[46rem] text-sm leading-relaxed text-fg-soft sm:text-[15px] lg:max-w-[40rem] xl:max-w-[48rem]"
              >
                Scroll communities until one clicks.
                <br class="hidden lg:block" />
                Land somewhere that feels like yours, and keep it open on
                desktop without the usual clutter.
              </p>

              <div
                class="mt-5 grid grid-cols-1 gap-2.5 sm:max-w-xl sm:grid-cols-2"
              >
                <button
                  type="button"
                  class="explore-primary-btn rounded-2xl px-5 py-3 text-sm font-semibold text-white"
                  @click="emit('create-server')"
                >
                  Create server
                </button>
                <button
                  type="button"
                  class="explore-secondary-btn rounded-2xl px-5 py-3 text-sm font-semibold text-foreground"
                  @click="emit('join-server')"
                >
                  Join with invite
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
          <h2 class="text-base font-semibold text-foreground">Featured now</h2>
          <span class="text-xs uppercase tracking-[0.14em] text-fg-subtle">
            Swipe
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
              class="explore-featured-widget w-full overflow-hidden rounded-[1.25rem] text-left transition-[box-shadow,border-color] duration-200"
              @click="
                emit('join-suggested', {
                  id: server.id,
                  name: server.name,
                  pfp: server.pfp,
                })
              "
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
              Recommended communities
            </h2>
            <p class="mt-1 text-sm text-fg-subtle">
              {{ sortedServers.length }} result{{
                sortedServers.length === 1 ? '' : 's'
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
                  placeholder="Search by name, description, or tag"
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
                Clear
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
                    All
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
                        ? 'Less'
                        : `More ${hiddenQuickFilters.length}`
                    }}
                  </button>
                </div>
                <div v-else class="min-w-0 flex-1" aria-hidden="true" />

                <div
                  class="flex max-w-full shrink-0 items-center gap-2 sm:max-w-[min(100%,18rem)]"
                >
                  <span
                    class="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle"
                    >Sort</span
                  >
                  <div class="flex min-w-0 items-stretch gap-1.5">
                    <EchoDropdown
                      class="explore-sort-dropdown min-w-0"
                      :model-value="sortMode"
                      :options="[...sortDropdownOptions]"
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
                          ? 'Switch to A-Z'
                          : 'Switch to Z-A'
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
                    v-if="server.voiceParticipantCount > 0"
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
                      type="button"
                      class="explore-primary-btn inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
                      @click="
                        emit('join-suggested', {
                          id: server.id,
                          name: server.name,
                          pfp: server.pfp,
                        })
                      "
                    >
                      <span>Join server</span>
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
            aria-label="Explore directory pages"
          >
            <button
              type="button"
              class="explore-ghost-btn rounded-xl px-4 py-2.5 text-sm font-medium text-fg-soft disabled:pointer-events-none disabled:opacity-35"
              :disabled="exploreListPage <= 1"
              @click="goExplorePage(exploreListPage - 1)"
            >
              Previous
            </button>
            <span class="text-sm tabular-nums text-fg-subtle">
              Page {{ exploreListPage }} of {{ exploreTotalPages }}
            </span>
            <button
              type="button"
              class="explore-ghost-btn rounded-xl px-4 py-2.5 text-sm font-medium text-fg-soft disabled:pointer-events-none disabled:opacity-35"
              :disabled="exploreListPage >= exploreTotalPages"
              @click="goExplorePage(exploreListPage + 1)"
            >
              Next
            </button>
          </nav>

          <div
            v-if="sortedServers.length === 0"
            class="explore-empty mt-2 rounded-[1.5rem] px-6 py-12 text-center"
          >
            <p class="text-base font-medium text-foreground">
              No servers match
            </p>
            <p class="mt-2 text-sm text-fg-subtle">
              Try a different search or clear the filter.
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
            Featured
          </h3>
          <ul class="mt-4 flex flex-col gap-4">
            <li v-for="server in featuredServers" :key="server.id">
              <button
                type="button"
                class="explore-featured-widget w-full overflow-hidden rounded-xl text-left transition-[box-shadow,border-color] duration-200"
                @click="
                  emit('join-suggested', {
                    id: server.id,
                    name: server.name,
                    pfp: server.pfp,
                  })
                "
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

<style scoped lang="scss">
.explore-view {
  transform: translateZ(0);
  background-color: var(--surface);
  background-image:
    radial-gradient(
      circle at top left,
      var(--explore-radial-accent),
      transparent 22%
    ),
    radial-gradient(
      circle at bottom right,
      var(--explore-radial-cyan),
      transparent 24%
    ),
    linear-gradient(180deg, var(--surface) 0%, var(--bg) 100%);
}

.explore-server-widget {
  background: linear-gradient(165deg, var(--vue-auto-077), var(--vue-auto-078));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 4%, transparent),
    0 16px 40px var(--vue-auto-018);
  border: 1px solid color-mix(in srgb, white 3%, transparent);
}

.explore-server-widget:hover {
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 7%, transparent),
    0 20px 48px var(--vue-auto-065);
  border-color: color-mix(in srgb, white 8%, transparent);
}

.explore-server-widget__banner {
  isolation: isolate;
  transform: translateZ(0);
}

.explore-server-widget__banner-image {
  transform: translate3d(0, 0, 0) scale(1);
  transform-origin: center center;
  backface-visibility: hidden;
  transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}

.explore-server-widget:hover .explore-server-widget__banner-image,
.explore-featured-widget:hover .explore-server-widget__banner-image {
  transform: translate3d(0, 0, 0) scale(1.04);
}

.explore-server-widget__banner-scrim {
  background: linear-gradient(
    180deg,
    var(--vue-auto-156) 0%,
    var(--vue-auto-157) 100%
  );
}

.explore-voice-badge {
  color: color-mix(in srgb, #ecfdf5 92%, transparent);
  background: color-mix(in srgb, var(--server-vc-active, #22c55e) 88%, #052e16);
  box-shadow:
    0 0 0 1px color-mix(in srgb, #22c55e 45%, transparent),
    0 8px 20px color-mix(in srgb, black 35%, transparent);
}

.explore-voice-badge__dot {
  background: var(--server-vc-active, #4ade80);
  box-shadow: 0 0 0 2px color-mix(in srgb, #22c55e 35%, transparent);
}

.explore-server-widget__banner-shine {
  background: linear-gradient(
    125deg,
    transparent 0%,
    var(--vue-auto-001) 42%,
    transparent 62%
  );
  transition: opacity 0.35s ease;
}

.explore-server-widget:hover .explore-server-widget__banner-shine {
  opacity: 0.55;
}

.explore-featured-widget {
  background: linear-gradient(165deg, var(--vue-auto-077), var(--vue-auto-078));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 4%, transparent),
    0 12px 28px var(--vue-auto-079);
  border: 1px solid color-mix(in srgb, white 3%, transparent);
}

.explore-featured-widget:hover {
  border-color: color-mix(in srgb, white 8%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 7%, transparent),
    0 16px 36px var(--vue-auto-046);
}

.explore-featured-widget__footer {
  background: var(--vue-auto-158);
}

.explore-empty {
  background: var(--vue-auto-159);
  box-shadow: inset 0 0 0 1px var(--vue-auto-002);
}

.explore-search {
  background: color-mix(in srgb, var(--vue-auto-007) 70%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, white 5%, transparent);
}

.explore-filter-strip,
.explore-featured-strip {
  scrollbar-width: none;
}

.explore-filter-strip::-webkit-scrollbar,
.explore-featured-strip::-webkit-scrollbar {
  display: none;
}

.explore-tag-chip {
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, white 8%, transparent),
    0 10px 22px color-mix(in srgb, black 16%, transparent);
}

.explore-tag-chip--idle {
  background: color-mix(in srgb, var(--vue-auto-162) 10%, var(--vue-auto-005));
  color: color-mix(in srgb, white 82%, transparent);
}

.explore-tag-chip--idle:hover {
  background: color-mix(in srgb, var(--vue-auto-162) 20%, var(--vue-auto-048));
  color: color-mix(in srgb, white 96%, transparent);
}

.explore-tag-chip--active {
  background: linear-gradient(135deg, var(--vue-auto-162), var(--vue-auto-163));
  color: white;
  box-shadow: 0 10px 24px var(--vue-auto-164);
}

.explore-server-tag {
  background: color-mix(in srgb, white 6%, transparent);
  color: color-mix(in srgb, white 72%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, white 6%, transparent);
}

.explore-ghost-btn {
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.explore-ghost-btn:hover {
  background: var(--vue-auto-002);
  color: var(--vue-auto-012);
}

.explore-alpha-toggle {
  background: var(--vue-auto-047);
  box-shadow:
    inset 0 1px 0 var(--vue-auto-002),
    0 0 0 1px var(--vue-auto-001);
}

.explore-alpha-toggle:hover {
  background: var(--vue-auto-080);
  color: var(--vue-auto-012);
  box-shadow:
    inset 0 1px 0 var(--vue-auto-001),
    0 0 0 1px var(--vue-auto-045);
}

:deep(.explore-sort-dropdown .echo-dropdown-container) {
  min-width: 0;
  gap: 0;
}

:deep(.explore-sort-dropdown .echo-dropdown-trigger) {
  background: var(--vue-auto-047);
  box-shadow:
    inset 0 1px 0 var(--vue-auto-002),
    0 0 0 1px var(--vue-auto-001);
  border-radius: 0.75rem;
}

:deep(.explore-sort-dropdown .echo-dropdown-trigger:hover) {
  background: var(--vue-auto-080);
  box-shadow:
    inset 0 1px 0 var(--vue-auto-001),
    0 0 0 1px var(--vue-auto-045);
}

:deep(
  .explore-sort-dropdown .echo-dropdown-trigger.echo-dropdown-trigger--open
) {
  background: var(--vue-auto-160);
  box-shadow:
    inset 0 1px 0 var(--vue-auto-008),
    0 0 0 1px var(--vue-auto-161);
}

:deep(.explore-sort-dropdown .echo-dropdown-menu) {
  border-radius: 0.75rem;
  box-shadow:
    0 0 0 1px var(--vue-auto-001),
    0 16px 48px var(--vue-auto-016);
}

.explore-primary-btn {
  background: linear-gradient(135deg, var(--vue-auto-162), var(--vue-auto-163));
  transition: filter 0.18s ease;
}

.explore-primary-btn:hover {
  filter: brightness(1.06);
}

.explore-secondary-btn {
  background: color-mix(in srgb, black 18%, var(--vue-auto-005));
  border: 1px solid color-mix(in srgb, white 10%, transparent);
  transition: background-color 0.18s ease;
}

.explore-secondary-btn:hover {
  background: color-mix(in srgb, black 10%, var(--vue-auto-048));
}

@media (max-width: 639px) {
  .explore-view {
    background-image:
      radial-gradient(
        circle at top center,
        color-mix(in srgb, var(--explore-mobile-radial-sky) 15%, transparent),
        transparent 38%
      ),
      radial-gradient(
        circle at 80% 18%,
        color-mix(in srgb, var(--explore-hero-radial-rose) 14%, transparent),
        transparent 28%
      ),
      linear-gradient(
        180deg,
        color-mix(
            in srgb,
            var(--surface) 95%,
            var(--explore-mobile-grad-deep) 5%
          )
          0%,
        var(--bg) 100%
      );
  }

  .explore-server-widget {
    box-shadow:
      inset 0 1px 0 var(--vue-auto-002),
      0 12px 28px color-mix(in srgb, black 32%, transparent);
  }
}
</style>

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
      inset 0 1px 0 color-mix(in srgb, #fff 85%, transparent),
      0 14px 36px color-mix(in srgb, var(--foreground) 7%, transparent);
    border-color: color-mix(in srgb, var(--border) 82%, transparent);
  }

  .explore-server-widget:hover {
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, #fff 92%, transparent),
      0 18px 44px color-mix(in srgb, var(--foreground) 9%, transparent);
    border-color: color-mix(in srgb, var(--border) 70%, transparent);
  }

  img.filter.invert,
  img.brightness-0 {
    filter: none !important;
    opacity: 0.62;
  }

  .explore-voice-badge {
    color: color-mix(in srgb, #14532d 92%, var(--text));
    background: color-mix(in srgb, var(--server-vc-active, #22c55e) 18%, #fff);
    box-shadow:
      inset 0 0 0 1px
        color-mix(in srgb, var(--server-vc-active, #22c55e) 42%, transparent),
      0 6px 16px color-mix(in srgb, var(--foreground) 6%, transparent);
  }

  .explore-voice-badge__dot {
    background: var(--server-vc-active, #16a34a);
    box-shadow: 0 0 0 2px
      color-mix(in srgb, var(--server-vc-active, #22c55e) 28%, transparent);
  }
}
</style>
