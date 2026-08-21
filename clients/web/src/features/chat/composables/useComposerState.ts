import {
  computed,
  onUnmounted,
  ref,
  shallowRef,
  unref,
  watch,
  type ComputedRef,
  type Ref,
} from 'vue';
import { Editor, type Extensions } from '@tiptap/core';
import { Selection } from '@tiptap/pm/state';
import HardBreak from '@tiptap/extension-hard-break';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import type { MentionEntity, MentionKind } from '@shared/types';
import type { IdTokenResolvers } from '@/features/chat/markdown/useMarkdown';
import {
  AppIconNode,
  buildComposerDoc,
  buildComposerDocFromPlain,
  ChannelMentionNode,
  CustomEmojiNode,
  ImageSlotNode,
  ButtonRowNode,
  insertImageSlotInEditor,
  insertButtonRowInEditor,
  MentionEntityNode,
  isComposerContentEffectivelyEmpty,
  rawOffsetToEditorPos,
  serializeComposerDoc,
  composerSelectionToRawOffsets,
} from '@/features/chat/editor/composerModel';
import {
  ComposerBold,
  ComposerCode,
  ComposerItalic,
  ComposerStrike,
} from '@/features/chat/editor/composerTextualMarks';
import {
  ComposerMarkdownDecorations,
  composerMarkdownDecoKey,
} from '@/features/chat/editor/composerMarkdownDecorations';
import {
  replaceRangeTransform,
  insertMentionTransform,
  insertChannelMentionTransform,
  wrapSelectionTransform,
} from '@/features/chat/domain/composer';
import { channelMentionRefLabel } from '@/features/chat/composables/channelMentionLabel';
import { ECHO_COMPOSER_MAX_INPUT_CHARS } from '@shared/messageChunkLimits';
import { createRafCoalescer } from '@/features/chat/markdown/rafCoalesce';

export interface ComposerMentionInsert {
  kind: MentionKind;
  label: string;
  userId?: string;
  channelId?: string;
  roleId?: string;
}

export type ComposerSnapshot = {
  content: string;
  mentions: MentionEntity[];
  contentJson?: Record<string, unknown> | null;
};

type KeydownHandler = (event: KeyboardEvent) => boolean;

type SerializedComposer = {
  content: string;
  mentions: MentionEntity[];
  selectionStart: number;
  selectionEnd: number;
};

function mentionsEqual(a: MentionEntity[], b: MentionEntity[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.id !== y.id ||
      x.kind !== y.kind ||
      x.label !== y.label ||
      x.start !== y.start ||
      x.end !== y.end ||
      x.userId !== y.userId ||
      x.channelId !== y.channelId ||
      x.roleId !== y.roleId
    ) {
      return false;
    }
  }
  return true;
}

export function useComposerState(
  overlayIdTokenResolvers?:
    | Ref<IdTokenResolvers | undefined>
    | ComputedRef<IdTokenResolvers | undefined>,
) {
  const content = ref('');
  const mentions = ref<MentionEntity[]>([]);
  const selectionStart = ref(0);
  const selectionEnd = ref(0);
  const editor = shallowRef<Editor | null>(null);
  const surfaceRef = ref<HTMLElement | null>(null);
  const keydownHandler = ref<KeydownHandler | null>(null);
  let pendingSerialized: SerializedComposer | null = null;
  let scheduleVueSync: (() => void) | null = null;
  /** When PM caret sits inside a UTF-16 surrogate, serialized selection can lag raw tail. */
  let selectionRawOverride: { start: number; end: number } | null = null;

  function clearSelectionRawOverride() {
    selectionRawOverride = null;
  }

  function getResolvers(): IdTokenResolvers | undefined {
    return overlayIdTokenResolvers ? unref(overlayIdTokenResolvers) : undefined;
  }

  function applySerialized(serialized: SerializedComposer) {
    if (content.value !== serialized.content) {
      content.value = serialized.content;
    }
    if (!mentionsEqual(mentions.value, serialized.mentions)) {
      mentions.value = serialized.mentions;
    }
    if (selectionStart.value !== serialized.selectionStart) {
      selectionStart.value = serialized.selectionStart;
    }
    if (selectionEnd.value !== serialized.selectionEnd) {
      selectionEnd.value = serialized.selectionEnd;
    }
  }

  function flushVueSync() {
    if (pendingSerialized) {
      applySerialized(pendingSerialized);
      pendingSerialized = null;
    }
  }

  /** Read the TipTap doc directly — Vue refs can lag one rAF behind editor input. */
  function getLiveSerialized(nextEditor = editor.value): SerializedComposer {
    if (!nextEditor) {
      return {
        content: content.value,
        mentions: mentions.value,
        selectionStart: selectionStart.value,
        selectionEnd: selectionEnd.value,
      };
    }
    const serialized = serializeComposerDoc(
      nextEditor.state.doc,
      nextEditor.state.selection,
    );
    if (selectionRawOverride) {
      return {
        ...serialized,
        selectionStart: selectionRawOverride.start,
        selectionEnd: selectionRawOverride.end,
      };
    }
    return serialized;
  }

  function syncFromEditor(nextEditor = editor.value) {
    if (!nextEditor) return;
    const serialized = serializeComposerDoc(
      nextEditor.state.doc,
      nextEditor.state.selection,
    );
    applySerialized(serialized);
  }

  function scheduleSyncFromEditor(nextEditor = editor.value) {
    if (!nextEditor) return;
    pendingSerialized = serializeComposerDoc(
      nextEditor.state.doc,
      nextEditor.state.selection,
    );
    scheduleVueSync?.();
  }

  /** Selection-only sync — avoids re-walking the doc for content/mentions on caret moves. */
  function syncSelectionFromEditor(nextEditor = editor.value) {
    if (!nextEditor) return;
    const { from, to } = nextEditor.state.selection;
    const raw = composerSelectionToRawOffsets(nextEditor.state.doc, {
      from,
      to,
    });
    if (
      raw.selectionStart === selectionStart.value &&
      raw.selectionEnd === selectionEnd.value
    ) {
      return;
    }
    selectionStart.value = raw.selectionStart;
    selectionEnd.value = raw.selectionEnd;
  }

  function handleEditorTransaction(
    updatedEditor: Editor,
    docChanged: boolean,
    selectionSet: boolean,
  ) {
    if (docChanged) {
      clearSelectionRawOverride();
      const serialized = serializeComposerDoc(
        updatedEditor.state.doc,
        updatedEditor.state.selection,
      );
      if (isComposerContentEffectivelyEmpty(serialized.content)) {
        const canonicalJson = JSON.stringify(
          buildComposerDoc('', [], getResolvers()),
        );
        const currentJson = JSON.stringify(updatedEditor.getJSON());
        const needsReset =
          serialized.content.length > 0 ||
          serialized.mentions.length > 0 ||
          currentJson !== canonicalJson;
        if (needsReset) {
          flushVueSync();
          setSerializedState('', [], 0, 0);
          return;
        }
      }
      if (serialized.content.length > ECHO_COMPOSER_MAX_INPUT_CHARS) {
        flushVueSync();
        const cut = serialized.content.slice(0, ECHO_COMPOSER_MAX_INPUT_CHARS);
        const kept = serialized.mentions.filter((m) => m.end <= cut.length);
        const end = cut.length;
        setSerializedState(cut, kept, end, end);
        return;
      }
      pendingSerialized = serialized;
      scheduleVueSync?.();
      return;
    }
    if (selectionSet) {
      clearSelectionRawOverride();
      syncSelectionFromEditor(updatedEditor);
    }
  }

  function setSerializedState(
    nextContent: string,
    nextMentions: MentionEntity[],
    nextSelectionStart = nextContent.length,
    nextSelectionEnd = nextSelectionStart,
  ) {
    const nextEditor = editor.value;
    if (!nextEditor) return;
    // Drop any queued rAF editor sync — otherwise a stale pending snapshot can
    // overwrite programmatic updates (e.g. channel message format rehydration).
    pendingSerialized = null;
    clearSelectionRawOverride();
    const priorDoc = nextEditor.getJSON();
    const doc = buildComposerDocFromPlain(
      nextContent,
      nextMentions,
      getResolvers(),
      priorDoc,
    );
    nextEditor.commands.setContent(doc, { emitUpdate: false });
    const pmDoc = nextEditor.state.doc;
    const contentEnd = nextContent.length;
    if (nextSelectionStart === contentEnd && nextSelectionEnd === contentEnd) {
      // setTextSelection can land inside UTF-16 surrogate pairs; atEnd is stable.
      nextEditor.view.dispatch(
        nextEditor.state.tr.setSelection(Selection.atEnd(pmDoc)),
      );
    } else {
      const from = rawOffsetToEditorPos(pmDoc, nextSelectionStart);
      const to = rawOffsetToEditorPos(pmDoc, nextSelectionEnd);
      nextEditor.commands.setTextSelection({ from, to });
    }
    syncFromEditor(nextEditor);
    if (
      nextSelectionStart === contentEnd &&
      nextSelectionEnd === contentEnd &&
      selectionStart.value !== contentEnd
    ) {
      selectionRawOverride = {
        start: contentEnd,
        end: contentEnd,
      };
      selectionStart.value = contentEnd;
      selectionEnd.value = contentEnd;
    }
  }

  scheduleVueSync = createRafCoalescer(flushVueSync);

  const initialEditor = new Editor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bold: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        hardBreak: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        orderedList: false,
        listItem: false,
        strike: false,
      }),
      ComposerBold,
      ComposerItalic,
      ComposerStrike,
      ComposerCode,
      HardBreak,
      Placeholder.configure({ placeholder: '' }),
      MentionEntityNode,
      ChannelMentionNode,
      CustomEmojiNode,
      AppIconNode,
      ImageSlotNode,
      ButtonRowNode,
      ComposerMarkdownDecorations,
    ] satisfies Extensions,
    content: buildComposerDoc('', [], getResolvers()),
    editorProps: {
      attributes: {
        class: 'chat-input-editor-surface',
      },
      handleKeyDown: (_view, event) => keydownHandler.value?.(event) ?? false,
    },
    onCreate: ({ editor: createdEditor }) => {
      editor.value = createdEditor;
      syncFromEditor(createdEditor);
    },
    onTransaction: ({ editor: updatedEditor, transaction }) => {
      handleEditorTransaction(
        updatedEditor,
        transaction.docChanged,
        transaction.selectionSet,
      );
    },
  });

  editor.value = initialEditor;
  syncFromEditor(initialEditor);

  watch(
    () => getResolvers(),
    () => {
      setSerializedState(
        content.value,
        mentions.value,
        selectionStart.value,
        selectionEnd.value,
      );
    },
  );

  onUnmounted(() => {
    flushVueSync();
    editor.value?.destroy();
    editor.value = null;
  });

  function getSelectionStart(): number {
    return getLiveSerialized().selectionStart;
  }

  function getSelectionEnd(): number {
    return getLiveSerialized().selectionEnd;
  }

  function setSelection(start: number, end = start) {
    const live = getLiveSerialized();
    setSerializedState(live.content, live.mentions, start, end);
  }

  function resizeTextarea() {
    /* Editor surface grows naturally with CSS. */
  }

  function syncOverlayScroll() {
    /* Legacy no-op: preview sync reads directly from the editor surface. */
  }

  function focus() {
    editor.value?.commands.focus();
  }

  function setEditable(editable: boolean) {
    editor.value?.setEditable(editable);
  }

  function replaceRange(start: number, end: number, text: string) {
    const live = getLiveSerialized();
    const { nextContent, nextMentions, nextSelectionStart } =
      replaceRangeTransform(live.content, live.mentions, start, end, text);
    setSerializedState(
      nextContent,
      nextMentions,
      nextSelectionStart,
      nextSelectionStart,
    );
  }

  function insertText(text: string) {
    replaceRange(getSelectionStart(), getSelectionEnd(), text);
  }

  function insertMention(
    start: number,
    end: number,
    mention: ComposerMentionInsert,
  ) {
    const live = getLiveSerialized();
    const { nextContent, nextMentions, nextSelectionStart } =
      insertMentionTransform(
        live.content,
        live.mentions,
        start,
        end,
        mention.kind,
        mention.label,
        mention.userId,
        mention.channelId,
        mention.roleId,
      );
    setSerializedState(
      nextContent,
      nextMentions,
      nextSelectionStart,
      nextSelectionStart,
    );
  }

  function insertChannelMention(
    start: number,
    end: number,
    channel: { id: string; name: string },
  ) {
    const live = getLiveSerialized();
    const { nextContent, nextMentions, nextSelectionStart } =
      insertChannelMentionTransform(
        live.content,
        live.mentions,
        start,
        end,
        channelMentionRefLabel(channel.name),
        channel.id,
      );
    setSerializedState(
      nextContent,
      nextMentions,
      nextSelectionStart,
      nextSelectionStart,
    );
  }

  function wrapSelection(prefix: string, suffix = prefix) {
    const live = getLiveSerialized();
    const start = live.selectionStart;
    const end = live.selectionEnd;
    const res = wrapSelectionTransform(
      live.content,
      live.mentions,
      start,
      end,
      prefix,
      suffix,
    );
    if (!res) return;
    setSerializedState(
      res.nextContent,
      res.nextMentions,
      res.nextSelectionStart,
      res.nextSelectionEnd,
    );
  }

  function handleAtomicMentionKeydown(_event: KeyboardEvent): boolean {
    return false;
  }

  function registerKeydownHandler(handler: KeydownHandler | null) {
    keydownHandler.value = handler;
  }

  function clear() {
    setSerializedState('', [], 0);
  }

  function captureSnapshot(): ComposerSnapshot {
    flushVueSync();
    const ed = editor.value;
    return {
      content: content.value,
      mentions: mentions.value.map((m) => ({ ...m })),
      ...(ed ? { contentJson: ed.getJSON() as Record<string, unknown> } : {}),
    };
  }

  function restoreSnapshot(snapshot: ComposerSnapshot) {
    const nextEditor = editor.value;
    if (!nextEditor) return;
    pendingSerialized = null;
    clearSelectionRawOverride();
    if (snapshot.contentJson && typeof snapshot.contentJson === 'object') {
      nextEditor.commands.setContent(snapshot.contentJson, {
        emitUpdate: false,
      });
      syncFromEditor(nextEditor);
      const end = content.value.length;
      nextEditor.view.dispatch(
        nextEditor.state.tr.setSelection(Selection.atEnd(nextEditor.state.doc)),
      );
      selectionStart.value = end;
      selectionEnd.value = end;
      return;
    }
    const end = snapshot.content.length;
    setSerializedState(snapshot.content, snapshot.mentions, end, end);
  }

  /** compact: mute delimiters + style inside `**` / `` ` `` etc. (single document, no HTML overlay). */
  function setMarkdownDecorationsEnabled(enabled: boolean) {
    const ed = editor.value;
    if (!ed) return;
    ed.view.dispatch(ed.state.tr.setMeta(composerMarkdownDecoKey, { enabled }));
  }

  /** TipTap JSON for socket/API v2 body (text-only sends). */
  function getContentJson(): Record<string, unknown> | null {
    const ed = editor.value;
    if (!ed) return null;
    return ed.getJSON() as Record<string, unknown>;
  }

  function insertImageSlot(aspectW: number, aspectH: number) {
    const ed = editor.value;
    if (!ed) return;
    insertImageSlotInEditor(ed, aspectW, aspectH);
  }

  function insertButtonRow(
    buttons: import('@shared/buttonRow').ButtonRowButton[],
  ) {
    const ed = editor.value;
    if (!ed) return;
    insertButtonRowInEditor(ed, buttons);
  }

  function getContent(): string {
    return getLiveSerialized().content;
  }

  const overlayHtml = computed(() => '');
  const segments = computed(() => []);

  return {
    content,
    mentions,
    selectionStart,
    selectionEnd,
    editor,
    surfaceRef,
    overlayHtml,
    segments,
    textareaRef: surfaceRef,
    overlayRef: ref<HTMLDivElement | null>(null),
    getSelectionStart,
    getSelectionEnd,
    getContent,
    setSelection,
    resizeTextarea,
    syncOverlayScroll,
    focus,
    setEditable,
    replaceRange,
    insertText,
    insertMention,
    insertChannelMention,
    wrapSelection,
    handleTextareaInput: (_nextValue: string) => {},
    handleAtomicMentionKeydown,
    registerKeydownHandler,
    clear,
    captureSnapshot,
    restoreSnapshot,
    getContentJson,
    insertImageSlot,
    insertButtonRow,
    setMarkdownDecorationsEnabled,
    setSerializedState,
    /** Apply any pending rAF content sync before send/draft reads. */
    flushComposerSync: flushVueSync,
  };
}
