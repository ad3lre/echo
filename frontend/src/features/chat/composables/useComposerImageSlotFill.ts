import { ref } from 'vue';
import type { Editor } from '@tiptap/core';
import { uploadPendingMediaAsAttachments } from '@/composables/uploadPendingMediaAsAttachments';
import {
  resolveComposerImageSlotTarget,
  updateImageSlotInEditor,
} from '@/features/chat/editor/composerModel';
import { formatChatUploadErrorMessage } from '@/services/domain/chatUploads';
import { isChatImageUpload } from '@/utils/chatUploadMediaTypes';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

type PendingSlotTarget = {
  slotId: string;
  pos: number;
};

async function uploadImageToComposerSlot(
  channelId: string,
  target: PendingSlotTarget,
  editor: Editor,
  file: File,
): Promise<boolean> {
  const pending = {
    url: URL.createObjectURL(file),
    file,
    spoiler: false,
  };
  try {
    const uploaded = await uploadPendingMediaAsAttachments(
      channelId,
      [pending],
      [],
      [],
      [],
      [],
      [],
    );
    const att = uploaded.find((a) => a.kind === 'image' || a.kind === 'gif');
    if (!att?.url) {
      throw new Error('Upload did not return an image URL');
    }
    const ok = updateImageSlotInEditor(
      editor,
      target.slotId,
      {
        imageUrl: att.url,
        ...(att.storageKey ? { storageKey: att.storageKey } : {}),
        ...(att.width != null ? { width: att.width } : {}),
        ...(att.height != null ? { height: att.height } : {}),
      },
      { pos: target.pos },
    );
    if (!ok) {
      throw new Error('Could not update image slot in composer');
    }
    dispatchAppToast('Image added to slot', 'success');
    return true;
  } finally {
    URL.revokeObjectURL(pending.url);
  }
}

async function handleComposerImageSlotFileSelected(
  event: Event,
  opts: {
    channelId: () => string | undefined;
    getEditor: () => Editor | null;
  },
  state: {
    filling: { value: boolean };
    pendingTarget: { target: PendingSlotTarget | null };
  },
): Promise<void> {
  const channelId = opts.channelId()?.trim();
  const target = state.pendingTarget.target;
  const editor = opts.getEditor();
  if (!channelId || !target || !editor) {
    dispatchAppToast('Could not add image to slot', 'warning');
    state.pendingTarget.target = null;
    return;
  }
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    state.pendingTarget.target = null;
    return;
  }
  if (!isChatImageUpload(file)) {
    dispatchAppToast(
      'Please choose an image file (JPEG, PNG, WebP, GIF, or HEIC)',
      'warning',
    );
    state.pendingTarget.target = null;
    return;
  }
  state.filling.value = true;
  dispatchAppToast('Uploading image…', 'info');
  try {
    await uploadImageToComposerSlot(channelId, target, editor, file);
  } catch (e) {
    dispatchAppToast(formatChatUploadErrorMessage(e), 'warning');
  } finally {
    state.filling.value = false;
    state.pendingTarget.target = null;
    input.value = '';
  }
}

export function useComposerImageSlotFill(opts: {
  channelId: () => string | undefined;
  getEditor: () => Editor | null;
  composerDisabled: () => boolean;
  composerDisabledReason?: () => string | undefined;
}) {
  const filling = ref(false);
  const fileInputRef = ref<HTMLInputElement | null>(null);
  const pendingTarget = { target: null as PendingSlotTarget | null };

  function openFillPicker(target: PendingSlotTarget) {
    if (opts.composerDisabled()) {
      const reason = opts.composerDisabledReason?.()?.trim();
      dispatchAppToast(
        reason || 'Composer is locked — you cannot add images right now',
        'warning',
      );
      return;
    }
    pendingTarget.target = target;
    const input = fileInputRef.value;
    if (!input) {
      dispatchAppToast('Could not open image picker', 'warning');
      return;
    }
    input.value = '';
    input.click();
  }

  function handleComposerImageSlotPointerDown(event: MouseEvent) {
    if (event.button !== 0) return;
    const clickTarget = event.target;
    if (!(clickTarget instanceof HTMLElement)) return;
    if (!clickTarget.closest('[data-rich-block="image"]')) return;
    if (opts.composerDisabled()) {
      const reason = opts.composerDisabledReason?.()?.trim();
      dispatchAppToast(
        reason || 'Composer is locked — you cannot add images right now',
        'warning',
      );
      return;
    }
    const editor = opts.getEditor();
    if (!editor) {
      dispatchAppToast('Composer is not ready — try again', 'warning');
      return;
    }
    const target = resolveComposerImageSlotTarget(editor, event);
    if (!target) {
      dispatchAppToast(
        'Could not add image to this slot — try again',
        'warning',
      );
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openFillPicker(target);
  }

  async function onFileSelected(event: Event) {
    await handleComposerImageSlotFileSelected(event, opts, {
      filling,
      pendingTarget,
    });
  }

  return {
    filling,
    fileInputRef,
    handleComposerImageSlotPointerDown,
    onFileSelected,
  };
}
