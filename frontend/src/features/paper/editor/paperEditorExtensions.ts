import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TextStyle } from '@tiptap/extension-text-style';
import { FontFamily } from '@tiptap/extension-font-family';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import type { Extensions } from '@tiptap/core';
import {
  AppIconNode,
  ChannelMentionNode,
  CustomEmojiNode,
  MentionEntityNode,
} from '@/features/chat/editor/composerModel';
import {
  ComposerBold,
  ComposerCode,
  ComposerItalic,
  ComposerStrike,
} from '@/features/chat/editor/composerTextualMarks';
import { PaperBlockIdExtension } from '@/features/paper/editor/paperBlockIdExtension';
import { PaperMarkdownMathDecorations } from '@/features/paper/editor/paperMarkdownMathDecorations';
import { PaperBlockHighlight } from '@/features/paper/editor/paperBlockHighlight';
import { PaperFontSize } from '@/features/paper/editor/paperFontSizeExtension';
import { PaperLetterSpacing } from '@/features/paper/editor/paperLetterSpacingExtension';
import { PaperLineHeight } from '@/features/paper/editor/paperLineHeightExtension';
import { PaperTextOutline } from '@/features/paper/editor/paperTextOutlineExtension';
import { PaperIndent } from '@/features/paper/editor/paperIndentExtension';
import { PaperImage } from '@/features/paper/editor/paperImageExtension';
import { PaperKeyboardShortcuts } from '@/features/paper/editor/paperKeyboardShortcutsExtension';
import { PaperDocumentAttributes } from '@/features/paper/editor/paperDocumentAttributes';
import {
  PaperBlockLockExtension,
  type PaperBlockLockOptions,
} from '@/features/paper/editor/paperBlockLockExtension';
import {
  PaperRemoteCursorsExtension,
  type PaperRemoteCursorsOptions,
} from '@/features/paper/editor/paperRemoteCursorsExtension';

export type BuildPaperEditorExtensionsOpts = {
  blockLock?: PaperBlockLockOptions | null;
  remoteCursors?:
    | (Omit<PaperRemoteCursorsOptions, 'getCursors'> & {
        getCursors: PaperRemoteCursorsOptions['getCursors'];
      })
    | null;
};

/** TipTap extensions for paper documents (block editor + Echo inline nodes). */
export function buildPaperEditorExtensions(
  opts: BuildPaperEditorExtensionsOpts = {},
): Extensions {
  const extensions: Extensions = [
    StarterKit.configure({
      dropcursor: { color: 'rgba(99,102,241,0.6)', width: 2 },
      heading: { levels: [1, 2, 3] },
      // Keep literal `**`, `` ` ``, etc. in the doc; inline/raw preview is decoration-driven.
      bold: false,
      italic: false,
      strike: false,
      code: false,
    }),
    ComposerBold,
    ComposerItalic,
    ComposerStrike,
    ComposerCode,
    PaperDocumentAttributes,
    TextStyle,
    FontFamily.configure({ types: ['textStyle'] }),
    PaperFontSize,
    PaperLetterSpacing,
    PaperLineHeight,
    PaperTextOutline,
    PaperIndent,
    Color.configure({ types: ['textStyle'] }),
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
      alignments: ['left', 'center', 'right', 'justify'],
      defaultAlignment: 'left',
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
    }),
    PaperImage.configure({
      inline: false,
      allowBase64: false,
      HTMLAttributes: { class: 'paper-editor-image' },
    }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === 'heading' && node.attrs.level === 1) {
          return 'Add a title…';
        }
        if (node.type.name === 'heading') {
          return 'Heading';
        }
        return 'Start writing…';
      },
      showOnlyWhenEditable: true,
      includeChildren: true,
    }),
    MentionEntityNode,
    ChannelMentionNode,
    CustomEmojiNode,
    AppIconNode,
    PaperBlockIdExtension,
    PaperMarkdownMathDecorations,
    PaperBlockHighlight,
    PaperKeyboardShortcuts,
  ];

  if (opts.blockLock) {
    extensions.push(PaperBlockLockExtension.configure(opts.blockLock));
  }
  if (opts.remoteCursors) {
    extensions.push(PaperRemoteCursorsExtension.configure(opts.remoteCursors));
  }

  return extensions;
}
