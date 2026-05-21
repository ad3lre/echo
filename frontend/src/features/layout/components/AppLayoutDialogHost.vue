<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';
import {
  dispatchAppDialogResponse,
  subscribeAppDialogs,
  type AppDialogRequest,
} from '@/utils/appDialogs';

const active = ref<AppDialogRequest | null>(null);
const queue = ref<AppDialogRequest[]>([]);
/** Ignore backdrop dismiss until after the opening pointer/click gesture finishes. */
const backdropDismissReadyAt = ref(0);

const modalRef = ref<HTMLElement | null>(null);
const isOpen = computed(() => !!active.value);
useFocusTrap(modalRef, isOpen);

const promptValue = ref('');

watch(
  () => active.value,
  (next) => {
    if (next?.kind === 'prompt') {
      promptValue.value = next.initialValue ?? '';
    } else {
      promptValue.value = '';
    }
  },
  { immediate: true },
);

function setActive(next: AppDialogRequest | null) {
  active.value = next;
  if (next) {
    backdropDismissReadyAt.value = performance.now() + 500;
  }
}

function onBackdropClick() {
  if (performance.now() < backdropDismissReadyAt.value) return;
  cancel();
}

function maybeDequeue() {
  if (active.value) return;
  const next = queue.value.shift() ?? null;
  if (next) setActive(next);
}

function cancel() {
  const cur = active.value;
  if (!cur) return;
  if (cur.kind === 'alert') {
    dispatchAppDialogResponse({ id: cur.id, kind: 'alert', ok: true });
  } else if (cur.kind === 'confirm') {
    dispatchAppDialogResponse({ id: cur.id, kind: 'confirm', ok: false });
  } else if (cur.kind === 'twoChoice') {
    dispatchAppDialogResponse({
      id: cur.id,
      kind: 'twoChoice',
      choice: null,
    });
  } else {
    dispatchAppDialogResponse({ id: cur.id, kind: 'prompt', value: null });
  }
  setActive(null);
  maybeDequeue();
}

function confirm() {
  const cur = active.value;
  if (!cur || cur.kind === 'twoChoice') return;
  if (cur.kind === 'alert') {
    dispatchAppDialogResponse({ id: cur.id, kind: 'alert', ok: true });
  } else if (cur.kind === 'confirm') {
    dispatchAppDialogResponse({ id: cur.id, kind: 'confirm', ok: true });
  } else {
    dispatchAppDialogResponse({
      id: cur.id,
      kind: 'prompt',
      value: promptValue.value,
    });
  }
  setActive(null);
  maybeDequeue();
}

function pickTwoChoice(which: 'primary' | 'secondary') {
  const cur = active.value;
  if (!cur || cur.kind !== 'twoChoice') return;
  dispatchAppDialogResponse({
    id: cur.id,
    kind: 'twoChoice',
    choice: which,
  });
  setActive(null);
  maybeDequeue();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    cancel();
  }
}

const titleId = computed(() => (active.value ? `dlg_${active.value.id}` : ''));

const confirmLabel = computed(() => {
  const cur = active.value;
  if (!cur || cur.kind === 'twoChoice') return 'OK';
  if (
    (cur.kind === 'alert' || cur.kind === 'confirm' || cur.kind === 'prompt') &&
    cur.confirmLabel?.trim()
  ) {
    return cur.confirmLabel.trim();
  }
  if (cur.kind === 'confirm') return 'Confirm';
  return 'OK';
});

const cancelLabel = computed(() => {
  const cur = active.value;
  if (!cur) return 'Cancel';
  if (cur.kind === 'twoChoice') {
    return cur.dismissLabel?.trim() || 'Cancel';
  }
  if (
    (cur.kind === 'confirm' || cur.kind === 'prompt') &&
    cur.cancelLabel?.trim()
  ) {
    return cur.cancelLabel.trim();
  }
  return 'Cancel';
});

const modalDanger = computed(() => {
  const cur = active.value;
  return (
    !!cur &&
    (cur.kind === 'alert' ||
      cur.kind === 'confirm' ||
      cur.kind === 'prompt' ||
      cur.kind === 'twoChoice') &&
    !!cur.danger
  );
});

const confirmClass = computed(() => {
  return modalDanger.value
    ? 'bg-rose-600/85 hover:bg-rose-600'
    : 'bg-indigo-600/85 hover:bg-indigo-600';
});

let unsub: null | (() => void) = null;

onMounted(() => {
  unsub = subscribeAppDialogs((req) => {
    if (!active.value) {
      setActive(req);
      return;
    }
    queue.value.push(req);
  });
});

onUnmounted(() => {
  unsub?.();
  unsub = null;
});
</script>

<template>
  <div
    v-if="active"
    class="fixed inset-0 z-[400] flex items-center justify-center modal-overlay-bg px-4"
    @click.self="onBackdropClick"
    @keydown="onKeydown"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      class="real-glass-modal relative w-full max-w-md rounded-xl p-6 text-foreground bg-transparent"
    >
      <div
        class="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-xl bg-gradient-to-b opacity-90"
        :class="
          modalDanger
            ? 'from-rose-500/25 to-transparent'
            : 'from-indigo-500/20 to-transparent'
        "
      />
      <div class="relative">
        <h2 :id="titleId" class="text-lg font-bold leading-tight text-white">
          {{ active.title }}
        </h2>
        <p
          v-if="active.message"
          class="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-fg-soft"
        >
          {{ active.message }}
        </p>

        <div v-if="active.kind === 'prompt'" class="mt-4">
          <input
            v-model="promptValue"
            type="text"
            class="w-full rounded-lg border border-border bg-glass-2 px-3 py-2 text-sm text-white outline-none focus:border-border"
            :placeholder="active.placeholder ?? ''"
            @keydown.enter.prevent="confirm"
          />
        </div>

        <div
          v-if="active.kind === 'twoChoice'"
          class="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4"
        >
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-white"
            @click="cancel"
          >
            {{ cancelLabel }}
          </button>
          <button
            type="button"
            class="rounded-lg border border-border bg-glass-2 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-glass-hover"
            @click="pickTwoChoice('primary')"
          >
            {{ active.primaryLabel }}
          </button>
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors"
            :class="confirmClass"
            @click="pickTwoChoice('secondary')"
          >
            {{ active.secondaryLabel }}
          </button>
        </div>
        <div
          v-else
          class="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4"
        >
          <button
            v-if="active.kind !== 'alert'"
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-white"
            @click="cancel"
          >
            {{ cancelLabel }}
          </button>
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors"
            :class="confirmClass"
            @click="confirm"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.modal-overlay-bg {
  background-color: var(--vue-auto-016);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.real-glass-modal {
  box-shadow: 0px 4px 60px var(--vue-auto-013);
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background-color: var(--vue-auto-015);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
  }
}
</style>
