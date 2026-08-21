<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, toRef, watch } from 'vue';
import { EditorContent } from '@tiptap/vue-3';
import type { Editor as VueEditor } from '@tiptap/vue-3';
import { useComposerState } from '@/features/chat/composables/useComposerState';
import { applyComposerOrderedListEnter } from '@/features/chat/editor/composerMarkdownListEnter';
import { useComposerChannelMessageFormat } from '@/features/chat/composables/useComposerChannelMessageFormat';
import { isComposerContentEffectivelyEmpty } from '@/features/chat/editor/composerModel';

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
const {
  applyChannelMessageFormatAfterRestore,
  ensureComposerHardFormatPrefix,
  handleFormatGuardKeydown,
} = useComposerChannelMessageFormat(composer, {
  messageFormatTemplate: toRef(props, 'messageFormatTemplate'),
  messageFormatHard: toRef(props, 'messageFormatHard'),
});
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

function syncModelFromComposer() {
  composer.flushComposerSync();
  const next = composer.content.value;
  if (model.value !== next) model.value = next;
}

function handleKeydown(e: KeyboardEvent): boolean {
  if (handleFormatGuardKeydown(e)) return true;
  if (e.isComposing) return false;

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
  { immediate: true },
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
    ensureComposerHardFormatPrefix();
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
