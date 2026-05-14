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

interface UseMessageEditStateOptions {
  message: Ref<MessageWithAuthor & { channelName?: string }>;
  isOwnMessage: Ref<unknown>;
  menuOpen: Ref<boolean>;
  rootRef: Ref<HTMLElement | null>;
  editTextareaRef: Ref<HTMLTextAreaElement | null>;
  editFormRef: Ref<HTMLElement | null>;
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
    activeEditInsert,
    finalizeAttachments,
    onSave,
  } = options;

  const isEditing = ref(false);
  const editDraft = ref('');
  /** Snapshot while editing; omit updates unless caller sets this ref from message.attachments in enterEditMode. */
  const editAttachments = ref<MessageAttachmentPayload[]>([]);
  const saveFeedback = ref(false);
  let saveFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

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
    });
  }

  function enterEditMode() {
    if (!message.value.id || !isOwnMessage.value) return;
    editDraft.value = message.value.content ?? '';
    editAttachments.value = [...(message.value.attachments ?? [])];
    isEditing.value = true;
    menuOpen.value = false;
    if (activeEditInsert) activeEditInsert.value = insertAtEditTextarea;
    void nextTick(() => {
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
    insertAtEditTextarea,
  };
}
