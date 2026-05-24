<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue';
import PaperAuthorGutter from '@/features/paper/components/PaperAuthorGutter.vue';
import PaperBubbleMenu from '@/features/paper/components/PaperBubbleMenu.vue';
import PaperConnectionBanner from '@/features/paper/components/PaperConnectionBanner.vue';
import PaperLockRequestBanner from '@/features/paper/components/PaperLockRequestBanner.vue';
import PaperDocChrome from '@/features/paper/components/PaperDocChrome.vue';
import PaperFloatingComments from '@/features/paper/components/PaperFloatingComments.vue';
import PaperFloatingFormatBar from '@/features/paper/components/PaperFloatingFormatBar.vue';
import PaperPageCanvas from '@/features/paper/components/PaperPageCanvas.vue';
import PaperToast from '@/features/paper/components/PaperToast.vue';
import { usePaperDocument } from '@/features/paper/composables/usePaperDocument';
import {
  usePaperEditorState,
  type PaperEditorMode,
} from '@/features/paper/composables/usePaperEditorState';
import { usePaperSession } from '@/features/paper/composables/usePaperSession';
import {
  onPaperCommentUpdated,
  onPaperDocumentUpdated,
} from '@/features/paper/paperRealtimeBus';
import { usePaperAutosave } from '@/features/paper/composables/usePaperAutosave';
import { usePaperComments } from '@/features/paper/composables/usePaperComments';
import { usePaperAuthorGutter } from '@/features/paper/composables/usePaperAuthorGutter';
import { usePaperImageUpload } from '@/features/paper/composables/usePaperImageUpload';
import { usePaperEditorPanelBridge } from '@/features/paper/composables/paperEditorPanelBridge';
import { usePaperEditorPanelPreferences } from '@/features/paper/composables/usePaperEditorPanelPreferences';
import { usePaperPageLayout } from '@/features/paper/composables/usePaperPageLayout';
import { usePaperCommentLayout } from '@/features/paper/composables/usePaperCommentLayout';
import { usePaperWatchers } from '@/features/paper/composables/usePaperWatchers';
import { mergePaperWatchingPeers } from '@/features/paper/composables/mergePaperWatchingPeers';
import { usePaperAppearance } from '@/features/paper/composables/usePaperAppearance';
import { usePaperUiMode } from '@/features/paper/composables/usePaperUiMode';
import { usePaperShare } from '@/features/paper/composables/usePaperShare';
import { usePaperCollab } from '@/features/paper/composables/usePaperCollab';
import {
  downloadPaperJson,
  printPaperPage,
  copyPaperPlainText,
} from '@/features/paper/editor/paperExport';
import { copyToClipboard } from '@/features/chat/composables/useMessageLinkActions';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { getPaperSelectionAnchor } from '@/features/paper/editor/paperSelectionAnchor';
import {
  clearPaperAuthorSegmentHighlight,
  flashPaperBlockHighlight,
  setPaperAuthorSegmentHighlight,
} from '@/features/paper/editor/paperBlockHighlight';
import type { PaperAuthorSegment } from '@/features/paper/composables/computePaperAuthorSegments';
import { syncPaperBlockAttributionFromJson } from '@/features/paper/editor/syncPaperBlockAttribution';
import { readPaperDefaultFont } from '@/features/paper/editor/paperDocumentAttributes';
import { readPaperPageColors } from '@/features/paper/editor/paperPageAppearance';
import {
  PAPER_FONT_CATALOG,
  paperFontFamilyCss,
} from '@/features/paper/editor/paperTypography';
import {
  ensurePaperFontLoaded,
  preloadPaperFontCatalog,
} from '@/features/paper/editor/paperFontLoader';
import { useAuthSessionStore } from '@/stores/authSession';
import { createRafCoalescer } from '@/utils/rafCoalesce';
import type { ChannelSummary } from '@shared/types';
import '@/features/paper/paperTheme.css';

const props = defineProps<{
  channelId: string;
  channelName: string;
  serverId: string;
  members: { id: string; name: string; pfp?: string }[];
  channel?: ChannelSummary | null;
  categoryId?: string;
  onOpenChannelSettings?: (payload: {
    channel: ChannelSummary;
    categoryId: string;
  }) => void;
}>();

const authSession = useAuthSessionStore();
const currentUserId = computed(() => authSession.backendUser?.id ?? '');

const channelIdRef = computed(() => props.channelId);
const serverIdRef = computed(() => props.serverId);
const scrollRoot = ref<HTMLElement | null>(null);
const pageEl = ref<HTMLElement | null>(null);
const pageRef = (el: unknown) => {
  pageEl.value = el instanceof HTMLElement ? el : null;
};

const {
  doc,
  loading,
  error,
  conflict,
  save: saveDocument,
  load,
  saving,
} = usePaperDocument(channelIdRef);

const canAuthor = computed(() => doc.value?.canAuthorPaper === true);
const canComment = computed(() => doc.value?.canCommentOnPaper === true);
const canDownload = computed(() => doc.value?.canDownloadPaper === true);
const documentLoaded = computed(() => !loading.value && doc.value != null);
const editorDocVersion = ref(0);
const hasContent = computed(() => doc.value?.contentJson != null);

const paperUi = usePaperUiMode({
  channelId: channelIdRef,
  canAuthor,
  canComment,
});

const paperShare = usePaperShare(channelIdRef, serverIdRef);

const shareForChrome = computed(() => ({
  settings: paperShare.settings.value,
  shareLink: paperShare.shareLink.value,
  saving: paperShare.saving.value,
  loading: paperShare.loading.value,
  error: paperShare.error.value,
  setVisibility: paperShare.setVisibility,
  load: paperShare.load,
}));

const editorMode = computed((): PaperEditorMode => {
  if (paperUi.effectiveMode.value === 'edit' && canAuthor.value)
    return 'author';
  if (paperUi.effectiveMode.value === 'comment' && canComment.value) {
    return 'commenter';
  }
  return 'viewer';
});

const editorEditable = computed(
  () => paperUi.effectiveMode.value === 'edit' && canAuthor.value,
);

const showGutter = computed(
  () => doc.value?.paperShowAuthorGutter === true && doc.value != null,
);
const commentsEnabled = computed(
  () => doc.value?.paperCommentsEnabled !== false,
);

const displayName = computed(
  () =>
    props.members.find((m) => m.id === currentUserId.value)?.name ?? 'Author',
);

const isAuthoring = computed(
  () => paperUi.effectiveMode.value === 'edit' && canAuthor.value,
);

const session = usePaperSession({
  canAuthor,
  saving,
  conflict,
});

const { watchers: socketWatchers } = usePaperWatchers(
  channelIdRef,
  isAuthoring,
);

const imageUpload = usePaperImageUpload(props.channelId);
const paperEditorPanelBridge = usePaperEditorPanelBridge();
const { hideFormatBarWhenEditorPinned } = usePaperEditorPanelPreferences();
const contentJsonRef = computed(() => doc.value?.contentJson ?? null);

const canCustomizeTypography = computed(
  () =>
    canAuthor.value &&
    documentLoaded.value &&
    paperUi.effectiveMode.value === 'edit',
);

const collabBridge = {
  collabEnabled: ref(false),
  isBlockLockedByOther: (_blockId: string) => false,
  onActiveBlockChange: (_blockId: string | null, _prev: string | null) => {},
  getCursors: () =>
    [] as import('@shared/types/paperCollab').PaperRemoteCursor[],
  resolveBlockRange: (_blockId: string) =>
    null as { textFrom: number; textTo: number } | null,
};

const { editor, setContentFromServer, getContentJson, bootstrapFromServer } =
  usePaperEditorState({
    mode: editorMode,
    editable: editorEditable,
    documentLoaded,
    contentJson: contentJsonRef,
    collab: computed(() => ({
      userId: currentUserId.value,
      isCollabActive: () => collabBridge.collabEnabled.value,
      isBlockLockedByOther: collabBridge.isBlockLockedByOther,
      onActiveBlockChange: collabBridge.onActiveBlockChange,
      getCursors: collabBridge.getCursors,
      resolveBlockRange: collabBridge.resolveBlockRange,
    })),
    onUpdate: () => {
      editorDocVersion.value += 1;
    },
    getEditorProps: () => ({
      handlePaste: (_view, event) => {
        const ed = editor.value;
        if (!ed) return false;
        return imageUpload.handlePaste(ed, event);
      },
      handleDrop: (_view, event) => {
        const ed = editor.value;
        if (!ed) return false;
        return imageUpload.handleDrop(ed, event);
      },
    }),
  });

const paperCollab = usePaperCollab({
  channelId: channelIdRef,
  userId: currentUserId,
  displayName,
  canAuthor,
  authoring: isAuthoring,
  editor,
});

collabBridge.collabEnabled = paperCollab.collabEnabled;
collabBridge.isBlockLockedByOther = paperCollab.isBlockLockedByOther;
collabBridge.onActiveBlockChange = paperCollab.onActiveBlockChange;
collabBridge.getCursors = paperCollab.getCursors;
collabBridge.resolveBlockRange = paperCollab.resolveBlockRange;

const appearanceContentJson = computed(() => {
  void editorDocVersion.value;
  const fromEditor = editor.value?.getJSON() as
    | Record<string, unknown>
    | undefined;
  const fromDoc = doc.value?.contentJson as Record<string, unknown> | undefined;
  return fromEditor ?? fromDoc ?? null;
});

const paperPageColors = computed(() =>
  readPaperPageColors(appearanceContentJson.value),
);

const paperPageFontFamily = computed(() =>
  paperFontFamilyCss(readPaperDefaultFont(appearanceContentJson.value)),
);

const paperAppearance = usePaperAppearance({
  channelId: channelIdRef,
  contentJson: appearanceContentJson,
});

const watchingMerged = computed(() =>
  mergePaperWatchingPeers(socketWatchers.value),
);
const watchingPeers = computed(() => watchingMerged.value.peers);
const totalWatching = computed(() => watchingMerged.value.totalWatching);

const showConnectionStatus = computed(() => canAuthor.value);

const autosaveEnabled = computed(
  () => session.autosaveEnabled.value && paperUi.effectiveMode.value === 'edit',
);

const autosave = usePaperAutosave({
  enabled: autosaveEnabled,
  getContentJson,
  save,
});

const commentComposerOpen = ref(false);
const commentsVisible = ref(true);
const showResolvedComments = ref(false);

const connectionBannerDismissed = ref(false);
const lockRequestDismissed = ref(false);
const editorDirty = ref(false);
/** Revision echoed from our own save — skip resetting the editor from server JSON. */
const skipBootstrapRevision = ref<number | null>(null);

const connectionBannerMessage = computed(() => {
  if (!canAuthor.value) return null;
  if (conflict.value) return session.tooltip.value;
  return null;
});

watch(
  () => session.phase.value,
  () => {
    connectionBannerDismissed.value = false;
  },
);

watch(
  () => saving.value,
  (savingNow, wasSaving) => {
    if (wasSaving && !savingNow && !conflict.value) {
      editorDirty.value = false;
    }
  },
);

watch(
  () => paperCollab.lockRequest.value,
  () => {
    lockRequestDismissed.value = false;
  },
);

function onReleaseLockForRequest() {
  paperCollab.releaseMyLocks();
  paperCollab.dismissLockRequest();
  lockRequestDismissed.value = true;
}

function onDismissLockRequest() {
  paperCollab.dismissLockRequest();
  lockRequestDismissed.value = true;
}

function onRequestBlockAccess(blockId: string) {
  paperCollab.requestBlockAccess(blockId);
  const owner = paperCollab.lockOwnerName(blockId);
  dispatchAppToast(
    owner ? `Asked ${owner} to release this paragraph` : 'Access request sent',
    'success',
  );
}

const showLockRequestBanner = computed(
  () =>
    paperCollab.collabEnabled.value &&
    paperCollab.lockRequest.value != null &&
    !lockRequestDismissed.value,
);

const measureBlockLayout = computed(
  () => showGutter.value || (commentsEnabled.value && commentsVisible.value),
);

const { rows, segments, measure } = usePaperAuthorGutter({
  editor,
  scrollRoot,
  enabled: measureBlockLayout,
});

const selectedAuthorSegmentId = ref<string | null>(null);

watch(
  () => props.channelId,
  () => {
    selectedAuthorSegmentId.value = null;
    const ed = editor.value;
    if (ed) clearPaperAuthorSegmentHighlight(ed);
  },
);

function applyServerAttributionToEditor() {
  const ed = editor.value;
  const json = doc.value?.contentJson;
  if (!ed || !json || typeof json !== 'object' || Array.isArray(json)) return;
  syncPaperBlockAttributionFromJson(ed, json as Record<string, unknown>);
  measure();
}

async function save(contentJson: Record<string, unknown>) {
  const ok = await saveDocument(contentJson);
  if (ok && doc.value) {
    skipBootstrapRevision.value = doc.value.revision;
  }
  if (ok) applyServerAttributionToEditor();
  return ok;
}

const { layout: pageLayout, measure: measurePage } = usePaperPageLayout(
  scrollRoot,
  pageEl,
);

const {
  mode: commentLayoutMode,
  stackedBaseTop,
  measure: measureCommentLayout,
} = usePaperCommentLayout(scrollRoot, pageLayout);

const commentsLoadEnabled = computed(
  () => documentLoaded.value && !error.value,
);
const commentsApi = usePaperComments(channelIdRef, commentsLoadEnabled);

const canCommentInMode = computed(
  () =>
    paperUi.effectiveMode.value === 'comment' &&
    canComment.value &&
    commentsEnabled.value &&
    !commentsApi.loadForbidden.value,
);

const pendingComment = ref<{
  anchorBlockId: string;
  anchorFrom: number | null;
  anchorTo: number | null;
  anchorQuote: string;
} | null>(null);
const commentDraft = ref('');
const replyParentId = ref<string | null>(null);

const openCommentCount = computed(
  () =>
    commentsApi.comments.value.filter(
      (c) => !c.resolvedAt && !c.parentCommentId,
    ).length,
);

const composerTop = computed(() => {
  const id = pendingComment.value?.anchorBlockId?.trim();
  if (!id) return null;
  const row = rows.value.find((r) => r.paperBlockId === id);
  return row?.top ?? null;
});

const toastMessage = computed(() => {
  if (editorMode.value === 'viewer') {
    return 'You can view this document but cannot edit it.';
  }
  if (editorMode.value === 'commenter') {
    return 'You can add comments on the document. Select text and choose Comment.';
  }
  return null;
});

const toastTone = computed(() => {
  if (editorMode.value === 'viewer' || editorMode.value === 'commenter') {
    return 'info' as const;
  }
  return 'info' as const;
});

const showToast = ref(true);

const toastPersist = computed(() => false);

watch(
  () => editor.value,
  (ed, _prev, onCleanup) => {
    if (!ed) return;
    const scheduleLayout = createRafCoalescer(() => {
      measurePage();
      measureCommentLayout();
    });
    const onDocUpdate = () => {
      editorDocVersion.value += 1;
      editorDirty.value = true;
      measure();
      scheduleLayout();
      if (session.autosaveEnabled.value) autosave.schedule();
    };
    ed.on('update', onDocUpdate);
    onCleanup(() => {
      ed.off('update', onDocUpdate);
    });
  },
);

watch(
  () => props.channelId,
  () => {
    editorDirty.value = false;
    skipBootstrapRevision.value = null;
  },
);

watch(
  () => doc.value?.revision,
  (revision) => {
    if (revision == null || !documentLoaded.value) return;
    if (editorDirty.value) return;
    if (skipBootstrapRevision.value === revision) {
      skipBootstrapRevision.value = null;
      applyServerAttributionToEditor();
      measurePage();
      return;
    }
    bootstrapFromServer();
    applyServerAttributionToEditor();
    measurePage();
  },
);

watch(rows, () => {
  measurePage();
  measureCommentLayout();
});
watch(pageEl, () => {
  measurePage();
  measureCommentLayout();
});

function onReloadAfterConflict() {
  connectionBannerDismissed.value = false;
  void load();
}

function onPaperPageColorLight(hex: string) {
  const ed = editor.value;
  if (!ed) return;
  ed.commands.setPaperPageColorLight(hex);
  autosave.schedule();
}

function onPaperPageColorDark(hex: string) {
  const ed = editor.value;
  if (!ed) return;
  ed.commands.setPaperPageColorDark(hex);
  autosave.schedule();
}

async function onDocumentFontChange(fontId: string) {
  const font = PAPER_FONT_CATALOG.find((f) => f.id === fontId);
  const ed = editor.value;
  if (
    !font ||
    !ed ||
    paperUi.effectiveMode.value !== 'edit' ||
    !canAuthor.value
  ) {
    return;
  }
  await ensurePaperFontLoaded(font.id);
  ed.chain().focus().setPaperDefaultFont(font.family).run();
  autosave.schedule();
}

function onDownloadPdf() {
  const ok = printPaperPage(pageEl.value, props.channelName);
  if (!ok) {
    dispatchAppToast('Document is still loading', 'warning');
  }
}

function onDownloadJson() {
  const json = getContentJson();
  if (!json) return;
  downloadPaperJson(props.channelName, json);
}

async function onCopyPlainText() {
  const text = copyPaperPlainText(editor.value);
  if (!text) return;
  const ok = await copyToClipboard(text);
  dispatchAppToast(
    ok ? 'Copied document text' : 'Could not copy',
    ok ? 'success' : 'warning',
  );
}

const chromeViewHint = computed(() => {
  if (!documentLoaded.value) return undefined;
  if (paperUi.effectiveMode.value === 'view') {
    return canAuthor.value || canComment.value
      ? 'Viewing — switch mode to edit or comment'
      : 'View only';
  }
  if (paperUi.effectiveMode.value === 'comment') {
    return 'Commenting — select text to add a comment';
  }
  return undefined;
});

const userNameById = computed(() => {
  const map = new Map<string, string>();
  for (const member of props.members) {
    const id = member.id?.trim();
    const name = member.name?.trim();
    if (id && name) map.set(id, name);
  }
  for (const peer of watchingPeers.value) {
    const id = peer.userId?.trim();
    const name = peer.name?.trim();
    if (id && name) map.set(id, name);
  }
  const me = currentUserId.value.trim();
  if (me && displayName.value.trim()) {
    map.set(me, displayName.value.trim());
  }
  return map;
});

function resolveUserName(userId: string) {
  const id = userId.trim();
  if (!id) return '';
  return userNameById.value.get(id) ?? id.slice(0, 8);
}

function resolveUserAvatar(userId: string) {
  const id = userId.trim();
  if (!id) return undefined;
  return props.members.find((m) => m.id === id)?.pfp;
}

function openCommentComposer(anchor?: {
  anchorBlockId: string;
  anchorFrom: number | null;
  anchorTo: number | null;
  anchorQuote: string;
}) {
  commentsVisible.value = true;
  commentComposerOpen.value = true;
  if (anchor) pendingComment.value = anchor;
  replyParentId.value = null;
  commentDraft.value = '';
}

function startCommentOnSelection() {
  if (!canCommentInMode.value) return;
  const ed = editor.value;
  if (!ed) return;
  const anchor = getPaperSelectionAnchor(ed);
  if (!anchor?.anchorBlockId) {
    dispatchAppToast(
      'Place the cursor in a paragraph or heading to comment',
      'warning',
    );
    return;
  }
  openCommentComposer({
    anchorBlockId: anchor.anchorBlockId,
    anchorFrom: anchor.anchorFrom,
    anchorTo: anchor.anchorTo,
    anchorQuote: anchor.anchorQuote,
  });
}

async function submitComment() {
  const body = commentDraft.value.trim();
  if (!body) return;
  const anchor =
    pendingComment.value ??
    (editor.value ? getPaperSelectionAnchor(editor.value) : null);
  const blockId = anchor?.anchorBlockId?.trim() ?? '';
  if (!blockId && !replyParentId.value) {
    dispatchAppToast(
      'Select text in the document to anchor this comment',
      'warning',
    );
    return;
  }
  try {
    await commentsApi.addComment({
      anchorBlockId: blockId,
      anchorFrom: anchor?.anchorFrom ?? null,
      anchorTo: anchor?.anchorTo ?? null,
      anchorQuote: anchor?.anchorQuote ?? '',
      body,
      parentCommentId: replyParentId.value,
    });
    commentDraft.value = '';
    pendingComment.value = null;
    replyParentId.value = null;
    commentComposerOpen.value = false;
    measure();
  } catch (e) {
    dispatchAppToast(
      e instanceof Error ? e.message : 'Could not post comment',
      'warning',
    );
  }
}

watch(
  () => paperUi.effectiveMode.value,
  (mode) => {
    if (mode === 'comment' && commentsEnabled.value) {
      commentsVisible.value = true;
    }
  },
);

function onReply(parentId: string) {
  replyParentId.value = parentId;
  pendingComment.value = null;
  commentDraft.value = '';
  commentComposerOpen.value = true;
  commentsVisible.value = true;
}

function scrollDomBlockIntoView(
  ed: NonNullable<typeof editor.value>,
  paperBlockId: string,
) {
  let targetPos: number | null = null;
  ed.state.doc.descendants((node, pos) => {
    if (targetPos != null) return false;
    if (String(node.attrs.paperBlockId ?? '').trim() === paperBlockId.trim()) {
      targetPos = pos;
      return false;
    }
  });
  if (targetPos == null) return;
  const dom = ed.view.nodeDOM(targetPos);
  if (dom instanceof HTMLElement) {
    dom.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function scrollToBlock(paperBlockId: string) {
  const ed = editor.value;
  if (!ed) return;
  let targetPos: number | null = null;
  ed.state.doc.descendants((node, pos) => {
    if (targetPos != null) return false;
    if (String(node.attrs.paperBlockId ?? '').trim() === paperBlockId.trim()) {
      targetPos = pos;
      return false;
    }
  });
  if (targetPos == null) return;
  ed.chain()
    .focus()
    .setTextSelection(targetPos + 1)
    .run();
  scrollDomBlockIntoView(ed, paperBlockId);
  flashPaperBlockHighlight(ed, paperBlockId);
}

function onSelectAuthorSegment(segment: PaperAuthorSegment) {
  const ed = editor.value;
  if (!ed) return;
  if (selectedAuthorSegmentId.value === segment.segmentId) {
    selectedAuthorSegmentId.value = null;
    clearPaperAuthorSegmentHighlight(ed);
    return;
  }
  selectedAuthorSegmentId.value = segment.segmentId;
  const firstId = segment.paperBlockIds[0];
  if (firstId) scrollDomBlockIntoView(ed, firstId);
  setPaperAuthorSegmentHighlight(ed, segment.paperBlockIds);
}

function openChannelSettings() {
  const ch = props.channel;
  const categoryId = props.categoryId?.trim() ?? '';
  if (!ch || !categoryId || !props.onOpenChannelSettings) return;
  props.onOpenChannelSettings({ channel: ch, categoryId });
}

function toggleCommentsVisible() {
  commentsVisible.value = !commentsVisible.value;
}

const bridgeContentJson = computed(() => {
  void editorDocVersion.value;
  const fromEditor = editor.value?.getJSON() as
    | Record<string, unknown>
    | undefined;
  return (fromEditor ?? doc.value?.contentJson ?? null) as
    | Record<string, unknown>
    | null
    | undefined;
});

const bridgePageColorLight = computed(() => paperPageColors.value.light);
const bridgePageColorDark = computed(() => paperPageColors.value.dark);

watchEffect((onCleanup) => {
  if (!documentLoaded.value) return;
  paperEditorPanelBridge.register({
    channelId: props.channelId,
    channelName: props.channelName,
    editor,
    appearance: paperAppearance.appearance,
    canCustomize: canCustomizeTypography,
    editorEditable,
    paperPageColorLight: bridgePageColorLight,
    paperPageColorDark: bridgePageColorDark,
    documentFontFamily: paperPageFontFamily,
    contentJson: bridgeContentJson,
    imageUpload,
    onPageColorLight: onPaperPageColorLight,
    onPageColorDark: onPaperPageColorDark,
    onDocumentFontChange,
    toggleAppearance: () => paperAppearance.toggleAppearance(),
    onScrollToBlock: scrollToBlock,
  });
  onCleanup(() => {
    paperEditorPanelBridge.unregister(props.channelId);
  });
});

let unsubDoc: (() => void) | null = null;
let unsubComment: (() => void) | null = null;

onMounted(() => {
  preloadPaperFontCatalog();
  void import('katex/dist/katex.min.css');
  unsubDoc = onPaperDocumentUpdated((remote) => {
    if (remote.channelId !== props.channelId) return;
    const prevRevision = doc.value?.revision ?? 0;
    if (remote.revision === prevRevision) return;
    doc.value = remote;
    if (
      remote.contentJson &&
      remote.revision > prevRevision &&
      !editorDirty.value
    ) {
      setContentFromServer(remote.contentJson as Record<string, unknown>);
      applyServerAttributionToEditor();
      measurePage();
    }
  });
  unsubComment = onPaperCommentUpdated((evt) => {
    if (evt.channelId !== props.channelId) return;
    if (evt.action === 'deleted' && 'id' in evt.comment) {
      commentsApi.comments.value = commentsApi.comments.value.filter(
        (c) => c.id !== evt.comment.id && c.parentCommentId !== evt.comment.id,
      );
      measure();
      return;
    }
    if ('body' in evt.comment) {
      commentsApi.applyRemote(evt.comment, evt.action);
      measure();
    }
  });
});

onUnmounted(() => {
  unsubDoc?.();
  unsubComment?.();
  autosave.flush();
  paperCollab.releaseMyLocks();
});
</script>

<template>
  <div
    class="paper-root flex h-full min-h-0 flex-col"
    :data-paper-appearance="paperAppearance.appearance.value"
  >
    <PaperToast
      v-if="showToast && toastMessage"
      class="paper-toast-layer"
      :message="toastMessage"
      :tone="toastTone"
      :persist="toastPersist"
      @dismiss="showToast = false"
    />

    <div
      v-if="error && !documentLoaded"
      class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center paper-workspace"
    >
      <p class="text-sm text-red-400">{{ error }}</p>
      <button
        type="button"
        class="rounded-lg border border-border bg-elevated px-4 py-2 text-sm text-fg hover:bg-glass-hover"
        @click="load()"
      >
        Retry
      </button>
    </div>

    <template v-else>
      <div
        ref="scrollRoot"
        class="paper-scroll-root relative min-h-0 flex-1 overflow-y-auto"
      >
        <div class="paper-chrome-stack sticky top-0 z-30">
          <PaperDocChrome
            :paper-appearance="paperAppearance.appearance.value"
            :channel-name="channelName"
            :connection-phase="session.phase.value"
            :connection-tooltip="session.tooltip.value"
            :conflict="conflict"
            :watching-peers="watchingPeers"
            :total-watching="totalWatching"
            :editor="editor"
            :ui-mode="paperUi.effectiveMode.value"
            :mode-label="paperUi.modeLabel.value"
            :mode-options="paperUi.modeOptions.value"
            :share="shareForChrome"
            :resolve-user-avatar="resolveUserAvatar"
            :view-only-hint="chromeViewHint"
            :can-open-settings="
              !!onOpenChannelSettings && !!channel && !!categoryId?.trim()
            "
            :can-customize-typography="
              canAuthor &&
              documentLoaded &&
              paperUi.effectiveMode.value === 'edit'
            "
            :can-download="canDownload"
            :paper-page-color-light="paperPageColors.light"
            :paper-page-color-dark="paperPageColors.dark"
            :document-font-family="paperPageFontFamily"
            :comment-count="openCommentCount"
            :comments-visible="commentsVisible"
            :can-toggle-comments="commentsEnabled"
            :can-reconnect="conflict"
            :show-connection-status="showConnectionStatus"
            @open-settings="openChannelSettings"
            @toggle-comments="toggleCommentsVisible"
            @reconnect="onReloadAfterConflict"
            @document-font-change="onDocumentFontChange"
            @set-ui-mode="paperUi.setMode"
            @download-pdf="onDownloadPdf"
            @download-json="onDownloadJson"
            @copy-plain-text="onCopyPlainText"
            @toggle-paper-appearance="paperAppearance.toggleAppearance()"
            @paper-page-color-light="onPaperPageColorLight"
            @paper-page-color-dark="onPaperPageColorDark"
          />
          <div
            v-if="connectionBannerMessage && !connectionBannerDismissed"
            class="paper-connection-banner-wrap px-3 pb-2"
          >
            <PaperConnectionBanner
              :message="connectionBannerMessage"
              :can-reconnect="conflict"
              @reconnect="onReloadAfterConflict"
              @dismiss="connectionBannerDismissed = true"
            />
          </div>
          <div
            v-if="showLockRequestBanner && paperCollab.lockRequest.value"
            class="paper-connection-banner-wrap px-3 pb-2"
          >
            <PaperLockRequestBanner
              :from-display-name="paperCollab.lockRequest.value.fromDisplayName"
              @release="onReleaseLockForRequest"
              @dismiss="onDismissLockRequest"
            />
          </div>
        </div>

        <div
          class="relative mx-auto flex min-h-full max-w-[816px] justify-center"
        >
          <PaperPageCanvas
            :editor="editor"
            :loading="loading"
            :page-ref="pageRef"
            :document-font-family="paperPageFontFamily"
            :page-surface-style="paperAppearance.pageSurfaceStyle.value"
          >
            <PaperBubbleMenu
              :editor="editor"
              :can-author="editorEditable"
              :can-comment="
                paperUi.effectiveMode.value === 'comment' &&
                canComment &&
                commentsEnabled
              "
              :collab-active="paperCollab.collabEnabled.value"
              :lock-owner-name="
                paperCollab.collabEnabled.value
                  ? (id) => paperCollab.lockOwnerName(id)
                  : undefined
              "
              @comment="startCommentOnSelection"
              @request-access="onRequestBlockAccess"
            />
          </PaperPageCanvas>

          <PaperAuthorGutter
            v-if="showGutter && !loading"
            class="paper-gutter-overlay absolute left-0 top-0 z-10"
            :segments="segments"
            :selected-segment-id="selectedAuthorSegmentId"
            :resolve-user-name="resolveUserName"
            :resolve-user-avatar="resolveUserAvatar"
            :lock-owner-name="
              paperCollab.collabEnabled.value
                ? (id) => paperCollab.lockOwnerName(id)
                : undefined
            "
            @select-segment="onSelectAuthorSegment"
          />
        </div>

        <PaperFloatingComments
          v-if="commentsEnabled && commentsVisible && !loading"
          :comments="commentsApi.topLevel.value"
          :replies-for="commentsApi.repliesFor"
          :gutter-rows="rows"
          :page-layout="pageLayout"
          :layout-mode="commentLayoutMode"
          :stacked-base-top="stackedBaseTop"
          :show-resolved="showResolvedComments"
          :resolve-user-name="resolveUserName"
          :resolve-user-avatar="resolveUserAvatar"
          :can-comment="canCommentInMode"
          :can-manage="doc?.canManagePaperComments === true"
          :current-user-id="currentUserId"
          :composer-open="commentComposerOpen"
          :comment-draft="commentDraft"
          :pending-quote="pendingComment?.anchorQuote ?? ''"
          :reply-parent-id="replyParentId"
          :composer-top="composerTop"
          @update:comment-draft="commentDraft = $event"
          @update:composer-open="commentComposerOpen = $event"
          @submit="submitComment"
          @resolve="(id, r) => commentsApi.resolveComment(id, r)"
          @delete="(id) => commentsApi.removeComment(id)"
          @reply="onReply"
          @scroll-to-block="scrollToBlock"
        />
      </div>

      <PaperFloatingFormatBar
        v-if="
          editorEditable &&
          !(
            hideFormatBarWhenEditorPinned &&
            paperEditorPanelBridge.panelPinned.value
          )
        "
        :editor="editor"
        :image-upload="imageUpload"
        :visible="!!editor"
        :page-layout="pageLayout"
        :paper-appearance="paperAppearance.appearance.value"
      />
    </template>
  </div>
</template>

<style scoped>
.paper-root {
  background: var(--paper-workspace-bg);
}

.paper-scroll-root {
  background: var(--paper-workspace-bg);
}

.paper-chrome-stack {
  background: var(--paper-chrome-bg);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  overflow: visible;
}

.paper-connection-banner-wrap {
  border-bottom: 1px solid color-mix(in srgb, var(--border) 35%, transparent);
  background: var(--paper-chrome-bg);
}

.paper-toast-layer {
  position: absolute;
  top: 3.25rem;
  left: 50%;
  z-index: 25;
  transform: translateX(-50%);
  pointer-events: none;
}

.paper-toast-layer :deep(*) {
  pointer-events: auto;
}

.paper-gutter-overlay {
  width: 3rem;
  transform: translateX(-100%);
  margin-left: 0;
}

:deep(.paper-editor-image) {
  max-width: 100%;
  height: auto;
  border-radius: 0.375rem;
  margin: 0.75rem 0;
}

:deep(.paper-math-source) {
  font-size: 0;
  line-height: 0;
  opacity: 0.25;
}

:deep(.paper-math--display) {
  display: block;
  margin: 0.75rem 0;
  overflow-x: auto;
}

:deep(.paper-math--inline) {
  display: inline-block;
  vertical-align: middle;
  margin: 0 0.1em;
}

:deep(.paper-collab-cursor) {
  position: relative;
  display: inline-block;
  width: 0;
  border-left: 2px solid;
  margin-left: -1px;
  pointer-events: none;
}
</style>
