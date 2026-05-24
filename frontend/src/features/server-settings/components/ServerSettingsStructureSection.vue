<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  toRef,
} from 'vue';
import type { ChannelCategory } from '@/composables/useChannels';
import type { ChannelSummary } from '@shared/types';
import { getChannelDisplayName, icons } from '@/assets/icons';
import { useChannelIconResolver } from '@/composables/useChannelIconResolver';
import {
  getParentChannelIdOrNull,
  isForumPostChannel,
} from '@/features/forums/domain/forumPostChannel';
import { useChannelMoveCrossCategoryPreference } from '@/features/channel-settings/composables/useChannelMoveCrossCategoryPreference';

const MERGED_HIDE_KEY = '__merged_hide__';

const { mode } = useChannelMoveCrossCategoryPreference();

const props = withDefaults(
  defineProps<{
    categories: ChannelCategory[];
    /** Resolves `custom-emoji:{id}` channel icons against server packs. */
    serverId?: string | null;
    canReorderChannels?: boolean;
    canReorderCategories?: boolean;
    commitChannelReorder: (payload: {
      channelId: string;
      targetCategoryId: string | null;
      siblingIndex: number;
    }) => void | Promise<void>;
    commitCategoryReorder: (payload: {
      categoryId: string;
      siblingIndex: number;
    }) => void | Promise<void>;
  }>(),
  {
    serverId: null,
    canReorderChannels: false,
    canReorderCategories: false,
  },
);

const channelIconResolver = useChannelIconResolver(
  toRef(() => props.serverId ?? undefined),
);

function topLevelChannels(channels: ChannelSummary[]): ChannelSummary[] {
  return channels.filter((c) => {
    if (getParentChannelIdOrNull(c)) return false;
    if (isForumPostChannel(c)) return false;
    return true;
  });
}

function topLevelIds(cat: ChannelCategory): string[] {
  return topLevelChannels(cat.channels).map((c) => c.id);
}

function bucketIdsForCategory(target: ChannelCategory): string[] {
  if (!target.hideCategoryHeader) {
    return topLevelIds(target);
  }
  const ids: string[] = [];
  for (const c of props.categories) {
    if (c.hideCategoryHeader) {
      ids.push(...topLevelIds(c));
    }
  }
  return ids;
}

function categoryApiIdForReorder(cat: ChannelCategory): string | null {
  return cat.hideCategoryHeader ? null : cat.id;
}

function reorderInsertIndex(
  orderedIds: string[],
  draggedId: string,
  insertBeforeId: string | null,
): number | null {
  const without = orderedIds.filter((id) => id !== draggedId);
  if (insertBeforeId === null) return without.length;
  if (insertBeforeId === draggedId) return null;
  const i = without.indexOf(insertBeforeId);
  return i === -1 ? without.length : i;
}

const realCategories = computed(() =>
  props.categories.filter((c) => !c.hideCategoryHeader),
);

const realCategoryIds = computed(() => realCategories.value.map((c) => c.id));

const hideBucketAnchor = computed(
  () => props.categories.find((c) => c.hideCategoryHeader) ?? null,
);

const mergedHideTopLevel = computed((): ChannelSummary[] => {
  const anchor = hideBucketAnchor.value;
  if (!anchor) return [];
  const ids = bucketIdsForCategory(anchor);
  const byId = new Map<string, ChannelSummary>();
  for (const c of props.categories) {
    if (!c.hideCategoryHeader) continue;
    for (const ch of topLevelChannels(c.channels)) {
      byId.set(ch.id, ch);
    }
  }
  return ids
    .map((id) => byId.get(id))
    .filter((x): x is ChannelSummary => Boolean(x));
});

const busy = ref(false);

/** Writable while focusing — avoids `:value`-only inputs that Vue resets each render (typing “snapped back”). */
const positionDraft = reactive<Record<string, string>>({});

function draftCat(catId: string) {
  return `cat:${catId}`;
}
function draftCh(catId: string, chId: string) {
  return `ch:${catId}:${chId}`;
}
function draftMerged(chId: string) {
  return `m:${chId}`;
}

function displayCatDraft(catId: string): string {
  const k = draftCat(catId);
  return positionDraft[k] ?? String(categoryPosition(catId));
}

function displayChDraft(catId: string, bucket: string[], chId: string): string {
  const k = draftCh(catId, chId);
  return positionDraft[k] ?? String(channelPosition(bucket, chId));
}

function displayMergedDraft(bucket: string[], chId: string): string {
  const k = draftMerged(chId);
  return positionDraft[k] ?? String(channelPosition(bucket, chId));
}

function onCatPosFocus(catId: string) {
  positionDraft[draftCat(catId)] = String(categoryPosition(catId));
}

function onCatPosInput(catId: string, ev: Event) {
  positionDraft[draftCat(catId)] = (ev.target as HTMLInputElement).value;
}

async function onCatPosCommit(catId: string, ev: Event) {
  const el = ev.target as HTMLInputElement;
  const raw = el.value;
  delete positionDraft[draftCat(catId)];
  await setCategoryPosition(catId, Number(raw || 1));
}

function onChPosFocus(catId: string, bucket: string[], chId: string) {
  positionDraft[draftCh(catId, chId)] = String(channelPosition(bucket, chId));
}

function onChPosInput(catId: string, chId: string, ev: Event) {
  positionDraft[draftCh(catId, chId)] = (ev.target as HTMLInputElement).value;
}

async function onChPosCommit(
  bucketKey: string,
  cat: ChannelCategory,
  chId: string,
  bucket: string[],
  ev: Event,
) {
  const el = ev.target as HTMLInputElement;
  const raw = el.value;
  delete positionDraft[draftCh(cat.id, chId)];
  await setChannelPosition(bucketKey, cat, chId, Number(raw || 1));
}

function onMergedPosFocus(bucket: string[], chId: string) {
  positionDraft[draftMerged(chId)] = String(channelPosition(bucket, chId));
}

function onMergedPosInput(chId: string, ev: Event) {
  positionDraft[draftMerged(chId)] = (ev.target as HTMLInputElement).value;
}

async function onMergedPosCommit(bucket: string[], chId: string, ev: Event) {
  const anchor = hideBucketAnchor.value;
  if (!anchor) return;
  const el = ev.target as HTMLInputElement;
  const raw = el.value;
  delete positionDraft[draftMerged(chId)];
  await setChannelPosition(MERGED_HIDE_KEY, anchor, chId, Number(raw || 1));
}

function categoryPosition(categoryId: string): number {
  const idx = realCategoryIds.value.indexOf(categoryId);
  return idx === -1 ? 1 : idx + 1;
}

function channelPosition(bucket: string[], channelId: string): number {
  const idx = bucket.indexOf(channelId);
  return idx === -1 ? 1 : idx + 1;
}

function clampPosition(next: number, total: number): number {
  if (!Number.isFinite(next)) return 1;
  return Math.max(1, Math.min(Math.trunc(next), Math.max(1, total)));
}

async function setCategoryPosition(categoryId: string, nextPosition: number) {
  const ids = [...realCategoryIds.value];
  const current = ids.indexOf(categoryId);
  if (current === -1) return;
  const target = clampPosition(nextPosition, ids.length);
  if (target === current + 1) return;
  const without = ids.filter((id) => id !== categoryId);
  const insertAt = Math.max(0, Math.min(target - 1, without.length));
  const insertBeforeId = without[insertAt] ?? null;
  const idx = reorderInsertIndex(ids, categoryId, insertBeforeId);
  if (idx === null) return;
  busy.value = true;
  try {
    await props.commitCategoryReorder({ categoryId, siblingIndex: idx });
  } finally {
    busy.value = false;
  }
}

async function nudgeCategory(categoryId: string, delta: number) {
  await setCategoryPosition(categoryId, categoryPosition(categoryId) + delta);
}

async function setChannelPosition(
  bucketKey: string,
  targetCat: ChannelCategory,
  channelId: string,
  nextPosition: number,
) {
  const cat = targetCategoryForBucket(bucketKey, targetCat);
  const bucket = bucketIdsForCategory(cat);
  const current = bucket.indexOf(channelId);
  if (current === -1) return;
  const target = clampPosition(nextPosition, bucket.length);
  if (target === current + 1) return;
  const without = bucket.filter((id) => id !== channelId);
  const insertAt = Math.max(0, Math.min(target - 1, without.length));
  const insertBeforeId = without[insertAt] ?? null;
  const idx = reorderInsertIndex(bucket, channelId, insertBeforeId);
  if (idx === null) return;
  busy.value = true;
  try {
    await props.commitChannelReorder({
      channelId,
      targetCategoryId: categoryApiIdForReorder(cat),
      siblingIndex: idx,
    });
  } finally {
    busy.value = false;
  }
}

async function nudgeChannel(
  bucketKey: string,
  targetCat: ChannelCategory,
  channelId: string,
  delta: number,
) {
  const cat = targetCategoryForBucket(bucketKey, targetCat);
  const bucket = bucketIdsForCategory(cat);
  const current = channelPosition(bucket, channelId);
  await setChannelPosition(bucketKey, targetCat, channelId, current + delta);
}

function categoryAccentClass(index: number): string {
  const accents = [
    'from-violet-400/40 to-violet-500/10',
    'from-cyan-400/40 to-cyan-500/10',
    'from-emerald-400/40 to-emerald-500/10',
    'from-amber-400/40 to-amber-500/10',
  ];
  return accents[index % accents.length] ?? accents[0]!;
}

function channelIconUrl(ch: ChannelSummary): string {
  const v = channelIconResolver.getVisual(ch);
  if (v.kind === 'svg' || v.kind === 'image') return v.url;
  return channelIconResolver.getIconUrl(ch);
}

function channelEmoji(ch: ChannelSummary): string | null {
  const v = channelIconResolver.getVisual(ch);
  return v.kind === 'emoji' ? v.emoji : null;
}

function channelIconUsesInvert(ch: ChannelSummary): boolean {
  return channelIconResolver.usesSvgInvert(ch);
}

// ----- category DnD -----
const catDragId = ref<string | null>(null);
const catLineBefore = ref<number | null>(null);

function onCatDragStart(categoryId: string, e: DragEvent) {
  if (!props.canReorderCategories) {
    e.preventDefault();
    return;
  }
  catDragId.value = categoryId;
  catLineBefore.value = null;
  const dt = e.dataTransfer;
  if (dt) {
    dt.setData('text/plain', categoryId);
    dt.effectAllowed = 'move';
  }
}

function onCatDragEnd() {
  catDragId.value = null;
  catLineBefore.value = null;
}

function onCategoryListDragOverCapture(e: DragEvent) {
  if (!catDragId.value || !props.canReorderCategories) return;
  e.preventDefault();
  const dt = e.dataTransfer;
  if (dt) dt.dropEffect = 'move';
}

function catRowDragOver(index: number, e: DragEvent) {
  if (!catDragId.value || !props.canReorderCategories) return;
  e.preventDefault();
  const dt = e.dataTransfer;
  if (dt) dt.dropEffect = 'move';
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const mid = rect.top + rect.height / 2;
  const n = realCategoryIds.value.length;
  const raw = e.clientY < mid ? index : index + 1;
  catLineBefore.value = Math.max(0, Math.min(raw, n));
}

function showCatLineBefore(idx: number) {
  return (
    catDragId.value &&
    catLineBefore.value !== null &&
    catLineBefore.value === idx
  );
}

function resolveCatInsertBeforeId(
  e: DragEvent,
  rowIndex: number,
): string | null {
  const ids = realCategoryIds.value;
  const n = ids.length;
  let lineBefore: number;
  if (
    catLineBefore.value !== null &&
    catLineBefore.value >= 0 &&
    catLineBefore.value <= n
  ) {
    lineBefore = catLineBefore.value;
  } else {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const raw = e.clientY < mid ? rowIndex : rowIndex + 1;
    lineBefore = Math.max(0, Math.min(raw, n));
  }
  if (lineBefore >= n) return null;
  return ids[lineBefore] ?? null;
}

async function onCatRowDrop(rowIndex: number, e: DragEvent) {
  const fromTransfer = e.dataTransfer?.getData('text/plain')?.trim();
  const dragId = catDragId.value ?? fromTransfer ?? null;
  if (!dragId || !props.canReorderCategories) return;
  const ids = [...realCategoryIds.value];
  const insertBeforeId = resolveCatInsertBeforeId(e, rowIndex);
  const idx = reorderInsertIndex(ids, dragId, insertBeforeId);
  if (idx === null) {
    onCatDragEnd();
    return;
  }
  busy.value = true;
  try {
    await props.commitCategoryReorder({
      categoryId: dragId,
      siblingIndex: idx,
    });
  } finally {
    busy.value = false;
    onCatDragEnd();
  }
}

function onCatAppendDragOver(e: DragEvent) {
  if (!catDragId.value || !props.canReorderCategories) return;
  e.preventDefault();
  const dt = e.dataTransfer;
  if (dt) dt.dropEffect = 'move';
  catLineBefore.value = realCategoryIds.value.length;
}

function showCatLineEnd() {
  return (
    catDragId.value &&
    catLineBefore.value === realCategoryIds.value.length &&
    realCategoryIds.value.length > 0
  );
}

async function onCatAppendDrop(e: DragEvent) {
  const fromTransfer = e.dataTransfer?.getData('text/plain')?.trim();
  const dragId = catDragId.value ?? fromTransfer ?? null;
  if (!dragId || !props.canReorderCategories) return;
  const ids = [...realCategoryIds.value];
  const idx = reorderInsertIndex(ids, dragId, null);
  if (idx === null) {
    onCatDragEnd();
    return;
  }
  busy.value = true;
  try {
    await props.commitCategoryReorder({
      categoryId: dragId,
      siblingIndex: idx,
    });
  } finally {
    busy.value = false;
    onCatDragEnd();
  }
}

// ----- channel DnD -----
const chDrag = ref<{ channelId: string; bucketKey: string } | null>(null);
const chLineBefore = ref<{ key: string; lineBefore: number } | null>(null);

function resetAllDragState() {
  onCatDragEnd();
  onChDragEnd();
}

function bucketKeyForCategory(cat: ChannelCategory): string {
  return cat.hideCategoryHeader ? MERGED_HIDE_KEY : cat.id;
}

function onChDragStart(bucketKey: string, channelId: string, e: DragEvent) {
  if (!props.canReorderChannels) {
    e.preventDefault();
    return;
  }
  chDrag.value = { channelId, bucketKey };
  chLineBefore.value = null;
  const dt = e.dataTransfer;
  if (dt) {
    dt.setData('text/plain', channelId);
    dt.effectAllowed = 'move';
  }
}

function onChDragEnd() {
  chDrag.value = null;
  chLineBefore.value = null;
}

function onChannelListDragOverCapture(e: DragEvent) {
  if (!chDrag.value || !props.canReorderChannels) return;
  e.preventDefault();
  const dt = e.dataTransfer;
  if (dt) dt.dropEffect = 'move';
}

function chRowDragOver(
  bucketKey: string,
  index: number,
  listLen: number,
  e: DragEvent,
) {
  if (!chDrag.value || !props.canReorderChannels) return;
  e.preventDefault();
  const dt = e.dataTransfer;
  if (dt) dt.dropEffect = 'move';
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const mid = rect.top + rect.height / 2;
  const raw = e.clientY < mid ? index : index + 1;
  chLineBefore.value = {
    key: bucketKey,
    lineBefore: Math.max(0, Math.min(raw, listLen)),
  };
}

function showChLineBefore(bucketKey: string, idx: number) {
  if (!chDrag.value || !props.canReorderChannels) return false;
  return (
    chLineBefore.value?.key === bucketKey &&
    chLineBefore.value.lineBefore === idx
  );
}

function showChLineEnd(bucketKey: string, listLen: number) {
  if (!chDrag.value || !props.canReorderChannels) return false;
  return (
    chLineBefore.value?.key === bucketKey &&
    chLineBefore.value.lineBefore === listLen &&
    listLen > 0
  );
}

function resolveChInsertBeforeId(
  bucketKey: string,
  topIds: string[],
  rowIndex: number,
  e: DragEvent,
): string | null {
  const n = topIds.length;
  let lineBefore: number;
  if (
    chLineBefore.value?.key === bucketKey &&
    chLineBefore.value.lineBefore >= 0 &&
    chLineBefore.value.lineBefore <= n
  ) {
    lineBefore = chLineBefore.value.lineBefore;
  } else {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const raw = e.clientY < mid ? rowIndex : rowIndex + 1;
    lineBefore = Math.max(0, Math.min(raw, n));
  }
  if (lineBefore >= n) return null;
  return topIds[lineBefore] ?? null;
}

function targetCategoryForBucket(
  bucketKey: string,
  namedCat: ChannelCategory,
): ChannelCategory {
  if (bucketKey === MERGED_HIDE_KEY) {
    return hideBucketAnchor.value ?? namedCat;
  }
  return namedCat;
}

async function onChRowDrop(
  bucketKey: string,
  targetCat: ChannelCategory,
  topIds: string[],
  rowIndex: number,
  e: DragEvent,
) {
  const fromTransfer = e.dataTransfer?.getData('text/plain')?.trim();
  const dragId = chDrag.value?.channelId ?? fromTransfer ?? null;
  if (!dragId || !props.canReorderChannels) return;
  const cat = targetCategoryForBucket(bucketKey, targetCat);
  const insertBeforeId = resolveChInsertBeforeId(
    bucketKey,
    topIds,
    rowIndex,
    e,
  );
  const bucket = bucketIdsForCategory(cat);
  const idx = reorderInsertIndex(bucket, dragId, insertBeforeId);
  if (idx === null) {
    onChDragEnd();
    return;
  }
  busy.value = true;
  try {
    await props.commitChannelReorder({
      channelId: dragId,
      targetCategoryId: categoryApiIdForReorder(cat),
      siblingIndex: idx,
    });
  } finally {
    busy.value = false;
    onChDragEnd();
  }
}

function onChAppendDragOver(bucketKey: string, listLen: number, e: DragEvent) {
  if (!chDrag.value || !props.canReorderChannels) return;
  e.preventDefault();
  const dt = e.dataTransfer;
  if (dt) dt.dropEffect = 'move';
  chLineBefore.value = { key: bucketKey, lineBefore: listLen };
}

function onMergedHideDragStart(channelId: string, e: DragEvent) {
  if (!hideBucketAnchor.value) {
    e.preventDefault();
    return;
  }
  onChDragStart(MERGED_HIDE_KEY, channelId, e);
}

async function onMergedHideRowDrop(rowIndex: number, e: DragEvent) {
  const anchor = hideBucketAnchor.value;
  if (!anchor) return;
  await onChRowDrop(
    MERGED_HIDE_KEY,
    anchor,
    mergedHideTopLevel.value.map((c) => c.id),
    rowIndex,
    e,
  );
}

async function onMergedHideAppendDrop(e: DragEvent) {
  const anchor = hideBucketAnchor.value;
  if (!anchor) return;
  await onChAppendDrop(MERGED_HIDE_KEY, anchor, e);
}

async function onChAppendDrop(
  bucketKey: string,
  targetCat: ChannelCategory,
  e: DragEvent,
) {
  const fromTransfer = e.dataTransfer?.getData('text/plain')?.trim();
  const dragId = chDrag.value?.channelId ?? fromTransfer ?? null;
  if (!dragId || !props.canReorderChannels) return;
  const cat = targetCategoryForBucket(bucketKey, targetCat);
  const bucket = bucketIdsForCategory(cat);
  const idx = reorderInsertIndex(bucket, dragId, null);
  if (idx === null) {
    onChDragEnd();
    return;
  }
  busy.value = true;
  try {
    await props.commitChannelReorder({
      channelId: dragId,
      targetCategoryId: categoryApiIdForReorder(cat),
      siblingIndex: idx,
    });
  } finally {
    busy.value = false;
    onChDragEnd();
  }
}

function onWindowDropEnd() {
  resetAllDragState();
}

function onWindowVisibilityChange() {
  if (document.hidden) {
    resetAllDragState();
  }
}

onMounted(() => {
  window.addEventListener('drop', onWindowDropEnd, true);
  window.addEventListener('dragend', onWindowDropEnd, true);
  window.addEventListener('blur', onWindowDropEnd);
  document.addEventListener('visibilitychange', onWindowVisibilityChange);
});

onBeforeUnmount(() => {
  window.removeEventListener('drop', onWindowDropEnd, true);
  window.removeEventListener('dragend', onWindowDropEnd, true);
  window.removeEventListener('blur', onWindowDropEnd);
  document.removeEventListener('visibilitychange', onWindowVisibilityChange);
});
</script>

<template>
  <div class="space-y-6 pb-6">
    <p v-if="busy" class="text-xs font-medium text-accent" aria-live="polite">
      Applying…
    </p>

    <section v-if="canReorderChannels" class="rounded-xl bg-glass-1 p-4 sm:p-5">
      <h4
        class="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-subtle"
      >
        Moving channels between categories
      </h4>
      <p class="mb-3 text-sm leading-snug text-fg-soft">
        When you drag a channel into another category, choose whether its
        permission overwrites should match that category (inherit its permission
        rows) or stay independent.
      </p>
      <div class="flex flex-col gap-2 text-sm text-fg">
        <label
          class="flex cursor-pointer items-start gap-2.5 rounded-lg bg-glass-1 px-3 py-2.5 transition hover:bg-glass-hover"
        >
          <input
            v-model="mode"
            type="radio"
            class="mt-0.5"
            value="keep"
            name="echo-channel-move-perm"
          />
          <span>
            <span class="font-medium text-fg">Keep channel overrides</span>
            <span class="mt-0.5 block text-xs text-fg-subtle">
              Leave the channel’s permission rows as they are (recommended if
              you customized this channel).
            </span>
          </span>
        </label>
        <label
          class="flex cursor-pointer items-start gap-2.5 rounded-lg bg-glass-1 px-3 py-2.5 transition hover:bg-glass-hover"
        >
          <input
            v-model="mode"
            type="radio"
            class="mt-0.5"
            value="sync"
            name="echo-channel-move-perm"
          />
          <span>
            <span class="font-medium text-fg">Sync with new category</span>
            <span class="mt-0.5 block text-xs text-fg-subtle">
              Replace the channel’s permission overwrites with copies of the
              destination category’s overwrites.
            </span>
          </span>
        </label>
        <label
          class="flex cursor-pointer items-start gap-2.5 rounded-lg bg-glass-1 px-3 py-2.5 transition hover:bg-glass-hover"
        >
          <input
            v-model="mode"
            type="radio"
            class="mt-0.5"
            value="ask"
            name="echo-channel-move-perm"
          />
          <span>
            <span class="font-medium text-fg">Decide each time</span>
            <span class="mt-0.5 block text-xs text-fg-subtle">
              Prompt on each channel move so you can pick keep or sync per
              action.
            </span>
          </span>
        </label>
      </div>
    </section>

    <section
      v-if="canReorderCategories && realCategories.length > 1"
      class="rounded-xl bg-glass-1 p-4 sm:p-5"
    >
      <h4
        class="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-subtle"
      >
        Category order
      </h4>
      <p class="mb-3 text-sm text-fg-soft">
        Drag entire categories to change how they appear in the channel list.
      </p>
      <div @dragover.capture="onCategoryListDragOverCapture">
        <div v-for="(cat, i) in realCategories" :key="cat.id" class="relative">
          <div
            v-if="showCatLineBefore(i)"
            class="pointer-events-none absolute -top-1 left-0 right-0 z-10 h-0.5 rounded-full bg-sky-400"
            aria-hidden="true"
          />
          <div
            class="flex items-center gap-3 rounded-lg border border-transparent px-2 py-2.5 transition-colors"
            :class="{
              'border-border bg-glass-1': catDragId === cat.id,
              'opacity-60': busy,
            }"
            @dragover.prevent="catRowDragOver(i, $event)"
            @drop.prevent="onCatRowDrop(i, $event)"
          >
            <span
              class="inline-flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded active:cursor-grabbing"
              :class="
                !busy && canReorderCategories
                  ? 'text-fg-soft opacity-70 hover:opacity-100'
                  : 'pointer-events-none opacity-25'
              "
              title="Drag to reorder category"
              aria-hidden="true"
              :draggable="!busy && canReorderCategories"
              @dragstart="onCatDragStart(cat.id, $event)"
              @dragend="onCatDragEnd"
            >
              <img
                :src="icons.moreVertical"
                alt=""
                class="h-4 w-4 shrink-0 opacity-80 filter invert"
                draggable="false"
              />
            </span>
            <span
              class="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md border border-border bg-scrim-2 px-1 text-[11px] font-semibold text-fg-soft"
            >
              {{ categoryPosition(cat.id) }}
            </span>
            <span class="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
              {{ cat.name }}
            </span>
            <span
              class="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle"
            >
              {{ topLevelChannels(cat.channels).length }} channel{{
                topLevelChannels(cat.channels).length === 1 ? '' : 's'
              }}
            </span>
            <div class="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                class="rounded-md border border-border bg-scrim-2 px-1.5 py-1 text-[10px] font-semibold text-fg-soft transition hover:border-border hover:text-fg disabled:opacity-40"
                :disabled="busy || categoryPosition(cat.id) <= 1"
                title="Move category up"
                @click.stop="nudgeCategory(cat.id, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                class="rounded-md border border-border bg-scrim-2 px-1.5 py-1 text-[10px] font-semibold text-fg-soft transition hover:border-border hover:text-fg disabled:opacity-40"
                :disabled="
                  busy || categoryPosition(cat.id) >= realCategoryIds.length
                "
                title="Move category down"
                @click.stop="nudgeCategory(cat.id, 1)"
              >
                ↓
              </button>
              <input
                class="w-11 rounded-md border border-border bg-scrim-2 px-1.5 py-1 text-center text-[11px] font-semibold text-fg-soft outline-none"
                type="number"
                min="1"
                :max="realCategoryIds.length"
                :value="displayCatDraft(cat.id)"
                :disabled="busy"
                title="Set category position"
                @click.stop
                @focus="onCatPosFocus(cat.id)"
                @input="onCatPosInput(cat.id, $event)"
                @keydown.enter.stop="onCatPosCommit(cat.id, $event)"
                @blur.stop="onCatPosCommit(cat.id, $event)"
              />
            </div>
          </div>
        </div>
        <div
          v-if="canReorderCategories && catDragId"
          class="relative min-h-[12px] -my-0.5"
          :class="{ 'ring-1 ring-sky-400/60 rounded': showCatLineEnd() }"
          @dragover.prevent="onCatAppendDragOver($event)"
          @drop.prevent="onCatAppendDrop($event)"
        />
      </div>
    </section>

    <section
      v-for="(cat, catIdx) in categories.filter((c) => !c.hideCategoryHeader)"
      :key="`ch-${cat.id}`"
      class="rounded-xl bg-glass-1 p-4 sm:p-5"
    >
      <div
        class="mb-3 rounded-lg border border-border bg-gradient-to-r px-3 py-2"
        :class="categoryAccentClass(catIdx)"
      >
        <div class="flex min-w-0 items-center gap-2">
          <span
            class="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md border border-border bg-scrim-2 px-1 text-[11px] font-semibold text-fg-soft"
          >
            {{ categoryPosition(cat.id) }}
          </span>
          <h4
            class="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-soft"
          >
            {{ cat.name }}
          </h4>
          <span
            class="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-fg-soft"
          >
            {{ topLevelChannels(cat.channels).length }} channels
          </span>
        </div>
      </div>
      <p
        v-if="!topLevelChannels(cat.channels).length"
        class="text-sm text-fg-subtle"
      >
        No channels in this category.
      </p>
      <div v-else @dragover.capture="onChannelListDragOverCapture">
        <div
          v-for="(ch, idx) in topLevelChannels(cat.channels)"
          :key="ch.id"
          class="relative"
        >
          <div
            v-if="showChLineBefore(bucketKeyForCategory(cat), idx)"
            class="pointer-events-none absolute -top-1 left-0 right-0 z-10 h-0.5 rounded-full bg-sky-400"
            aria-hidden="true"
          />
          <div
            class="flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition-colors"
            :class="{
              'border-border bg-glass-1':
                chDrag?.channelId === ch.id &&
                chDrag?.bucketKey === bucketKeyForCategory(cat),
              'opacity-60': busy,
            }"
            @dragover.prevent="
              chRowDragOver(
                bucketKeyForCategory(cat),
                idx,
                topLevelChannels(cat.channels).length,
                $event,
              )
            "
            @drop.prevent="
              onChRowDrop(
                bucketKeyForCategory(cat),
                cat,
                topLevelChannels(cat.channels).map((c) => c.id),
                idx,
                $event,
              )
            "
          >
            <span
              class="inline-flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded active:cursor-grabbing"
              :class="
                !busy && canReorderChannels
                  ? 'text-fg-soft opacity-70 hover:opacity-100'
                  : 'pointer-events-none opacity-25'
              "
              title="Drag to reorder channel"
              aria-hidden="true"
              :draggable="!busy && canReorderChannels"
              @dragstart="
                onChDragStart(bucketKeyForCategory(cat), ch.id, $event)
              "
              @dragend="onChDragEnd"
            >
              <img
                :src="icons.moreVertical"
                alt=""
                class="h-4 w-4 shrink-0 opacity-80 filter invert"
                draggable="false"
              />
            </span>
            <span
              class="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md border border-border bg-scrim-2 px-1 text-[11px] font-semibold text-fg-soft"
            >
              {{
                channelPosition(
                  topLevelChannels(cat.channels).map((c) => c.id),
                  ch.id,
                )
              }}
            </span>
            <img
              v-if="!channelEmoji(ch)"
              :src="channelIconUrl(ch)"
              alt=""
              class="h-4 w-4 shrink-0 object-contain opacity-70"
              :class="channelIconUsesInvert(ch) ? 'filter invert' : ''"
              draggable="false"
            />
            <span
              v-else
              class="flex h-4 w-4 shrink-0 items-center justify-center text-[13px] leading-none opacity-80"
              aria-hidden="true"
              >{{ channelEmoji(ch) }}</span
            >
            <span class="min-w-0 flex-1 truncate text-sm text-fg">
              {{ getChannelDisplayName(ch.name) }}
            </span>
            <span
              v-if="ch.type === 'voice'"
              class="shrink-0 text-[10px] font-semibold uppercase text-fg-subtle"
              >Voice</span
            >
            <span
              v-else-if="ch.type === 'forum'"
              class="shrink-0 text-[10px] font-semibold uppercase text-fg-subtle"
              >Forum</span
            >
            <div class="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                class="rounded-md border border-border bg-scrim-2 px-1.5 py-1 text-[10px] font-semibold text-fg-soft transition hover:border-border hover:text-fg disabled:opacity-40"
                :disabled="
                  busy ||
                  channelPosition(
                    topLevelChannels(cat.channels).map((c) => c.id),
                    ch.id,
                  ) <= 1
                "
                title="Move channel up"
                @click.stop="
                  nudgeChannel(bucketKeyForCategory(cat), cat, ch.id, -1)
                "
              >
                ↑
              </button>
              <button
                type="button"
                class="rounded-md border border-border bg-scrim-2 px-1.5 py-1 text-[10px] font-semibold text-fg-soft transition hover:border-border hover:text-fg disabled:opacity-40"
                :disabled="
                  busy ||
                  channelPosition(
                    topLevelChannels(cat.channels).map((c) => c.id),
                    ch.id,
                  ) >= topLevelChannels(cat.channels).length
                "
                title="Move channel down"
                @click.stop="
                  nudgeChannel(bucketKeyForCategory(cat), cat, ch.id, 1)
                "
              >
                ↓
              </button>
              <input
                class="w-11 rounded-md border border-border bg-scrim-2 px-1.5 py-1 text-center text-[11px] font-semibold text-fg-soft outline-none"
                type="number"
                min="1"
                :max="topLevelChannels(cat.channels).length"
                :value="
                  displayChDraft(
                    cat.id,
                    topLevelChannels(cat.channels).map((c) => c.id),
                    ch.id,
                  )
                "
                :disabled="busy"
                title="Set channel position"
                @click.stop
                @focus="
                  onChPosFocus(
                    cat.id,
                    topLevelChannels(cat.channels).map((c) => c.id),
                    ch.id,
                  )
                "
                @input="onChPosInput(cat.id, ch.id, $event)"
                @keydown.enter.stop="
                  onChPosCommit(
                    bucketKeyForCategory(cat),
                    cat,
                    ch.id,
                    topLevelChannels(cat.channels).map((c) => c.id),
                    $event,
                  )
                "
                @blur.stop="
                  onChPosCommit(
                    bucketKeyForCategory(cat),
                    cat,
                    ch.id,
                    topLevelChannels(cat.channels).map((c) => c.id),
                    $event,
                  )
                "
              />
            </div>
          </div>
        </div>
        <div
          v-if="canReorderChannels && chDrag"
          class="relative min-h-[12px] -my-0.5"
          :class="{
            'ring-1 ring-sky-400/60 rounded': showChLineEnd(
              bucketKeyForCategory(cat),
              topLevelChannels(cat.channels).length,
            ),
          }"
          @dragover.prevent="
            onChAppendDragOver(
              bucketKeyForCategory(cat),
              topLevelChannels(cat.channels).length,
              $event,
            )
          "
          @drop.prevent="onChAppendDrop(bucketKeyForCategory(cat), cat, $event)"
        />
      </div>
    </section>

    <section
      v-if="mergedHideTopLevel.length"
      class="rounded-xl bg-glass-1 p-4 sm:p-5"
    >
      <div
        class="mb-3 rounded-lg border border-border bg-gradient-to-r from-fuchsia-400/35 to-fuchsia-500/10 px-3 py-2"
      >
        <div class="flex min-w-0 items-center gap-2">
          <span
            class="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md border border-border bg-scrim-2 px-1 text-[11px] font-semibold text-fg-soft"
          >
            •
          </span>
          <h4
            class="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-soft"
          >
            Other channels
          </h4>
          <span
            class="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-fg-soft"
          >
            {{ mergedHideTopLevel.length }} channels
          </span>
        </div>
      </div>
      <p class="mb-3 text-sm text-fg-soft">
        Channels not grouped under a category header share one order (same as
        the sidebar).
      </p>
      <div @dragover.capture="onChannelListDragOverCapture">
        <div
          v-for="(ch, idx) in mergedHideTopLevel"
          :key="ch.id"
          class="relative"
        >
          <div
            v-if="showChLineBefore(MERGED_HIDE_KEY, idx)"
            class="pointer-events-none absolute -top-1 left-0 right-0 z-10 h-0.5 rounded-full bg-sky-400"
            aria-hidden="true"
          />
          <div
            class="flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition-colors"
            :class="{
              'border-border bg-glass-1':
                chDrag?.channelId === ch.id &&
                chDrag?.bucketKey === MERGED_HIDE_KEY,
              'opacity-60': busy,
            }"
            @dragover.prevent="
              chRowDragOver(
                MERGED_HIDE_KEY,
                idx,
                mergedHideTopLevel.length,
                $event,
              )
            "
            @drop.prevent="onMergedHideRowDrop(idx, $event)"
          >
            <span
              class="inline-flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded active:cursor-grabbing"
              :class="
                !busy && canReorderChannels && !!hideBucketAnchor
                  ? 'text-fg-soft opacity-70 hover:opacity-100'
                  : 'pointer-events-none opacity-25'
              "
              title="Drag to reorder channel"
              aria-hidden="true"
              :draggable="!busy && canReorderChannels && !!hideBucketAnchor"
              @dragstart="onMergedHideDragStart(ch.id, $event)"
              @dragend="onChDragEnd"
            >
              <img
                :src="icons.moreVertical"
                alt=""
                class="h-4 w-4 shrink-0 opacity-80 filter invert"
                draggable="false"
              />
            </span>
            <span
              class="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md border border-border bg-scrim-2 px-1 text-[11px] font-semibold text-fg-soft"
            >
              {{
                channelPosition(
                  mergedHideTopLevel.map((c) => c.id),
                  ch.id,
                )
              }}
            </span>
            <img
              v-if="!channelEmoji(ch)"
              :src="channelIconUrl(ch)"
              alt=""
              class="h-4 w-4 shrink-0 object-contain opacity-70"
              :class="channelIconUsesInvert(ch) ? 'filter invert' : ''"
              draggable="false"
            />
            <span
              v-else
              class="flex h-4 w-4 shrink-0 items-center justify-center text-[13px] leading-none opacity-80"
              aria-hidden="true"
              >{{ channelEmoji(ch) }}</span
            >
            <span class="min-w-0 flex-1 truncate text-sm text-fg">
              {{ getChannelDisplayName(ch.name) }}
            </span>
            <span
              v-if="ch.type === 'voice'"
              class="shrink-0 text-[10px] font-semibold uppercase text-fg-subtle"
              >Voice</span
            >
            <span
              v-else-if="ch.type === 'forum'"
              class="shrink-0 text-[10px] font-semibold uppercase text-fg-subtle"
              >Forum</span
            >
            <div class="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                class="rounded-md border border-border bg-scrim-2 px-1.5 py-1 text-[10px] font-semibold text-fg-soft transition hover:border-border hover:text-fg disabled:opacity-40"
                :disabled="
                  busy ||
                  channelPosition(
                    mergedHideTopLevel.map((c) => c.id),
                    ch.id,
                  ) <= 1
                "
                title="Move channel up"
                @click.stop="
                  hideBucketAnchor
                    ? nudgeChannel(MERGED_HIDE_KEY, hideBucketAnchor, ch.id, -1)
                    : undefined
                "
              >
                ↑
              </button>
              <button
                type="button"
                class="rounded-md border border-border bg-scrim-2 px-1.5 py-1 text-[10px] font-semibold text-fg-soft transition hover:border-border hover:text-fg disabled:opacity-40"
                :disabled="
                  busy ||
                  channelPosition(
                    mergedHideTopLevel.map((c) => c.id),
                    ch.id,
                  ) >= mergedHideTopLevel.length
                "
                title="Move channel down"
                @click.stop="
                  hideBucketAnchor
                    ? nudgeChannel(MERGED_HIDE_KEY, hideBucketAnchor, ch.id, 1)
                    : undefined
                "
              >
                ↓
              </button>
              <input
                class="w-11 rounded-md border border-border bg-scrim-2 px-1.5 py-1 text-center text-[11px] font-semibold text-fg-soft outline-none"
                type="number"
                min="1"
                :max="mergedHideTopLevel.length"
                :value="
                  displayMergedDraft(
                    mergedHideTopLevel.map((c) => c.id),
                    ch.id,
                  )
                "
                :disabled="busy || !hideBucketAnchor"
                title="Set channel position"
                @click.stop
                @focus="
                  onMergedPosFocus(
                    mergedHideTopLevel.map((c) => c.id),
                    ch.id,
                  )
                "
                @input="onMergedPosInput(ch.id, $event)"
                @keydown.enter.stop="
                  onMergedPosCommit(
                    mergedHideTopLevel.map((c) => c.id),
                    ch.id,
                    $event,
                  )
                "
                @blur.stop="
                  onMergedPosCommit(
                    mergedHideTopLevel.map((c) => c.id),
                    ch.id,
                    $event,
                  )
                "
              />
            </div>
          </div>
        </div>
        <div
          v-if="canReorderChannels && chDrag && hideBucketAnchor"
          class="relative min-h-[12px] -my-0.5"
          :class="{
            'ring-1 ring-sky-400/60 rounded': showChLineEnd(
              MERGED_HIDE_KEY,
              mergedHideTopLevel.length,
            ),
          }"
          @dragover.prevent="
            onChAppendDragOver(
              MERGED_HIDE_KEY,
              mergedHideTopLevel.length,
              $event,
            )
          "
          @drop.prevent="onMergedHideAppendDrop($event)"
        />
      </div>
    </section>

    <p
      v-if="
        !canReorderChannels &&
        !canReorderCategories &&
        !realCategories.length &&
        !mergedHideTopLevel.length
      "
      class="text-sm text-fg-subtle"
    >
      No channels to show yet.
    </p>
  </div>
</template>
