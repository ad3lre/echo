import { ref } from 'vue';
import type { Editor } from '@tiptap/core';
import { uploadChatMediaFile } from '@/api/echo/uploads';
import { useAuthSessionStore } from '@/stores/authSession';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { inferChatPendingMediaKind } from '@/utils/chatUploadMediaTypes';
import { extractMediaFilesFromClipboard } from '@/features/chat/composables/useClipboardMedia';

export function usePaperImageUpload(channelId: string) {
  const uploading = ref(false);
  const error = ref<string | null>(null);
  const authSession = useAuthSessionStore();

  async function insertImageFile(editor: Editor, file: File) {
    const token = authSession.accessToken?.trim() ?? '';
    if (!token?.trim()) {
      error.value = 'Sign in to upload images';
      return;
    }
    uploading.value = true;
    error.value = null;
    try {
      const { url } = await uploadChatMediaFile(token, channelId, file);
      const safe = safeImageUrl(url);
      if (!safe) {
        error.value = 'Upload returned an invalid image URL';
        return;
      }
      editor.chain().focus().setImage({ src: safe }).run();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Upload failed';
    } finally {
      uploading.value = false;
    }
  }

  function handlePaste(editor: Editor, event: ClipboardEvent): boolean {
    const files = extractMediaFilesFromClipboard(event).filter(
      (file) => inferChatPendingMediaKind(file) === 'image',
    );
    const file = files[0];
    if (!file) return false;
    event.preventDefault();
    void insertImageFile(editor, file);
    return true;
  }

  function handleDrop(editor: Editor, event: DragEvent): boolean {
    const file = event.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return false;
    event.preventDefault();
    void insertImageFile(editor, file);
    return true;
  }

  return {
    uploading,
    error,
    insertImageFile,
    handlePaste,
    handleDrop,
  };
}
