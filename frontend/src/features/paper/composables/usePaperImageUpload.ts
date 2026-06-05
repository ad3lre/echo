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
import { snapshotPaperEditorCaretAt } from '@/features/paper/editor/paperFormatSelection';

function isImageFile(file: File): boolean {
  return inferChatPendingMediaKind(file) === 'image';
}

export function usePaperImageUpload(channelId: string) {
  const uploading = ref(false);
  const error = ref<string | null>(null);
  const authSession = useAuthSessionStore();

  function insertImageUrl(
    editor: Editor,
    src: string,
    opts: { restoreCaret?: boolean } = {},
  ) {
    if (!editor.isEditable) {
      error.value = 'Switch to edit mode to insert images';
      dispatchAppToast(error.value, 'warning');
      return false;
    }
    const safe = safeImageUrl(src);
    if (!safe || safe.startsWith('data:')) {
      error.value = 'That URL is not allowed for images.';
      dispatchAppToast(error.value, 'warning');
      return false;
    }
    if (
      !insertPaperImage(editor, safe, {
        restoreCaret: opts.restoreCaret ?? true,
      })
    ) {
      error.value = 'Could not insert image at this position';
      dispatchAppToast(error.value, 'warning');
      return false;
    }
    return true;
  }

  async function uploadImageFileToUrl(file: File): Promise<string | null> {
    if (!isImageFile(file)) {
      error.value = 'Only image files can be inserted';
      dispatchAppToast(error.value, 'warning');
      return null;
    }
    const token = authSession.accessToken?.trim() ?? '';
    if (!token?.trim()) {
      error.value = 'Sign in to upload images';
      dispatchAppToast(error.value, 'warning');
      return null;
    }
    uploading.value = true;
    error.value = null;
    try {
      const { url } = await uploadChatMediaFile(token, channelId, file);
      const safe = safeImageUrl(url);
      if (!safe) {
        error.value = 'Upload returned an invalid image URL';
        dispatchAppToast(error.value, 'warning');
        return null;
      }
      return safe;
    } catch (e) {
      if (
        e instanceof Error &&
        /403|forbidden|cannot upload/i.test(e.message)
      ) {
        error.value =
          'You do not have permission to upload images in this paper';
      } else {
        error.value = e instanceof Error ? e.message : 'Upload failed';
      }
      dispatchAppToast(error.value, 'warning');
      return null;
    } finally {
      uploading.value = false;
    }
  }

  async function insertImageFile(
    editor: Editor,
    file: File,
    opts: { restoreCaret?: boolean } = {},
  ) {
    if (!editor.isEditable) {
      error.value = 'Switch to edit mode to upload images';
      dispatchAppToast(error.value, 'warning');
      return;
    }
    if (!isImageFile(file)) {
      error.value = 'Only image files can be inserted';
      dispatchAppToast(error.value, 'warning');
      return;
    }
    const token = authSession.accessToken?.trim() ?? '';
    if (!token?.trim()) {
      error.value = 'Sign in to upload images';
      dispatchAppToast(error.value, 'warning');
      return;
    }
    const safe = await uploadImageFileToUrl(file);
    if (!safe) return;
    if (
      !insertPaperImage(editor, safe, {
        restoreCaret: opts.restoreCaret ?? true,
      })
    ) {
      error.value = 'Could not insert image at this position';
      dispatchAppToast(error.value, 'warning');
    }
  }

  function handlePaste(editor: Editor, event: ClipboardEvent): boolean {
    if (!editor.isEditable) return false;
    const payload = extractPaperClipboardImage(event);
    if (!payload) return false;
    event.preventDefault();

    if (payload.kind === 'file') {
      void insertImageFile(editor, payload.file, { restoreCaret: false });
      return true;
    }
    if (payload.kind === 'url') {
      return insertImageUrl(editor, payload.url, { restoreCaret: false });
    }

    const file = dataUrlToImageFile(payload.dataUrl);
    if (!file) {
      error.value = 'Could not read pasted image';
      dispatchAppToast(error.value, 'warning');
      return true;
    }
    void insertImageFile(editor, file, { restoreCaret: false });
    return true;
  }

  function handleDrop(editor: Editor, event: DragEvent): boolean {
    if (!editor.isEditable) return false;
    const file = event.dataTransfer?.files?.[0];
    if (!file || !isImageFile(file)) return false;
    event.preventDefault();
    const coords = editor.view.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    });
    if (coords?.pos != null) {
      snapshotPaperEditorCaretAt(coords.pos);
    }
    void insertImageFile(editor, file);
    return true;
  }

  return {
    uploading,
    error,
    uploadImageFileToUrl,
    insertImageFile,
    insertImageUrl,
    handlePaste,
    handleDrop,
  };
}
