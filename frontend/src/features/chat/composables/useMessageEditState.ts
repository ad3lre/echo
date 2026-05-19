import { nextTick, ref, watch, type Ref } from 'vue';
import type {
  MessageAttachmentPayload,
  MessageWithAuthor,
} from '@shared/types';
import {
  applyMarkdownWrapToTextareaValue,
  markdownWrapDelimiters,
  resolveMarkdownComposerKeybind,
} from '@/features/chat/composables/markdownComposerKeybinds';

const EDIT_TEXTAREA_MAX_VH = 0.5;

interface UseMessageEditStateOptions {
  message: Ref<MessageWithAuthor & { channelName?: string }>;
  isOwnMessage: Ref<unknown>;
  menuOpen: Ref<boolean>;
  rootRef: Ref<HTMLElement | null>;
  editTextareaRef: Ref<HTMLTextAreaElement | null>;
  editFormRef: Ref<HTMLElement | null>;
  /** Display body element measured before edit mode to preserve visual height. */
  messageContentRef?: Ref<HTMLElement | null>;
  activeEditInsert?: { value: ((text: string) => void) | null };
  /** Upload new files picked while editing; appended to `editAttachments` on save. */
  finalizeAttachments?: () => Promise<MessageAttachmentPayload[]>;
  /** Return false to keep the editor open and skip “saved” feedback (e.g. socket not ready). */
  onSave: (
    messageId: string,
    newContent: string,
    attachments?: MessageAttachmentPayload[],
  ) => boolean | Promise<boolean>;
}

export function useMessageEditState(options: UseMessageEditStateOptions) {
  const {
    message,
    isOwnMessage,
    menuOpen,
    rootRef,
    editTextareaRef,
    editFormRef,
    messageContentRef,
    activeEditInsert,
    finalizeAttachments,
    onSave,
  } = options;

  const isEditing = ref(false);
  const editDraft = ref('');
  const editTextareaMinHeightPx = ref(0);
  /** Snapshot while editing; omit updates unless caller sets this ref from message.attachments in enterEditMode. */
  const editAttachments = ref<MessageAttachmentPayload[]>([]);
  const saveFeedback = ref(false);
  let saveFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  function measureMessageContentHeight(): number {
    const el = messageContentRef?.value;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.ceil(Math.max(rect.height, el.scrollHeight));
  }

  function resizeEditTextarea(el?: HTMLTextAreaElement | null) {
    const ta = el ?? editTextareaRef.value;
    if (!ta) return;
    const styles = getComputedStyle(ta);
    const linePx = parseFloat(styles.lineHeight) || 22;
    const padY =
      (parseFloat(styles.paddingTop) || 0) +
      (parseFloat(styles.paddingBottom) || 0);
    const minFromContent = editTextareaMinHeightPx.value;
    const minHeight = Math.max(
      linePx * 2 + padY,
      minFromContent,
      linePx + padY,
    );
    const maxHeight = Math.max(
      minHeight,
      Math.floor(window.innerHeight * EDIT_TEXTAREA_MAX_VH),
    );
    ta.style.height = 'auto';
    const scrollHeight = ta.scrollHeight;
    const next = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
    ta.style.height = `${next}px`;
    ta.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  function onEditInput(event: Event) {
    resizeEditTextarea(event.target as HTMLTextAreaElement);
  }

  function insertAtEditTextarea(text: string) {
    const textarea = editTextareaRef.value;
    if (!textarea) {
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd ?? start;
    const before = editDraft.value.slice(0, start);
    const after = editDraft.value.slice(end);
    editDraft.value = before + text + after;
    void nextTick(() => {
      const pos = start + text.length;
      textarea.setSelectionRange(pos, pos);
      textarea.focus();
      resizeEditTextarea(textarea);
    });
  }

  function enterEditMode() {
    if (!message.value.id || !isOwnMessage.value) return;
    editTextareaMinHeightPx.value = measureMessageContentHeight();
    editDraft.value = message.value.content ?? '';
    editAttachments.value = [...(message.value.attachments ?? [])];
    isEditing.value = true;
    menuOpen.value = false;
    if (activeEditInsert) activeEditInsert.value = insertAtEditTextarea;
    void nextTick(() => {
      resizeEditTextarea();
      editTextareaRef.value?.focus();
      editFormRef.value?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });
  }

  function cancelEdit() {
    isEditing.value = false;
    editDraft.value = '';
    editAttachments.value = [];
    editTextareaMinHeightPx.value = 0;
    if (activeEditInsert) activeEditInsert.value = null;
  }

  function removeEditAttachment(index: number) {
    editAttachments.value = editAttachments.value.filter((_, i) => i !== index);
  }

  async function saveEdit() {
    if (!message.value.id) return;
    const uploaded = (await finalizeAttachments?.()) ?? [];
    const merged = [...editAttachments.value, ...uploaded];
    const hadAttachmentsOriginally =
      (message.value.attachments?.length ?? 0) > 0;
    const snapshot =
      hadAttachmentsOriginally || merged.length > 0 ? merged : undefined;
    const ok = await Promise.resolve(
      onSave(message.value.id, editDraft.value.trim(), snapshot),
    );
    if (!ok) return;
    isEditing.value = false;
    editDraft.value = '';
    editAttachments.value = [];
    editTextareaMinHeightPx.value = 0;
    if (activeEditInsert) activeEditInsert.value = null;
    saveFeedback.value = true;
    if (saveFeedbackTimer) clearTimeout(saveFeedbackTimer);
    saveFeedbackTimer = setTimeout(() => {
      saveFeedback.value = false;
      saveFeedbackTimer = null;
    }, 2000);
  }

  function onEditKeydown(event: KeyboardEvent) {
    const wrapKind = resolveMarkdownComposerKeybind(event);
    if (wrapKind) {
      event.preventDefault();
      const { prefix, suffix } = markdownWrapDelimiters(wrapKind);
      applyMarkdownWrapToTextareaValue(
        editDraft,
        editTextareaRef.value,
        prefix,
        suffix,
      );
      void nextTick(() => resizeEditTextarea());
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void saveEdit();
    }
  }

  watch(isEditing, (editing) => {
    if (editing && rootRef.value)
      rootRef.value.classList.remove('message-highlight');
  });

  watch(editDraft, () => {
    if (isEditing.value) void nextTick(() => resizeEditTextarea());
  });

  return {
    isEditing,
    editDraft,
    editAttachments,
    removeEditAttachment,
    saveFeedback,
    enterEditMode,
    cancelEdit,
    saveEdit,
    onEditKeydown,
    onEditInput,
    insertAtEditTextarea,
  };
}
