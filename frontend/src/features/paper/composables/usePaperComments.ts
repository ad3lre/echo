import { computed, ref, watch, type Ref } from 'vue';
import type { PaperCommentPayload } from '@shared/types/paper';
import {
  createPaperComment,
  deletePaperComment,
  fetchPaperComments,
  patchPaperComment,
} from '@/features/paper/api/paper';

export function usePaperComments(
  channelId: Ref<string>,
  enabled: Ref<boolean> = ref(true),
) {
  const comments = ref<PaperCommentPayload[]>([]);
  const loading = ref(false);
  const loadForbidden = ref(false);

  const topLevel = computed(() =>
    comments.value.filter((c) => !c.parentCommentId),
  );

  function repliesFor(parentId: string) {
    return comments.value.filter((c) => c.parentCommentId === parentId);
  }

  async function load() {
    const id = channelId.value.trim();
    if (!id || !enabled.value) return;
    loading.value = true;
    loadForbidden.value = false;
    try {
      const res = await fetchPaperComments(id);
      comments.value = res.comments;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) {
        loadForbidden.value = true;
        comments.value = [];
      }
    } finally {
      loading.value = false;
    }
  }

  async function addComment(input: {
    anchorBlockId?: string;
    anchorFrom?: number | null;
    anchorTo?: number | null;
    anchorQuote?: string;
    body: string;
    parentCommentId?: string | null;
  }) {
    const res = await createPaperComment(channelId.value, input);
    comments.value = [...comments.value, res.comment];
    return res.comment;
  }

  async function resolveComment(commentId: string, resolve: boolean) {
    const res = await patchPaperComment(channelId.value, commentId, {
      resolve: resolve ? true : undefined,
      unresolve: resolve ? undefined : true,
    });
    comments.value = comments.value.map((c) =>
      c.id === commentId ? res.comment : c,
    );
  }

  async function removeComment(commentId: string) {
    await deletePaperComment(channelId.value, commentId);
    comments.value = comments.value.filter(
      (c) => c.id !== commentId && c.parentCommentId !== commentId,
    );
  }

  function applyRemote(comment: PaperCommentPayload, action: string) {
    if (action === 'deleted') {
      comments.value = comments.value.filter((c) => c.id !== comment.id);
      return;
    }
    const idx = comments.value.findIndex((c) => c.id === comment.id);
    if (idx >= 0) {
      const next = [...comments.value];
      next[idx] = comment;
      comments.value = next;
    } else {
      comments.value = [...comments.value, comment];
    }
  }

  watch(
    [channelId, enabled],
    () => {
      if (enabled.value) void load();
      else {
        comments.value = [];
        loadForbidden.value = false;
      }
    },
    { immediate: true },
  );

  return {
    comments,
    loading,
    loadForbidden,
    topLevel,
    repliesFor,
    load,
    addComment,
    resolveComment,
    removeComment,
    applyRemote,
  };
}
