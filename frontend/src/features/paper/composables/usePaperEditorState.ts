import { onUnmounted, shallowRef, watch, type Ref } from 'vue';
import { Editor, type EditorOptions } from '@tiptap/vue-3';
import { buildPaperEditorExtensions } from '@/features/paper/editor/paperEditorExtensions';
import type { PaperRemoteCursor } from '@shared/types/paperCollab';
import { createEmptyPaperContentJson } from '@shared/types/paperEmptyDocument';

export type PaperEditorMode = 'author' | 'commenter' | 'viewer';

export type PaperEditorCollabOpts = {
  userId: string;
  isCollabActive: () => boolean;
  isBlockLockedByOther: (blockId: string) => boolean;
  onActiveBlockChange: (
    blockId: string | null,
    prevBlockId: string | null,
  ) => void;
  getCursors: () => PaperRemoteCursor[];
  resolveBlockRange: (
    blockId: string,
  ) => { textFrom: number; textTo: number } | null;
};

export function usePaperEditorState(opts: {
  mode: Ref<PaperEditorMode>;
  editable: Ref<boolean>;
  documentLoaded: Ref<boolean>;
  contentJson: Ref<Record<string, unknown> | null | undefined>;
  collab?: Ref<PaperEditorCollabOpts | null>;
  onUpdate?: (contentJson: Record<string, unknown>) => void;
  onEditorActivity?: () => void;
  getEditorProps?: () => Partial<EditorOptions['editorProps']>;
}) {
  const editor = shallowRef<Editor | null>(null);
  let instance: Editor | null = null;

  function collabOpts(): PaperEditorCollabOpts | null {
    return opts.collab?.value ?? null;
  }

  function mountEditor(content?: Record<string, unknown> | null) {
    if (instance) return;
    const c = collabOpts();
    instance = new Editor({
      extensions: buildPaperEditorExtensions({
        blockLock: c
          ? {
              userId: c.userId,
              isCollabActive: c.isCollabActive,
              isBlockLockedByOther: c.isBlockLockedByOther,
              onActiveBlockChange: c.onActiveBlockChange,
            }
          : null,
        remoteCursors: c
          ? {
              getCursors: c.getCursors,
              localUserId: c.userId,
              resolveBlockRange: c.resolveBlockRange,
            }
          : null,
      }),
      editable: opts.editable.value,
      content:
        content ?? opts.contentJson.value ?? createEmptyPaperContentJson(),
      editorProps: {
        attributes: {
          class:
            'paper-editor-surface max-w-none px-6 py-8 md:px-10 md:py-12 focus:outline-none',
        },
        ...(opts.getEditorProps?.() ?? {}),
      },
      onUpdate: ({ editor: ed }) => {
        opts.onEditorActivity?.();
        opts.onUpdate?.(ed.getJSON() as Record<string, unknown>);
      },
    });
    editor.value = instance;
  }

  function destroyEditor() {
    instance?.destroy();
    instance = null;
    editor.value = null;
  }

  function setContentFromServer(doc: Record<string, unknown>) {
    if (!instance) {
      mountEditor(doc);
      return;
    }
    instance.commands.setContent(doc, { emitUpdate: false });
  }

  function bootstrapFromServer() {
    const json = opts.contentJson.value;
    if (!json) return;
    if (!instance) mountEditor(json);
    else setContentFromServer(json);
  }

  watch(
    () => opts.documentLoaded.value,
    (loaded) => {
      if (loaded) bootstrapFromServer();
    },
    { immediate: true },
  );

  watch(opts.editable, (v) => {
    editor.value?.setEditable(v);
  });

  onUnmounted(destroyEditor);

  function getContentJson(): Record<string, unknown> | null {
    if (!editor.value) return null;
    return editor.value.getJSON() as Record<string, unknown>;
  }

  return {
    editor,
    setContentFromServer,
    getContentJson,
    destroyEditor,
    mountEditor,
    bootstrapFromServer,
  };
}
