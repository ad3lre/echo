import { ref } from 'vue';
import type { Editor } from '@tiptap/core';
import { uploadChatMediaFile } from '@/api/echo/uploads';
import { useAuthSessionStore } from '@/stores/authSession';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { inferChatPendingMediaKind } from '@/utils/chatUploadMediaTypes';
import {
  dataUrlToImageFile,
  extractPaperClipboardImage,
} from '@/features/paper/composables/extractPaperClipboardImage';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { insertPaperImage } from '@/features/paper/editor/insertPaperImage';

export function usePaperImageUpload(channelId: string) {
  const uploading = ref(false);
  const error = ref<string | null>(null);
  const authSession = useAuthSessionStore();

  function insertImageUrl(editor: Editor, src: string) {
    const safe = safeImageUrl(src);
    if (!safe || safe.startsWith('data:')) {
      error.value = 'That URL is not allowed for images.';
      dispatchAppToast(error.value, 'warning');
      return false;
    }
    insertPaperImage(editor, safe);
    return true;
  }

  async function insertImageFile(editor: Editor, file: File) {
    const token = authSession.accessToken?.trim() ?? '';
    if (!token?.trim()) {
      error.value = 'Sign in to upload images';
      dispatchAppToast(error.value, 'warning');
      return;
    }
    uploading.value = true;
    error.value = null;
    try {
      const { url } = await uploadChatMediaFile(token, channelId, file);
      const safe = safeImageUrl(url);
      if (!safe) {
        error.value = 'Upload returned an invalid image URL';
        dispatchAppToast(error.value, 'warning');
        return;
      }
      insertPaperImage(editor, safe);
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Upload failed';
      dispatchAppToast(error.value, 'warning');
    } finally {
      uploading.value = false;
    }
  }

  function handlePaste(editor: Editor, event: ClipboardEvent): boolean {
    const payload = extractPaperClipboardImage(event);
    if (!payload) return false;
    event.preventDefault();

    if (payload.kind === 'file') {
      void insertImageFile(editor, payload.file);
      return true;
    }
    if (payload.kind === 'url') {
      return insertImageUrl(editor, payload.url);
    }

    const file = dataUrlToImageFile(payload.dataUrl);
    if (!file) {
      error.value = 'Could not read pasted image';
      dispatchAppToast(error.value, 'warning');
      return true;
    }
    void insertImageFile(editor, file);
    return true;
  }

  function handleDrop(editor: Editor, event: DragEvent): boolean {
    const file = event.dataTransfer?.files?.[0];
    if (!file || inferChatPendingMediaKind(file) !== 'image') return false;
    event.preventDefault();
    void insertImageFile(editor, file);
    return true;
  }

  return {
    uploading,
    error,
    insertImageFile,
    insertImageUrl,
    handlePaste,
    handleDrop,
  };
}
