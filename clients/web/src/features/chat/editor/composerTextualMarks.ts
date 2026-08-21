import Bold from '@tiptap/extension-bold';
import Code from '@tiptap/extension-code';
import Italic from '@tiptap/extension-italic';
import Strike from '@tiptap/extension-strike';

/**
 * Chat composer marks without markdown auto-transforms.
 *
 * Echo treats the composer string as the source of truth (e.g. literal `**bold**`).
 * Markdown preview is a separate layer (`parseMessageContent`). TipTap's default Bold,
 * Italic, Strike, and Code extensions register input/paste rules that consume `**`, `` ` ``,
 * etc. into marks while typing — so the editor looks WYSIWYG but `serializeComposerDoc`
 * drops marks and the string no longer matches what the user sees until the next rebuild.
 */
export const ComposerBold = Bold.extend({
  addInputRules() {
    return [];
  },
  addPasteRules() {
    return [];
  },
  addKeyboardShortcuts() {
    return {};
  },
});

export const ComposerItalic = Italic.extend({
  addInputRules() {
    return [];
  },
  addPasteRules() {
    return [];
  },
  addKeyboardShortcuts() {
    return {};
  },
});

export const ComposerStrike = Strike.extend({
  addInputRules() {
    return [];
  },
  addPasteRules() {
    return [];
  },
  addKeyboardShortcuts() {
    return {};
  },
});

export const ComposerCode = Code.extend({
  addInputRules() {
    return [];
  },
  addPasteRules() {
    return [];
  },
  addKeyboardShortcuts() {
    return {};
  },
});
