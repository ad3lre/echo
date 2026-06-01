<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { icons } from '@/assets/icons';
import { useFocusTrap } from '@/composables/useFocusTrap';
import {
  dispatchAppDialogResponse,
  subscribeAppDialogs,
  type AppDialogRequest,
} from '@/utils/appDialogs';

const active = ref<AppDialogRequest | null>(null);
const queue = ref<AppDialogRequest[]>([]);
/**
 * Ignore the first backdrop click right after open. Dialog requests are deferred
 * two animation frames ({@link deferDialogDispatch}) so the opening click does not
 * land on the backdrop; this flag covers the same window without blocking dismiss
 * for an arbitrary 500ms.
 */
const ignoreBackdropDismiss = ref(false);

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

function armBackdropDismissGuard() {
  ignoreBackdropDismiss.value = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ignoreBackdropDismiss.value = false;
    });
  });
}

function setActive(next: AppDialogRequest | null) {
  active.value = next;
  if (next) {
    armBackdropDismissGuard();
  }
}

function onBackdropClick() {
  if (ignoreBackdropDismiss.value) return;
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

function onDocumentEscape(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !active.value) return;
  e.preventDefault();
  cancel();
}

watch(
  () => active.value,
  (next, prev) => {
    if (next && !prev) {
      document.addEventListener('keydown', onDocumentEscape, true);
      return;
    }
    if (!next && prev) {
      document.removeEventListener('keydown', onDocumentEscape, true);
    }
  },
);

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

const twoChoiceUsesCardLayout = computed(
  () => active.value?.kind === 'twoChoice' && active.value.layout === 'choices',
);

const modalWidthClass = computed(() =>
  twoChoiceUsesCardLayout.value ? 'max-w-xl' : 'max-w-md',
);

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
  document.removeEventListener('keydown', onDocumentEscape, true);
  unsub?.();
  unsub = null;
});
</script>

<template>
  <div
    v-if="active"
    class="fixed inset-0 z-[400] flex items-center justify-center modal-overlay-bg px-4"
    @click.self="onBackdropClick"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      class="real-glass-modal relative w-full rounded-xl p-6 text-foreground bg-transparent"
      :class="modalWidthClass"
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
        <div v-if="twoChoiceUsesCardLayout" class="flex items-start gap-3">
          <span
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 ring-1 ring-indigo-500/25"
            aria-hidden="true"
          >
            <img :src="icons.folder" alt="" class="h-5 w-5 opacity-90" />
          </span>
          <h2
            :id="titleId"
            class="min-w-0 flex-1 text-lg font-bold leading-tight text-foreground"
          >
            {{ active.title }}
          </h2>
        </div>
        <h2
          v-else
          :id="titleId"
          class="text-lg font-bold leading-tight text-foreground"
        >
          {{ active.title }}
        </h2>
        <p
          v-if="active.message"
          class="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted"
        >
          {{ active.message }}
        </p>

        <div v-if="active.kind === 'prompt'" class="mt-4">
          <input
            v-model="promptValue"
            type="text"
            class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none transition-[box-shadow,border-color] focus-visible:border-border focus-visible:ring-2 focus-visible:ring-accent/30"
            :placeholder="active.placeholder ?? ''"
            @keydown.enter.prevent="confirm"
          />
        </div>

        <div v-if="active.kind === 'twoChoice' && twoChoiceUsesCardLayout">
          <div class="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              class="flex min-w-0 flex-col items-start gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:bg-glass-hover"
              @click="pickTwoChoice('primary')"
            >
              <span class="flex items-center gap-2">
                <img
                  v-if="active.primaryIconSrc"
                  :src="active.primaryIconSrc"
                  alt=""
                  class="h-5 w-5 shrink-0 opacity-85"
                />
                <span class="text-sm font-semibold text-foreground">{{
                  active.primaryLabel
                }}</span>
              </span>
              <span
                v-if="active.primaryDescription"
                class="text-xs leading-relaxed text-muted"
                >{{ active.primaryDescription }}</span
              >
            </button>
            <button
              type="button"
              class="flex min-w-0 flex-col items-start gap-2 rounded-xl border border-indigo-500/35 bg-indigo-500/10 px-4 py-3 text-left transition-colors hover:bg-indigo-500/20"
              @click="pickTwoChoice('secondary')"
            >
              <span class="flex items-center gap-2">
                <img
                  v-if="active.secondaryIconSrc"
                  :src="active.secondaryIconSrc"
                  alt=""
                  class="h-5 w-5 shrink-0 opacity-85"
                />
                <span class="text-sm font-semibold text-foreground">{{
                  active.secondaryLabel
                }}</span>
              </span>
              <span
                v-if="active.secondaryDescription"
                class="text-xs leading-relaxed text-muted"
                >{{ active.secondaryDescription }}</span
              >
            </button>
          </div>
          <div class="mt-5 flex justify-end border-t border-border pt-4">
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm font-semibold text-muted transition-colors hover:bg-glass-hover hover:text-foreground"
              @click="cancel"
            >
              {{ cancelLabel }}
            </button>
          </div>
        </div>
        <div
          v-else-if="active.kind === 'twoChoice'"
          class="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4"
        >
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-semibold text-muted transition-colors hover:bg-glass-hover hover:text-foreground"
            @click="cancel"
          >
            {{ cancelLabel }}
          </button>
          <button
            type="button"
            class="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-glass-hover"
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
            class="rounded-lg px-4 py-2 text-sm font-semibold text-muted transition-colors hover:bg-glass-hover hover:text-foreground"
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
