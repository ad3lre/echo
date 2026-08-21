<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { fetchPublicPaperByToken } from '@/features/paper/paperApi';
import { usePaperEditorState } from '@/features/paper/composables/usePaperEditorState';
import { usePaperSourceViewMode } from '@/features/paper/composables/usePaperSourceViewMode';
import { usePaperRawMarkdownBridge } from '@/features/paper/composables/usePaperRawMarkdownBridge';
import { setPaperMarkdownRenderInline } from '@/features/paper/editor/setPaperMarkdownRenderInline';
import { usePaperSourceViewKeybind } from '@/features/paper/composables/usePaperSourceViewKeybind';
import PaperPageCanvas from '@/features/paper/components/PaperPageCanvas.vue';
import { readPaperDefaultFont } from '@/features/paper/editor/paperDocumentAttributes';
import {
  nextPaperAppearance,
  readPaperPageColors,
  resolvePaperPageSurfaceStyle,
} from '@/features/paper/editor/paperPageAppearance';
import {
  detectGlobalAppearance,
  type PaperAppearanceMode,
} from '@/features/paper/composables/usePaperAppearance';
import { paperFontFamilyCss } from '@/features/paper/editor/paperTypography';
import { preloadPaperFontCatalog } from '@/features/paper/editor/paperFontLoader';
import { useAuthSessionStore } from '@/features/auth/authSession';
import 'katex/dist/katex.min.css';
import '@/features/paper/styles/paperTheme.scss';

const props = defineProps<{
  token: string;
}>();

const publicChannelId = computed(() => `public:${props.token.trim()}`);

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

const paperSourceView = usePaperSourceViewMode({ channelId: publicChannelId });

usePaperSourceViewKeybind({
  enabled: documentLoaded,
  onToggle: () => paperSourceView.toggleMode(),
});

const paperRawMarkdown = usePaperRawMarkdownBridge({
  mode: paperSourceView.mode,
  editor,
});

watch(
  [() => paperSourceView.mode.value, editor],
  () => {
    const ed = editor.value;
    if (!ed) return;
    setPaperMarkdownRenderInline(ed, paperSourceView.mode.value === 'inline');
  },
  { immediate: true },
);

const paperPageFontFamily = computed(() =>
  paperFontFamilyCss(readPaperDefaultFont(contentJson.value)),
);

const appearance = ref<PaperAppearanceMode>(detectGlobalAppearance());

const pageSurfaceStyle = computed(() =>
  resolvePaperPageSurfaceStyle(
    appearance.value,
    readPaperPageColors(contentJson.value),
  ),
);

function toggleAppearance() {
  appearance.value = nextPaperAppearance(appearance.value);
}

const isLoggedIn = computed(() => authSession.isAuthenticated);

function openInEcho() {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, '') || '';
  window.location.href = `${base}/`;
}

async function loadDoc() {
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
}

onMounted(async () => {
  preloadPaperFontCatalog();
  await loadDoc();
});
</script>

<template>
  <div
    class="paper-root flex min-h-screen flex-col paper-workspace"
    :data-paper-appearance="appearance"
    :data-paper-source-view="paperSourceView.mode.value"
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
      <div class="flex shrink-0 items-center gap-2">
        <button
          v-if="!error && !loading"
          type="button"
          class="rounded-lg border border-border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-fg-subtle transition-colors hover:bg-glass-hover"
          :class="{
            'border-accent/50 bg-glass-2 text-accent':
              paperSourceView.mode.value === 'inline',
          }"
          :title="
            paperSourceView.mode.value === 'inline'
              ? 'Rendered preview — click for markdown source'
              : 'Markdown source — click for rendered preview'
          "
          @click="paperSourceView.toggleMode()"
        >
          {{ paperSourceView.mode.value === 'inline' ? 'Rendered' : 'Raw' }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-border p-1.5 text-fg-subtle transition-colors hover:bg-glass-hover"
          :title="
            appearance === 'dark'
              ? 'Switch to light preview'
              : 'Switch to dark preview'
          "
          @click="toggleAppearance"
        >
          <svg
            v-if="appearance === 'dark'"
            class="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="5" />
            <path
              d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
            />
          </svg>
          <svg
            v-else
            class="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>
      </div>
    </header>
    <main class="flex-1 overflow-y-auto">
      <div
        v-if="error"
        class="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center"
      >
        <svg
          class="h-8 w-8 text-fg-subtle opacity-60"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <p class="text-sm font-medium text-fg">
          {{ notFound ? 'Paper not found' : 'Could not load this paper' }}
        </p>
        <p class="text-xs text-fg-subtle">{{ error }}</p>
        <p v-if="notFound" class="text-xs text-fg-subtle">
          The link may have expired or sharing was turned off.
        </p>
        <button
          v-if="!notFound"
          type="button"
          class="mt-1 rounded-lg border border-border bg-elevated px-4 py-2 text-sm text-fg transition-colors hover:bg-glass-hover"
          @click="loadDoc"
        >
          Try again
        </button>
      </div>
      <PaperPageCanvas
        v-else
        :editor="editor"
        :loading="loading"
        :document-font-family="paperPageFontFamily"
        :page-surface-style="pageSurfaceStyle"
        :source-view-mode="paperSourceView.mode.value"
        :raw-markdown="paperRawMarkdown.rawMarkdown.value"
        :raw-editable="false"
      />
    </main>
    <footer
      class="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-fg-subtle"
    >
      <span>Shared via Echo</span>
      <button
        v-if="isLoggedIn"
        type="button"
        class="rounded-lg border border-border px-3 py-1.5 text-fg transition-colors hover:bg-glass-hover"
        title="Go to Echo"
        @click="openInEcho"
      >
        Open Echo
      </button>
    </footer>
  </div>
</template>
