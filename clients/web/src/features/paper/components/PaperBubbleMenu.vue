<script setup lang="ts">
import { computed, ref } from 'vue';
import { BubbleMenu } from '@tiptap/vue-3/menus';
import type { Editor } from '@tiptap/core';
import PaperPromptDialog from '@/features/paper/components/PaperPromptDialog.vue';
import { paperBlockIdAtPos } from '@/features/paper/editor/paperBlockAtPos';

const props = defineProps<{
  editor: Editor | null;
  canAuthor: boolean;
  canComment: boolean;
  collabActive?: boolean;
  lockOwnerName?: (blockId: string) => string | null;
}>();

const emit = defineEmits<{
  comment: [];
  requestAccess: [blockId: string];
}>();

const linkDialogOpen = ref(false);

const lockedBlock = computed(() => {
  const ed = props.editor;
  if (!ed || !props.collabActive || !props.lockOwnerName) return null;
  const blockId = paperBlockIdAtPos(ed.state.doc, ed.state.selection.from);
  if (!blockId) return null;
  const owner = props.lockOwnerName(blockId);
  if (!owner) return null;
  return { blockId, owner };
});

function shouldShow({ editor }: { editor: Editor | null }) {
  if (!editor) return false;
  if (lockedBlock.value) return true;
  const { from, to } = editor.state.selection;
  if (from >= to) return false;
  return props.canComment || (props.canAuthor && editor.isEditable);
}

function onLinkConfirm(href: string) {
  linkDialogOpen.value = false;
  const ed = props.editor;
  if (!ed) return;
  if (!href) {
    ed.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }
  ed.chain().focus().extendMarkRange('link').setLink({ href }).run();
}
</script>

<template>
  <BubbleMenu
    v-if="editor"
    :editor="editor"
    :should-show="shouldShow"
    class="paper-bubble-menu"
  >
    <div
      class="flex items-center gap-0.5 rounded-full border border-border px-1 py-0.5 shadow-lg backdrop-blur-md"
      style="background: var(--paper-format-bar-bg)"
      @mousedown.prevent
    >
      <template v-if="lockedBlock">
        <span class="paper-bubble-lock-hint px-2 text-xs text-muted">
          {{ lockedBlock.owner }} is editing
        </span>
        <button
          type="button"
          class="paper-bubble-btn paper-bubble-btn--comment"
          @click="emit('requestAccess', lockedBlock.blockId)"
        >
          Request access
        </button>
      </template>
      <template v-else-if="canAuthor">
        <button
          type="button"
          class="paper-bubble-btn"
          :class="{ 'paper-bubble-btn--active': editor.isActive('bold') }"
          aria-label="Bold"
          @click="editor.chain().focus().toggleBold().run()"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
            <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
          </svg>
        </button>
        <button
          type="button"
          class="paper-bubble-btn"
          :class="{ 'paper-bubble-btn--active': editor.isActive('italic') }"
          aria-label="Italic"
          @click="editor.chain().focus().toggleItalic().run()"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="19" y1="4" x2="10" y2="4" />
            <line x1="14" y1="20" x2="5" y2="20" />
            <line x1="15" y1="4" x2="9" y2="20" />
          </svg>
        </button>
        <button
          type="button"
          class="paper-bubble-btn"
          aria-label="Link"
          @click="linkDialogOpen = true"
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
            />
            <path
              d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
            />
          </svg>
        </button>
        <span
          v-if="canComment"
          class="mx-0.5 h-4 w-px bg-border"
          aria-hidden="true"
        />
      </template>
      <button
        v-if="canComment"
        type="button"
        class="paper-bubble-btn paper-bubble-btn--comment"
        @click="emit('comment')"
      >
        Comment
      </button>
    </div>
  </BubbleMenu>

  <PaperPromptDialog
    :open="linkDialogOpen"
    title="Insert link"
    label="URL"
    placeholder="https://"
    :initial-value="
      (editor?.getAttributes('link').href as string) ?? 'https://'
    "
    @confirm="onLinkConfirm"
    @cancel="linkDialogOpen = false"
  />
</template>

<style scoped>
.paper-bubble-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  padding: 0.35rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text);
  transition: background 0.12s ease;
}

.paper-bubble-btn:focus {
  outline: none;
}

.paper-bubble-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.paper-bubble-btn:hover {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
}

.paper-bubble-btn--active {
  background: color-mix(in srgb, var(--accent) 25%, transparent);
  color: var(--accent);
}

.paper-bubble-btn--comment {
  padding: 0.35rem 0.65rem;
  color: var(--accent);
}
</style>
