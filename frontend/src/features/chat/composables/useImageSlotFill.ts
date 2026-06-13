import { ref } from 'vue';
import { uploadPendingMediaAsAttachments } from '@/composables/uploadPendingMediaAsAttachments';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import type { ActionResult } from '@/types/actionResult';

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
): Promise<void> {
  const pending = {
    url: URL.createObjectURL(file),
    file,
    spoiler: false,
  };
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
  let pendingMessageId = '';
  let pendingSlotId = '';

  function openFillPicker(messageId: string, slotId: string) {
    pendingMessageId = messageId;
    pendingSlotId = slotId;
    const input = fileInputRef.value;
    if (!input) return;
    input.value = '';
    input.click();
  }

  async function onFileSelected(event: Event) {
    const channelId = opts.channelId()?.trim();
    if (!channelId || !pendingMessageId || !pendingSlotId) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      dispatchAppToast('Please choose an image file', 'warning');
      return;
    }
    filling.value = true;
    try {
      await uploadImageAndFillSlot(
        channelId,
        pendingMessageId,
        pendingSlotId,
        file,
        opts.submitFill,
      );
    } catch (e) {
      dispatchAppToast(
        e instanceof Error ? e.message : 'Could not upload image',
        'warning',
      );
    } finally {
      filling.value = false;
      pendingMessageId = '';
      pendingSlotId = '';
      input.value = '';
    }
  }

  return {
    filling,
    fileInputRef,
    openFillPicker,
    onFileSelected,
  };
}
