<script setup lang="ts">
/** Mounted only when `ENABLE_NUMBERED_ICON_RENAME_TOOL` in `@/dev/echoDevTools` is true (dev). */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  ensureIconCatalogLoaded,
  getAllIconCatalogEntries,
  isNumberedVariantIconFilename,
  type IconCatalogEntry,
} from '@/assets/iconCatalog';

export interface QueuedIconRename {
  from: string;
  toBasename: string;
}

/** `file-12.svg` → `file`; `user avatar-3.svg` → `user avatar` */
function stemWithoutNumberSuffix(filename: string): string {
  return filename.replace(/\.svg$/i, '').replace(/-\d+$/i, '');
}

/** Spaces → hyphens, trim, collapse hyphens, non-alphanumeric removed, UPPERCASE (ABC-ABC). */
function toAbcAbc(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toUpperCase()
    .replace(/^-+|-+$/g, '');
}

function finalBasenameFrom(stem: string, extraRaw: string): string {
  const base = toAbcAbc(stem);
  const extra = toAbcAbc(extraRaw);
  if (!base) return extra;
  if (!extra) return base;
  return `${base}-${extra}`;
}

const minimized = ref(false);
const loading = ref(true);
const loadError = ref('');
const entries = ref<IconCatalogEntry[]>([]);
const index = ref(0);
/** User types only the suffix; spaces become `-` as they type. */
const extraSegment = ref('');
const formError = ref('');
const busy = ref(false);
const queue = ref<QueuedIconRename[]>([]);
const batchMessage = ref('');
const batchError = ref('');

const inputRef = ref<HTMLInputElement | null>(null);

const queuedFrom = computed(() => new Set(queue.value.map((q) => q.from)));

const visibleEntries = computed(() =>
  entries.value.filter((e) => !queuedFrom.value.has(e.id)),
);

const current = computed(() => visibleEntries.value[index.value] ?? null);

const previewBasename = computed(() => {
  const cur = current.value;
  if (!cur) return '';
  return finalBasenameFrom(stemWithoutNumberSuffix(cur.id), extraSegment.value);
});

function onExtraInput(e: Event) {
  const el = e.target as HTMLInputElement;
  extraSegment.value = el.value.replace(/\s+/g, '-');
}

const progressLabel = computed(() => {
  const n = visibleEntries.value.length;
  if (n === 0) return '0 / 0';
  return `${index.value + 1} / ${n}`;
});

async function loadList() {
  loading.value = true;
  loadError.value = '';
  try {
    await ensureIconCatalogLoaded();
    const all = getAllIconCatalogEntries();
    entries.value = all
      .filter((e) => isNumberedVariantIconFilename(e.id))
      .sort((a, b) =>
        a.id.localeCompare(b.id, undefined, { sensitivity: 'base' }),
      );
    index.value = 0;
  } catch {
    loadError.value = 'Could not load icon catalog.';
  } finally {
    loading.value = false;
  }
}

watch(index, () => {
  formError.value = '';
  extraSegment.value = '';
  void nextTick(() => inputRef.value?.focus());
});

watch(visibleEntries, (list) => {
  if (index.value >= list.length) {
    index.value = Math.max(0, list.length - 1);
  }
});

function goPrev() {
  if (index.value > 0) index.value -= 1;
}

function goNext() {
  if (index.value < visibleEntries.value.length - 1) index.value += 1;
}

function addToBatch() {
  const cur = current.value;
  if (!cur) return;
  const stem = stemWithoutNumberSuffix(cur.id);
  const finalName = finalBasenameFrom(stem, extraSegment.value);
  if (!finalName) {
    formError.value = 'Could not build a name from this file.';
    return;
  }
  const toFile = `${finalName}.svg`;
  if (queue.value.some((q) => q.toBasename === finalName)) {
    formError.value = 'That target name is already in the batch.';
    return;
  }
  if (entries.value.some((e) => e.id === toFile)) {
    formError.value = 'An icon with that filename already exists.';
    return;
  }
  formError.value = '';
  queue.value = [...queue.value, { from: cur.id, toBasename: finalName }];
  extraSegment.value = '';
  batchMessage.value = '';
  batchError.value = '';
  if (index.value >= visibleEntries.value.length) {
    index.value = Math.max(0, visibleEntries.value.length - 1);
  }
  void nextTick(() => inputRef.value?.focus());
}

function removeQueued(i: number) {
  queue.value = queue.value.filter((_, j) => j !== i);
  batchMessage.value = '';
  batchError.value = '';
}

async function applyBatch() {
  if (queue.value.length === 0) return;
  busy.value = true;
  batchError.value = '';
  batchMessage.value = '';
  try {
    const res = await fetch('/__dev/icon-rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ renames: queue.value }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      count?: number;
    };
    if (!res.ok || !data.ok) {
      batchError.value = data.error ?? `HTTP ${res.status}`;
      return;
    }
    queue.value = [];
    batchMessage.value = `Renamed ${data.count ?? 0} file(s). Stop and restart the Vite dev server (Ctrl+C, then dev again) so the module graph clears.`;
    void loadList();
  } catch {
    batchError.value = 'Network error — is the Vite dev server running?';
  } finally {
    busy.value = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (minimized.value) return;
  if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const t = e.target as HTMLElement;
    if (t.tagName !== 'INPUT') goPrev();
  }
  if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const t = e.target as HTMLElement;
    if (t.tagName !== 'INPUT') goNext();
  }
}

onMounted(() => {
  void loadList();
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="!minimized"
      class="icon-rename-dev fixed inset-0 z-[100000] flex items-center justify-center bg-scrim-2 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-label="Rename numbered icons"
    >
      <div
        class="relative max-h-[min(90vh,720px)] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-[var(--echo-modal-bg-muted)] p-6 text-[#ece8f0] shadow-2xl"
      >
        <button
          type="button"
          class="absolute right-4 top-4 rounded-lg px-2 py-1 text-xs text-fg-subtle hover:bg-glass-hover hover:text-fg-soft"
          @click="minimized = true"
        >
          Minimize
        </button>

        <h2 class="pr-16 text-lg font-semibold tracking-tight">
          Numbered icons
        </h2>
        <p class="mt-1 text-sm text-fg-soft">
          Base name is the file name without
          <code class="rounded bg-glass-2 px-1 text-[11px]">-N</code>
          , turned into
          <code class="rounded bg-glass-2 px-1 text-[11px]">ABC-ABC</code>
          . Type only the extra part; spaces become hyphens. Queue all, apply
          once, then restart Vite.
        </p>

        <div v-if="loading" class="mt-8 text-center text-sm text-fg-subtle">
          Loading catalog…
        </div>
        <div
          v-else-if="loadError"
          class="mt-8 text-center text-sm text-red-300"
        >
          {{ loadError }}
        </div>
        <div
          v-else-if="entries.length === 0 && queue.length === 0"
          class="mt-8 text-center text-sm text-emerald-300/90"
        >
          No numbered-variant icons left.
        </div>
        <template v-else>
          <div
            v-if="batchMessage"
            class="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/95"
          >
            {{ batchMessage }}
          </div>
          <div
            v-if="batchError"
            class="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
          >
            {{ batchError }}
          </div>

          <template v-if="visibleEntries.length > 0">
            <p
              class="mt-4 text-center text-xs uppercase tracking-wider text-fg-subtle"
            >
              {{ progressLabel }}
            </p>

            <div
              class="mt-4 flex min-h-[140px] items-center justify-center rounded-xl border border-border bg-scrim-1 p-6"
            >
              <img
                v-if="current"
                :src="current.url"
                :alt="current.label"
                class="max-h-28 max-w-full object-contain opacity-95"
              />
            </div>

            <p
              class="mt-3 break-all text-center font-mono text-sm text-violet-200/90"
              :title="current?.id"
            >
              {{ current?.id }}
            </p>

            <p class="mt-5 text-xs text-fg-subtle">
              Base
              <span class="font-mono text-violet-200/90">{{
                current ? toAbcAbc(stemWithoutNumberSuffix(current.id)) : ''
              }}</span>
            </p>
            <label class="mt-2 block text-xs font-medium text-fg-subtle"
              >Extra (optional if base alone is enough)</label
            >
            <input
              ref="inputRef"
              :value="extraSegment"
              type="text"
              autocomplete="off"
              placeholder="e.g. voice tab"
              class="mt-1.5 w-full rounded-xl border border-border bg-scrim-2 px-3 py-2.5 text-sm text-foreground outline-none ring-violet-500/40 placeholder:text-fg-subtle focus:border-violet-500/50 focus:ring-2"
              @input="onExtraInput"
              @keydown.enter.prevent="addToBatch"
            />
            <p class="mt-2 font-mono text-sm text-fg-soft">
              → {{ previewBasename }}.svg
            </p>
            <p v-if="formError" class="mt-2 text-sm text-red-300">
              {{ formError }}
            </p>

            <div class="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-xl border border-border bg-glass-1 px-4 py-2 text-sm hover:bg-glass-hover disabled:opacity-40"
                :disabled="index === 0 || busy"
                @click="goPrev"
              >
                Previous
              </button>
              <button
                type="button"
                class="rounded-xl border border-border bg-glass-1 px-4 py-2 text-sm hover:bg-glass-hover disabled:opacity-40"
                :disabled="index >= visibleEntries.length - 1 || busy"
                @click="goNext"
              >
                Skip
              </button>
              <button
                type="button"
                class="ml-auto rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40"
                :disabled="busy"
                @click="addToBatch"
              >
                Add to batch
              </button>
            </div>
            <p class="mt-4 text-center text-[11px] text-fg-subtle">
              ← → when not typing: prev/next · Enter: add to batch
            </p>
          </template>
          <p v-else class="mt-6 text-center text-sm text-fg-subtle">
            All icons queued or skipped. Apply the batch below or restart later.
          </p>

          <div v-if="queue.length > 0" class="mt-6 border-t border-border pt-5">
            <h3 class="text-sm font-medium text-fg-soft">
              Batch ({{ queue.length }})
            </h3>
            <ul
              class="mt-2 max-h-36 space-y-1.5 overflow-y-auto text-xs font-mono text-fg-soft"
            >
              <li
                v-for="(q, i) in queue"
                :key="`${q.from}-${i}`"
                class="flex items-start justify-between gap-2 rounded-lg bg-scrim-1 px-2 py-1.5"
              >
                <span class="min-w-0 break-all"
                  >{{ q.from }} → {{ q.toBasename }}.svg</span
                >
                <button
                  type="button"
                  class="shrink-0 text-fg-subtle hover:text-red-300"
                  :disabled="busy"
                  @click="removeQueued(i)"
                >
                  ×
                </button>
              </li>
            </ul>
            <button
              type="button"
              class="mt-4 w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
              :disabled="busy"
              @click="applyBatch"
            >
              {{
                busy ? 'Applying…' : `Apply ${queue.length} rename(s) on disk`
              }}
            </button>
          </div>
        </template>
      </div>
    </div>

    <button
      v-else
      type="button"
      class="fixed bottom-4 right-4 z-[100000] rounded-full border border-violet-500/40 bg-[var(--echo-dev-pill-bg)] px-4 py-2.5 text-sm font-medium text-violet-100 shadow-lg hover:bg-[var(--echo-dev-pill-bg-hover)]"
      @click="minimized = false"
    >
      Icons {{ progressLabel
      }}<span v-if="queue.length"> · {{ queue.length }} queued</span>
    </button>
  </Teleport>
</template>
