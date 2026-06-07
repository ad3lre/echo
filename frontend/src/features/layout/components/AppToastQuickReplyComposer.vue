<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { EditorContent } from '@tiptap/vue-3';
import type { Editor as VueEditor } from '@tiptap/vue-3';
import { useComposerState } from '@/composables/useComposerState';
import ComposerChannelFormatBanner from '@/features/chat/components/ComposerChannelFormatBanner.vue';
import { applyComposerOrderedListEnter } from '@/features/chat/editor/composerMarkdownListEnter';
import {
  normalizeEchoMessageFormatTemplateInput,
  echoHardFormatPrefixSatisfied,
  stripLeadingDuplicateHardFormatTemplate,
} from '@shared/messageChunkLimits';
import type { MentionEntity } from '@shared/types';
import {
  isComposerContentEffectivelyEmpty,
  shiftMentionsForReplacement,
} from '@/features/chat/editor/composerModel';

const props = defineProps<{
  channelId: string;
  messageFormatTemplate?: string;
  messageFormatHard?: boolean;
}>();

const model = defineModel<string>({ default: '' });

const emit = defineEmits<{
  submit: [];
}>();

const composer = useComposerState();
// The composer's tiptap instance is the `@tiptap/core` Editor, nominally
// distinct from the `@tiptap/vue-3` one EditorContent wants though identical at
// runtime; bridge the gap once here.
const composerEditor = computed(
  () => composer.editor.value as unknown as VueEditor | null,
);

const TOAST_QUICK_REPLY_PLACEHOLDER = 'Write a reply…';

const showComposerPlaceholder = computed(() =>
  isComposerContentEffectivelyEmpty(composer.content.value),
);

const messageFormatNormalized = computed(() =>
  typeof props.messageFormatTemplate === 'string'
    ? normalizeEchoMessageFormatTemplateInput(props.messageFormatTemplate)
    : '',
);

const messageFormatPrefixLen = computed(() =>
  props.messageFormatHard === true && messageFormatNormalized.value.length > 0
    ? messageFormatNormalized.value.length
    : 0,
);

function shiftMentionEntities(
  mentions: MentionEntity[],
  delta: number,
): MentionEntity[] {
  if (delta === 0) return mentions.map((m) => ({ ...m }));
  return mentions.map((m) => ({
    ...m,
    start: m.start + delta,
    end: m.end + delta,
  }));
}

function ensureComposerHardFormatPrefix() {
  const T = messageFormatNormalized.value;
  if (!T || props.messageFormatHard !== true) return;

  for (let k = 0; k < 8; k++) {
    const cur = composer.content.value;
    const stripped = stripLeadingDuplicateHardFormatTemplate(cur, T);
    if (stripped === null || stripped === cur) break;
    const lo = T.length;
    const hi = T.length * 2;
    const delta = lo - hi;
    const mentions = shiftMentionsForReplacement(
      cur,
      composer.mentions.value,
      lo,
      hi,
      0,
    );
    const shiftPos = (p: number) => {
      if (p <= lo) return p;
      if (p >= hi) return p + delta;
      return lo;
    };
    let a = shiftPos(composer.getSelectionStart());
    let b = shiftPos(composer.getSelectionEnd());
    if (b < a) b = a;
    composer.setSerializedState(stripped, mentions, a, b);
  }

  const cur = composer.content.value;
  if (echoHardFormatPrefixSatisfied(cur, T)) return;
  const next = T + cur;
  const m = shiftMentionEntities(composer.mentions.value, T.length);
  const pos = Math.min(composer.getSelectionStart() + T.length, next.length);
  composer.setSerializedState(next, m, pos, pos);
}

function ensureComposerSoftFormatIfEmpty() {
  const T = messageFormatNormalized.value;
  if (!T || props.messageFormatHard === true) return;
  if (composer.content.value.trim().length > 0) return;
  composer.setSerializedState(T, [], T.length, T.length);
}

function applyChannelMessageFormatAfterRestore() {
  ensureComposerHardFormatPrefix();
  ensureComposerSoftFormatIfEmpty();
}

function syncModelFromComposer() {
  composer.flushComposerSync();
  const next = composer.content.value;
  if (model.value !== next) model.value = next;
}

function handleKeydown(e: KeyboardEvent): boolean {
  if (e.isComposing) return false;
  const plen = messageFormatPrefixLen.value;
  if (plen > 0 && (e.key === 'Backspace' || e.key === 'Delete')) {
    const a = composer.getSelectionStart();
    const b = composer.getSelectionEnd();
    const lo = Math.min(a, b);
    if (lo < plen) {
      e.preventDefault();
      return true;
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    syncModelFromComposer();
    emit('submit');
    return true;
  }

  if (e.key === 'Enter' && e.shiftKey) {
    const live = composer.getContent();
    const selStart = composer.getSelectionStart();
    const selEnd = composer.getSelectionEnd();
    const listEdit = applyComposerOrderedListEnter(live, selStart, selEnd);
    if (listEdit) {
      e.preventDefault();
      composer.setSerializedState(
        listEdit.content,
        composer.mentions.value,
        listEdit.selectionStart,
        listEdit.selectionEnd,
      );
      syncModelFromComposer();
      return true;
    }
    e.preventDefault();
    composer.editor.value?.chain().focus().setHardBreak().run();
    void nextTick(syncModelFromComposer);
    return true;
  }

  return false;
}

onMounted(() => {
  composer.setMarkdownDecorationsEnabled(true);
  composer.registerKeydownHandler(handleKeydown);
  composer.clear();
  void nextTick(() => applyChannelMessageFormatAfterRestore());
  syncModelFromComposer();
});

onUnmounted(() => {
  composer.registerKeydownHandler(null);
});

watch(
  () =>
    [
      props.channelId,
      props.messageFormatTemplate,
      props.messageFormatHard,
    ] as const,
  () => {
    composer.clear();
    void nextTick(() => {
      applyChannelMessageFormatAfterRestore();
      syncModelFromComposer();
    });
  },
);

watch(
  () => composer.content.value,
  () => syncModelFromComposer(),
);

watch(model, (text) => {
  if (text === composer.content.value) return;
  composer.setSerializedState(text, [], text.length, text.length);
  void nextTick(() => applyChannelMessageFormatAfterRestore());
});

defineExpose({
  focus: () => composer.focus(),
  flushComposerSync: () => composer.flushComposerSync(),
  getReplyPayload: () => {
    composer.flushComposerSync();
    return {
      text: composer.content.value.trim(),
      mentions:
        composer.mentions.value.length > 0
          ? composer.mentions.value.map((m) => ({ ...m }))
          : undefined,
      contentJson: composer.editor.value?.getJSON(),
      contentSchemaVersion: 1,
    };
  },
});
</script>

<template>
  <div class="app-toast-quick-reply-composer min-w-0 flex-1">
    <div class="flex min-w-0 items-start gap-1">
      <div
        class="chat-input-surface app-toast-quick-reply-composer__surface relative min-h-[32px] max-h-[120px] min-w-0 flex-1 overflow-y-auto rounded-md border border-border bg-scrim-1 px-2.5 py-1.5"
        @pointerdown="composer.focus()"
      >
        <div
          v-if="showComposerPlaceholder"
          aria-hidden="true"
          class="chat-input-placeholder pointer-events-none absolute inset-x-2.5 top-1.5 z-[2] truncate text-left text-[13px] text-muted"
          :title="TOAST_QUICK_REPLY_PLACEHOLDER"
        >
          {{ TOAST_QUICK_REPLY_PLACEHOLDER }}
        </div>
        <EditorContent
          v-if="composerEditor"
          :editor="composerEditor"
          class="text-[13px] leading-relaxed text-fg"
        />
      </div>
      <div class="app-toast-quick-reply-format mt-0.5 shrink-0">
        <ComposerChannelFormatBanner
          :message-format-template="messageFormatTemplate"
          :message-format-hard="messageFormatHard === true"
          popout-direction="down"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-toast-quick-reply-composer__surface :deep(.tiptap) {
  outline: none;
  min-height: 1.25rem;
}

.app-toast-quick-reply-composer__surface :deep(.tiptap p) {
  margin: 0;
}

.chat-input-surface :deep(.tiptap .composer-md-delim) {
  color: var(--muted);
  opacity: 0.55;
}

.chat-input-surface :deep(.tiptap .composer-md-bold) {
  font-weight: 700;
}

.chat-input-surface :deep(.tiptap .composer-md-italic) {
  font-style: italic;
}

.chat-input-surface :deep(.tiptap .composer-md-list-content) {
  font-weight: inherit;
}
</style>
