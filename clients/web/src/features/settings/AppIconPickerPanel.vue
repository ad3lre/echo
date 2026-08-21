<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { ensureIconCatalogLoaded } from '@/assets/iconCatalog';
import {
  getGroupedAppIcons,
  getSearchGroupedAppIcons,
  searchAppIcons,
  type AppIconEntry,
  type IconFamilyGroup,
} from '@/features/chat/emoji/useAppIconSearch';

const props = withDefaults(
  defineProps<{
    /** Debounced search string (same semantics as channel icon picker). */
    filterQuery: string;
    channelType?: 'text' | 'voice';
    /** Highlights current selection (e.g. channel `iconKey` filename). */
    selectedId?: string;
  }>(),
  { channelType: 'text' },
);

const emit = defineEmits<{
  select: [entry: AppIconEntry];
}>();

const catalogReady = ref(false);
const scrollRef = ref<HTMLElement | null>(null);
const expandedFamilyKey = ref<string | null>(null);
const scrollTop = ref(0);
const viewportH = ref(300);

const COLS = 5;
const GRID_GAP = 4;
const CELL_H = 52;
const ROW_H = CELL_H + GRID_GAP;
const OVERSCAN_PX = 200;

const searchTrim = computed(() => props.filterQuery.trim());
const isBrowsing = computed(() => !searchTrim.value);

const activeFamilyGroups = computed<IconFamilyGroup[]>(() => {
  if (!catalogReady.value) return [];
  if (isBrowsing.value) return getGroupedAppIcons(props.channelType);
  return getSearchGroupedAppIcons(props.filterQuery, props.channelType, 800);
});

const searchMatchCount = computed(() => {
  if (!catalogReady.value || !searchTrim.value) return 0;
  return activeFamilyGroups.value.reduce(
    (sum, group) => sum + group.variants.length,
    0,
  );
});

function estimateVariantH(count: number): number {
  const rows = Math.ceil(count / COLS);
  const paddingY = 18;
  return rows * CELL_H + Math.max(0, rows - 1) * GRID_GAP + paddingY;
}

interface VRow {
  key: string;
  type: 'grid' | 'variants';
  y: number;
  h: number;
  cells: IconFamilyGroup[];
  variants: AppIconEntry[];
}

const browseLayout = computed(() => {
  const groups = activeFamilyGroups.value;
  const rows: VRow[] = [];
  let y = 0;
  for (let i = 0; i < groups.length; i += COLS) {
    const cells = groups.slice(i, i + COLS);
    rows.push({
      key: `g${i}`,
      type: 'grid',
      cells,
      y,
      h: ROW_H,
      variants: [],
    });
    y += ROW_H;
    if (expandedFamilyKey.value) {
      const ex = cells.find((g) => g.key === expandedFamilyKey.value);
      if (ex && ex.variants.length > 1) {
        const h = estimateVariantH(ex.variants.length);
        rows.push({
          key: `v-${ex.key}`,
          type: 'variants',
          cells: [],
          y,
          h,
          variants: ex.variants,
        });
        y += h;
      }
    }
  }
  return { rows, totalH: y };
});

function sliceVisible<T extends { y: number; h: number }>(rows: T[]): T[] {
  if (!rows.length) return [];
  const top = scrollTop.value - OVERSCAN_PX;
  const bottom = scrollTop.value + viewportH.value + OVERSCAN_PX;
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (rows[mid]!.y + rows[mid]!.h <= top) lo = mid + 1;
    else hi = mid;
  }
  const start = lo;
  lo = start;
  hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (rows[mid]!.y < bottom) lo = mid + 1;
    else hi = mid;
  }
  return rows.slice(start, lo);
}

const visibleBrowseRows = computed(() => sliceVisible(browseLayout.value.rows));
const totalHeight = computed(() => browseLayout.value.totalH);

function onScroll(e: Event) {
  scrollTop.value = (e.target as HTMLElement).scrollTop;
}

watch(isBrowsing, () => {
  scrollTop.value = 0;
  if (scrollRef.value) scrollRef.value.scrollTop = 0;
});

watch(
  () => props.filterQuery,
  () => {
    expandedFamilyKey.value = null;
  },
);

let resizeObs: ResizeObserver | null = null;

function attachResize() {
  resizeObs?.disconnect();
  resizeObs = null;
  if (scrollRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObs = new ResizeObserver(([entry]) => {
      if (entry) viewportH.value = entry.contentRect.height;
    });
    resizeObs.observe(scrollRef.value);
  }
}

function detachResize() {
  resizeObs?.disconnect();
  resizeObs = null;
}

function select(entry: AppIconEntry) {
  emit('select', entry);
}

function onFamilyClick(group: IconFamilyGroup) {
  if (group.variants.length === 1) {
    select(group.variants[0]!);
    return;
  }
  expandedFamilyKey.value =
    expandedFamilyKey.value === group.key ? null : group.key;
}

function isGroupSelected(group: IconFamilyGroup) {
  const sid = props.selectedId?.trim();
  if (!sid) return false;
  return group.variants.some((v) => v.id === sid);
}

function isVariantSelected(entry: AppIconEntry) {
  const sid = props.selectedId?.trim();
  return !!sid && entry.id === sid;
}

onMounted(async () => {
  await ensureIconCatalogLoaded();
  catalogReady.value = true;
  await nextTick();
  attachResize();
});

watch(catalogReady, (ready) => {
  if (ready) nextTick(() => attachResize());
});

watch(scrollRef, () => {
  nextTick(() => attachResize());
});

onUnmounted(() => {
  detachResize();
});
</script>

<template>
  <div
    class="app-icon-picker-panel flex min-h-0 flex-1 flex-col overflow-hidden"
  >
    <div
      v-if="!catalogReady"
      class="icon-picker-scroll flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 py-2"
      role="status"
      aria-live="polite"
      aria-label="Loading icon catalog"
    >
      <svg
        class="echo-ios-spinner"
        viewBox="0 0 44 44"
        width="34"
        height="34"
        aria-hidden="true"
      >
        <circle class="echo-ios-spinner__track" cx="22" cy="22" r="18" />
        <circle
          class="echo-ios-spinner__arc"
          cx="22"
          cy="22"
          r="18"
          transform="rotate(-90 22 22)"
        />
      </svg>
    </div>

    <div
      v-else
      ref="scrollRef"
      class="icon-picker-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2 custom-scrollbar"
      v-scrollbar-on-scroll
      @scroll="onScroll"
    >
      <div
        :style="{
          height: totalHeight + 'px',
          position: 'relative',
          minHeight: '1px',
        }"
      >
        <template v-if="isBrowsing || searchMatchCount > 0">
          <template v-for="row in visibleBrowseRows" :key="row.key">
            <div
              v-if="row.type === 'grid'"
              class="icon-vrow icon-picker-grid"
              :style="{ top: row.y + 'px', height: row.h + 'px' }"
            >
              <button
                v-for="group in row.cells"
                :key="group.key"
                type="button"
                class="icon-picker-cell flex flex-col items-center justify-center gap-0.5 rounded-lg p-1.5 transition-colors hover:bg-glass-hover"
                :class="{
                  'bg-glass-3 ring-1 ring-border': isGroupSelected(group),
                }"
                :title="
                  group.variants.length > 1
                    ? `${group.label} (${group.variants.length} variants) — click to expand`
                    : group.label
                "
                @click="onFamilyClick(group)"
              >
                <div class="relative flex items-center justify-center">
                  <img
                    :src="group.representative.url"
                    alt=""
                    class="h-6 w-6 object-contain opacity-85 filter invert"
                  />
                  <span
                    v-if="group.variants.length > 1"
                    class="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-glass-3 px-0.5 text-[8px] font-bold text-fg-soft ring-1 ring-border"
                  >
                    {{ group.variants.length }}
                  </span>
                </div>
                <span
                  class="max-w-full truncate px-0.5 text-[9px] font-medium text-fg-subtle"
                  >{{ group.label }}</span
                >
              </button>
            </div>
            <div
              v-else
              class="icon-vrow icon-picker-variant-row"
              :style="{ top: row.y + 'px', height: row.h + 'px' }"
            >
              <button
                v-for="v in row.variants"
                :key="v.id"
                type="button"
                class="icon-picker-cell icon-picker-variant-chip flex flex-col items-center justify-center gap-0.5 rounded-lg p-1.5 transition-colors hover:bg-glass-hover"
                :class="{
                  'bg-glass-2 ring-1 ring-white/25': isVariantSelected(v),
                }"
                :title="v.label"
                @click.stop="select(v)"
              >
                <img
                  :src="v.url"
                  alt=""
                  class="h-6 w-6 object-contain opacity-90 filter invert"
                />
                <span
                  class="max-w-full truncate px-0.5 text-[8px] font-medium text-fg-subtle"
                  >{{ v.label }}</span
                >
              </button>
            </div>
          </template>
        </template>
      </div>

      <div
        v-if="!isBrowsing && searchMatchCount === 0"
        class="py-10 text-center text-sm text-fg-subtle"
      >
        No icons match "{{ searchTrim }}"
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.icon-picker-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  width: 100%;
}

.icon-picker-cell {
  min-height: 52px;
  width: 100%;
}

.icon-vrow {
  position: absolute;
  left: 0;
  right: 0;
}

.icon-picker-variant-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  padding: 8px 6px 10px;
  margin-bottom: 2px;
  border-radius: 12px;
  background: var(--vue-auto-038);
  border: 1px solid var(--vue-auto-008);
  box-shadow: inset 0 1px 0 var(--vue-auto-007);
  overflow: hidden;
}
</style>
