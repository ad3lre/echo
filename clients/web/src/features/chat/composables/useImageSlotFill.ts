import { ref } from 'vue';
import { uploadPendingMediaAsAttachments } from '@/features/chat/composables/uploadPendingMediaAsAttachments';
import { formatChatUploadErrorMessage } from '@/features/chat/domain/chatUploads';
import { isChatImageUpload } from '@/features/chat/chatUploadMediaTypes';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';
import type { ActionResult } from '@/features/layout/actionResult';

type FillPayload = {
  imageUrl: string;
  storageKey?: string;
  width?: number;
  height?: number;
};

async function uploadImageAndFillSlot(
  channelId: string,
  messageId: string,
  slotId: string,
  file: File,
  submitFill: (
    channelId: string,
    messageId: string,
    slotId: string,
    payload: FillPayload,
  ) => Promise<ActionResult>,
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
    const result = await submitFill(channelId, messageId, slotId, {
      imageUrl: att.url,
      ...(att.storageKey ? { storageKey: att.storageKey } : {}),
      ...(att.width != null ? { width: att.width } : {}),
      ...(att.height != null ? { height: att.height } : {}),
    });
    if (!result.ok) {
      dispatchAppToast(
        result.error?.userMessage ?? 'Could not fill image slot',
        'warning',
      );
      return false;
    }
    dispatchAppToast('Image added to slot', 'success');
    return true;
  } finally {
    URL.revokeObjectURL(pending.url);
  }
}

async function handleImageSlotFileSelected(
  event: Event,
  opts: {
    channelId: () => string | undefined;
    submitFill: (
      channelId: string,
      messageId: string,
      slotId: string,
      payload: FillPayload,
    ) => Promise<ActionResult>;
  },
  state: {
    filling: { value: boolean };
    pending: { messageId: string; slotId: string };
  },
): Promise<void> {
  const channelId = opts.channelId()?.trim();
  if (!channelId || !state.pending.messageId || !state.pending.slotId) {
    dispatchAppToast('Could not fill image slot', 'warning');
    state.pending.messageId = '';
    state.pending.slotId = '';
    return;
  }
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    state.pending.messageId = '';
    state.pending.slotId = '';
    return;
  }
  if (!isChatImageUpload(file)) {
    dispatchAppToast(
      'Please choose an image file (JPEG, PNG, WebP, GIF, or HEIC)',
      'warning',
    );
    state.pending.messageId = '';
    state.pending.slotId = '';
    return;
  }
  state.filling.value = true;
  dispatchAppToast('Uploading image…', 'info');
  try {
    await uploadImageAndFillSlot(
      channelId,
      state.pending.messageId,
      state.pending.slotId,
      file,
      opts.submitFill,
    );
  } catch (e) {
    dispatchAppToast(formatChatUploadErrorMessage(e), 'warning');
  } finally {
    state.filling.value = false;
    state.pending.messageId = '';
    state.pending.slotId = '';
    input.value = '';
  }
}

export function useImageSlotFill(opts: {
  channelId: () => string | undefined;
  submitFill: (
    channelId: string,
    messageId: string,
    slotId: string,
    payload: FillPayload,
  ) => Promise<ActionResult>;
}) {
  const filling = ref(false);
  const fileInputRef = ref<HTMLInputElement | null>(null);
  const pending = { messageId: '', slotId: '' };

  function openFillPicker(messageId: string, slotId: string) {
    const trimmedMessageId = messageId.trim();
    const trimmedSlotId = slotId.trim();
    if (!trimmedMessageId || !trimmedSlotId) {
      dispatchAppToast('Could not fill image slot', 'warning');
      return;
    }
    pending.messageId = trimmedMessageId;
    pending.slotId = trimmedSlotId;
    const input = fileInputRef.value;
    if (!input) {
      dispatchAppToast('Could not open image picker', 'warning');
      pending.messageId = '';
      pending.slotId = '';
      return;
    }
    input.value = '';
    input.click();
  }

  async function onFileSelected(event: Event) {
    await handleImageSlotFileSelected(event, opts, { filling, pending });
  }

  return {
    filling,
    fileInputRef,
    openFillPicker,
    onFileSelected,
  };
}
