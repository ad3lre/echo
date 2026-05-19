<script setup lang="ts">
import { ref, watch, nextTick, toRef } from 'vue';
import { useFocusTrap } from '@/composables/useFocusTrap';

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: string | HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          theme?: string;
          'error-callback'?: () => void;
        },
      ) => string;
      remove: (id: string) => void;
    };
  }
}

const props = defineProps<{
  modelValue: boolean;
  siteKey: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [boolean];
  verified: [token: string];
}>();

const modalRef = ref<HTMLElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);
const widgetId = ref<string | null>(null);
const loadErr = ref('');

useFocusTrap(modalRef, toRef(props, 'modelValue'));

let scriptPromise: Promise<void> | null = null;

function ensureTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined')
    return Promise.reject(new Error('no window'));
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector('script[data-echo-turnstile]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('load')), {
          once: true,
        });
        return;
      }
      const s = document.createElement('script');
      s.src =
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.setAttribute('data-echo-turnstile', '1');
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('script'));
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

function removeWidget() {
  const id = widgetId.value;
  widgetId.value = null;
  if (id && window.turnstile) {
    try {
      window.turnstile.remove(id);
    } catch {
      /* ignore */
    }
  }
  if (containerRef.value) containerRef.value.innerHTML = '';
}

watch(
  () => [props.modelValue, props.siteKey] as const,
  async ([open, key]) => {
    if (!open) {
      removeWidget();
      loadErr.value = '';
      return;
    }
    if (!key.trim()) {
      loadErr.value =
        'Verification is not configured. Try again later or create an account.';
      return;
    }
    loadErr.value = '';
    await nextTick();
    try {
      await ensureTurnstileScript();
      const el = containerRef.value;
      if (!el || !window.turnstile) return;
      removeWidget();
      const id = window.turnstile.render(el, {
        sitekey: key,
        theme: 'dark',
        callback: (token: string) => {
          emit('verified', token);
        },
        'error-callback': () => {
          loadErr.value = 'Verification widget error. Close and try again.';
        },
      });
      widgetId.value = id;
    } catch {
      loadErr.value =
        'Could not load verification. Try again or create an account.';
    }
  },
);
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-[165] flex items-center justify-center bg-overlay-heavy px-4"
    @click.self="emit('update:modelValue', false)"
  >
    <div
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      class="w-full max-w-md rounded-2xl border border-border bg-[var(--echo-modal-bg)] p-6 text-white shadow-xl"
    >
      <h2 class="text-lg font-semibold">Quick verification</h2>
      <p class="mt-1 text-sm text-fg-soft">
        We use this to keep guest access fair. Complete the check, then
        continue.
      </p>
      <div
        ref="containerRef"
        class="mt-4 flex min-h-[65px] items-center justify-center"
      />
      <p v-if="loadErr" class="mt-3 text-sm text-amber-200/90">{{ loadErr }}</p>
      <div class="mt-5 flex justify-end">
        <button
          type="button"
          class="rounded-lg px-3 py-2 text-sm text-fg-soft hover:bg-glass-hover"
          @click="emit('update:modelValue', false)"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>
