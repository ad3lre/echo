<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { fetchPublicPaperByToken } from '@/features/paper/api/paper';
import { usePaperEditorState } from '@/features/paper/composables/usePaperEditorState';
import PaperPageCanvas from '@/features/paper/components/PaperPageCanvas.vue';
import { readPaperDefaultFont } from '@/features/paper/editor/paperDocumentAttributes';
import {
  derivePaperSurfaceStyle,
  readPaperPageColors,
} from '@/features/paper/editor/paperPageAppearance';
import { paperFontFamilyCss } from '@/features/paper/editor/paperTypography';
import { preloadPaperFontCatalog } from '@/features/paper/editor/paperFontLoader';
import { useAuthSessionStore } from '@/stores/authSession';
import 'katex/dist/katex.min.css';
import '@/features/paper/paperTheme.css';

const props = defineProps<{
  token: string;
}>();

const authSession = useAuthSessionStore();

const loading = ref(true);
const error = ref<string | null>(null);
const notFound = ref(false);
const channelName = ref('Paper');
const contentJson = ref<Record<string, unknown> | null>(null);
const documentLoaded = computed(
  () => !loading.value && contentJson.value != null,
);

const editorMode = computed(() => 'viewer' as const);
const editable = computed(() => false);

const { editor } = usePaperEditorState({
  mode: editorMode,
  editable,
  documentLoaded,
  contentJson,
});

const paperPageFontFamily = computed(() =>
  paperFontFamilyCss(readPaperDefaultFont(contentJson.value)),
);

const pageSurfaceStyle = computed(() => {
  const { light } = readPaperPageColors(contentJson.value);
  if (!light) return {};
  return derivePaperSurfaceStyle(light);
});

const isLoggedIn = computed(() => authSession.isAuthenticated);

function openInEcho() {
  const base = import.meta.env.BASE_URL || '/';
  window.location.href = base;
}

onMounted(async () => {
  preloadPaperFontCatalog();
  loading.value = true;
  error.value = null;
  notFound.value = false;
  try {
    const doc = await fetchPublicPaperByToken(props.token);
    channelName.value = doc.channelName;
    contentJson.value = doc.contentJson;
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : 'This shared paper is unavailable';
    error.value = msg;
    notFound.value =
      msg.toLowerCase().includes('not found') ||
      msg.toLowerCase().includes('404');
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div
    class="paper-root flex min-h-screen flex-col paper-workspace"
    data-paper-appearance="light"
  >
    <header
      class="flex items-center gap-3 border-b border-border px-4 py-3"
      style="background: var(--paper-workspace-bg)"
    >
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-base font-semibold text-fg">
          {{ channelName }}
        </h1>
        <p class="text-[11px] text-fg-subtle">Public view — read only</p>
      </div>
    </header>
    <main class="flex-1 overflow-y-auto">
      <div
        v-if="error"
        class="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center"
      >
        <p class="text-sm font-medium text-fg">
          {{ notFound ? 'Paper not found' : 'Could not open this paper' }}
        </p>
        <p class="text-xs text-fg-subtle">{{ error }}</p>
        <p v-if="notFound" class="text-xs text-fg-subtle">
          The link may have expired or sharing was turned off.
        </p>
      </div>
      <PaperPageCanvas
        v-else
        :editor="editor"
        :loading="loading"
        :document-font-family="paperPageFontFamily"
        :page-surface-style="pageSurfaceStyle"
      />
    </main>
    <footer
      class="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-fg-subtle"
    >
      <span>Shared via Echo</span>
      <button
        v-if="isLoggedIn"
        type="button"
        class="rounded-lg border border-border px-3 py-1.5 text-fg hover:bg-glass-hover"
        @click="openInEcho"
      >
        Open in Echo
      </button>
    </footer>
  </div>
</template>
