<script setup lang="ts">
import { echoT } from '@/i18n';
import { ref, computed, watch, toRef } from 'vue';
import { useFocusTrap } from '@/features/layout/useFocusTrap';
import { useAutofocusOnOpen } from '@/features/layout/useAutofocusOnOpen';
import { isTrustedMediaUrl } from '@/features/layout/display/safeImageUrl';
import { icons } from '@/assets/icons';

const props = defineProps<{
  open: boolean;
  /** Short description of what is being forwarded (e.g. author + snippet). */
  sourceSummary: string;
  destinations: {
    dms: {
      channelId: string;
      label: string;
      avatarUrl?: string;
      isGroup?: boolean;
    }[];
    servers: {
      id: string;
      name: string;
      textChannels: { id: string; name: string }[];
    }[];
  };
}>();

const emit = defineEmits<{
  close: [];
  select: [channelId: string];
}>();

const q = ref('');
const expandedServerIds = ref<Set<string>>(new Set());
const modalRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const focusedIndex = ref(-1);
const sentState = ref(false);

useFocusTrap(modalRef, toRef(props, 'open'));

watch(
  () => props.open,
  (v) => {
    if (v) {
      q.value = '';
      expandedServerIds.value = new Set();
      focusedIndex.value = -1;
      sentState.value = false;
    }
  },
);

/** While searching, expand every server so channel hits are not hidden behind collapsed rows. */
watch([() => props.open, q], () => {
  if (!props.open) return;
  const query = q.value.trim();
  if (!query) {
    expandedServerIds.value = new Set();
    return;
  }
  expandedServerIds.value = new Set(
    props.destinations.servers.map((s) => s.id),
  );
});

const hasAnyDestinations = computed(
  () =>
    props.destinations.dms.length > 0 ||
    props.destinations.servers.some((s) => s.textChannels.length > 0),
);

useAutofocusOnOpen(toRef(props, 'open'), searchInputRef, {
  when: hasAnyDestinations,
});

const filtered = computed(() => {
  const qv = q.value.trim().toLowerCase();
  const dms = !qv
    ? props.destinations.dms
    : props.destinations.dms.filter((d) => d.label.toLowerCase().includes(qv));

  const servers = props.destinations.servers
    .map((s) => {
      const nameMatch = s.name.toLowerCase().includes(qv);
      const textChannels = !qv
        ? s.textChannels
        : s.textChannels.filter(
            (c) => c.name.toLowerCase().includes(qv) || nameMatch,
          );
      return { ...s, textChannels };
    })
    .filter((s) => s.textChannels.length > 0);

  return { dms, servers };
});

/** Flat list of selectable items for keyboard navigation. */
const flatItems = computed(() => {
  const items: {
    channelId: string;
    type: 'dm' | 'channel';
    serverId?: string;
  }[] = [];
  for (const d of filtered.value.dms) {
    items.push({ channelId: d.channelId, type: 'dm' });
  }
  for (const s of filtered.value.servers) {
    if (expandedServerIds.value.has(s.id)) {
      for (const ch of s.textChannels) {
        items.push({ channelId: ch.id, type: 'channel', serverId: s.id });
      }
    }
  }
  return items;
});

function toggleServer(id: string) {
  const next = new Set(expandedServerIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedServerIds.value = next;
}

function pick(channelId: string) {
  sentState.value = true;
  setTimeout(() => {
    emit('select', channelId);
  }, 320);
}

function onBackdropClick() {
  emit('close');
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    focusedIndex.value = Math.min(
      focusedIndex.value + 1,
      flatItems.value.length - 1,
    );
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    focusedIndex.value = Math.max(focusedIndex.value - 1, 0);
    return;
  }
  if (e.key === 'Enter' && focusedIndex.value >= 0) {
    e.preventDefault();
    const item = flatItems.value[focusedIndex.value];
    if (item) pick(item.channelId);
  }
}

function hasRealAvatar(url: string | undefined): boolean {
  return !!url && isTrustedMediaUrl(url);
}

/** Initial letter for fallback avatars */
function initial(label: string): string {
  return (label.trim()[0] ?? '?').toUpperCase();
}

/** HSL hue from label string for colored initial circles */
function labelHue(label: string): number {
  let h = 0;
  for (let i = 0; i < label.length; i++)
    h = (h * 31 + label.charCodeAt(i)) & 0xffff;
  return h % 360;
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fwd-overlay">
      <div
        v-if="open"
        class="fixed inset-0 z-[160] flex items-center justify-center px-4 py-6 bg-overlay-dim backdrop-blur-sm"
        @click.self="onBackdropClick"
      >
        <Transition name="fwd-card">
          <div
            v-if="open"
            ref="modalRef"
            role="dialog"
            aria-modal="true"
            aria-labelledby="forward-modal-title"
            class="fwd-card relative flex w-full max-w-[480px] max-h-[min(36rem,90vh)] flex-col overflow-hidden rounded-3xl text-foreground"
            @click.stop
            @keydown="onKeydown"
          >
            <!-- sent confirmation overlay -->
            <Transition name="fwd-sent">
              <div
                v-if="sentState"
                class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-3xl bg-overlay-heavy backdrop-blur-sm"
              >
                <div
                  class="fwd-sent-ring flex h-16 w-16 items-center justify-center rounded-full"
                >
                  <svg
                    class="fwd-sent-check h-8 w-8"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <span class="text-sm font-medium text-fg-soft">{{
                  echoT('b38.fwd.forwarded')
                }}</span>
              </div>
            </Transition>

            <!-- top gradient accent -->
            <div
              class="fwd-top-accent pointer-events-none absolute inset-x-0 top-0 h-28 rounded-t-3xl"
              aria-hidden="true"
            />

            <!-- close button -->
            <button
              type="button"
              class="fwd-close-btn chat-focus-ring absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-glass-hover hover:text-foreground"
              :aria-label="echoT('b38.fwd.close')"
              @click="emit('close')"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>

            <!-- header -->
            <div class="relative border-b border-border px-5 pb-4 pt-5 pr-12">
              <h2
                id="forward-modal-title"
                class="text-lg font-bold leading-tight tracking-tight text-foreground"
              >
                {{ echoT('b38.fwd.title') }}
              </h2>
              <p class="mt-0.5 text-sm text-fg-subtle">
                {{ echoT('b38.fwd.subtitle') }}
              </p>

              <!-- preview pill -->
              <div
                class="mt-3.5 flex items-start gap-2.5 rounded-xl bg-glass-2 px-3 py-2.5"
              >
                <svg
                  class="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="9 14 4 9 9 4" />
                  <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                </svg>
                <div class="min-w-0 flex-1">
                  <span
                    class="block text-[10px] font-semibold uppercase tracking-widest text-fg-subtle"
                    >{{ echoT('b38.fwd.preview') }}</span
                  >
                  <p
                    class="mt-0.5 line-clamp-2 text-sm leading-snug text-fg-soft"
                  >
                    {{ sourceSummary || '—' }}
                  </p>
                </div>
              </div>

              <!-- search input -->
              <div class="relative mt-3.5">
                <img
                  :src="icons.search"
                  alt=""
                  class="fwd-search-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  ref="searchInputRef"
                  v-model="q"
                  type="search"
                  :placeholder="echoT('b38.fwd.searchPlaceholder')"
                  class="w-full rounded-xl border border-border bg-glass-2 py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-fg-subtle outline-none transition-colors focus:border-border focus:bg-glass-2"
                  :aria-label="echoT('b38.fwd.searchLabel')"
                  autocomplete="off"
                />
              </div>
            </div>

            <!-- destination list -->
            <div
              class="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2"
              v-scrollbar-on-scroll
            >
              <!-- no destinations at all -->
              <div
                v-if="!hasAnyDestinations"
                class="flex flex-col items-center gap-2 px-4 py-10 text-center"
              >
                <svg
                  class="h-8 w-8 text-fg-subtle"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path
                    d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                  />
                </svg>
                <p class="text-sm leading-relaxed text-fg-subtle">
                  {{ echoT('b38.fwd.noDest1') }}<br />{{
                    echoT('b38.fwd.noDest2')
                  }}
                </p>
              </div>

              <!-- empty search -->
              <div
                v-else-if="
                  filtered.dms.length === 0 && filtered.servers.length === 0
                "
                class="flex flex-col items-center gap-2 px-4 py-10 text-center"
              >
                <svg
                  class="h-7 w-7 text-fg-subtle"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <p class="text-sm text-fg-subtle">
                  <i18n-t keypath="b38.fwd.noResults" scope="global">
                    <template #query
                      ><span class="text-fg-soft">{{
                        q.trim()
                      }}</span></template
                    >
                  </i18n-t>
                </p>
              </div>

              <template v-else>
                <!-- DMs section -->
                <template v-if="filtered.dms.length">
                  <div
                    class="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle"
                  >
                    {{ echoT('b38.fwd.dms') }}
                  </div>
                  <button
                    v-for="(d, idx) in filtered.dms"
                    :key="d.channelId"
                    type="button"
                    class="fwd-row chat-focus-ring mb-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-glass-hover"
                    :class="{ 'bg-glass-2': focusedIndex === idx }"
                    @click="pick(d.channelId)"
                    @mouseenter="focusedIndex = idx"
                  >
                    <!-- avatar -->
                    <div class="relative h-8 w-8 shrink-0">
                      <img
                        v-if="hasRealAvatar(d.avatarUrl)"
                        :src="d.avatarUrl"
                        :alt="d.label"
                        class="h-8 w-8 rounded-full object-cover"
                      />
                      <!-- group DM or no avatar: colored initial circle -->
                      <div
                        v-else-if="d.isGroup"
                        class="flex h-8 w-8 items-center justify-center rounded-full bg-glass-2"
                      >
                        <img
                          :src="icons.community"
                          alt=""
                          class="fwd-row-icon h-4 w-4"
                          aria-hidden="true"
                        />
                      </div>
                      <div
                        v-else
                        class="fwd-avatar-initial flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                        :style="`--_hue: ${labelHue(d.label)}`"
                      >
                        {{ initial(d.label) }}
                      </div>
                    </div>
                    <span
                      class="min-w-0 truncate text-sm font-medium text-fg"
                      >{{ d.label }}</span
                    >
                  </button>
                </template>

                <!-- Servers section -->
                <template v-if="filtered.servers.length">
                  <div
                    class="mt-2 px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle"
                  >
                    {{ echoT('b38.fwd.servers') }}
                  </div>
                  <div v-for="s in filtered.servers" :key="s.id" class="mb-0.5">
                    <button
                      type="button"
                      class="fwd-row chat-focus-ring flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-glass-hover"
                      @click="toggleServer(s.id)"
                    >
                      <div class="flex items-center gap-3 min-w-0">
                        <div
                          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-glass-2 text-xs font-bold text-fg-soft"
                        >
                          {{ initial(s.name) }}
                        </div>
                        <span
                          class="min-w-0 truncate text-sm font-semibold text-fg-soft"
                          >{{ s.name }}</span
                        >
                      </div>
                      <svg
                        class="h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform duration-150"
                        :class="{ 'rotate-90': expandedServerIds.has(s.id) }"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </button>
                    <div
                      v-if="expandedServerIds.has(s.id)"
                      class="ml-2 mt-0.5 border-l border-border pl-3"
                    >
                      <button
                        v-for="ch in s.textChannels"
                        :key="ch.id"
                        type="button"
                        class="fwd-row chat-focus-ring mb-0.5 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-glass-hover"
                        @click="pick(ch.id)"
                      >
                        <div
                          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-glass-2 text-sm font-bold text-fg-subtle"
                        >
                          #
                        </div>
                        <div class="min-w-0 flex flex-col gap-0.5">
                          <span class="truncate text-sm text-fg-soft">{{
                            ch.name
                          }}</span>
                          <span
                            class="truncate text-[11px] leading-tight text-fg-subtle"
                            >{{ s.name }}</span
                          >
                        </div>
                      </button>
                    </div>
                  </div>
                </template>
              </template>
            </div>

            <!-- footer hint -->
            <div class="border-t border-border px-5 py-3 text-center">
              <span class="text-[11px] text-fg-subtle">{{
                echoT('b38.fwd.escHint')
              }}</span>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss" src="./styles/ForwardMessageModal.scss"></style>
