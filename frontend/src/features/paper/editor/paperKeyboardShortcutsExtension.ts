import { Extension } from '@tiptap/core';
import {
  paperCycleFontFamily,
  paperCycleHighlight,
  paperSetHeadingLevel,
  paperSetTextAlign,
  paperStepFontSize,
  paperToggleBulletList,
  paperToggleMark,
} from '@/features/paper/editor/paperKeyboardActions';

/** Paper editor keyboard shortcuts (typography, alignment, structure). */
export const PaperKeyboardShortcuts = Extension.create({
  name: 'paperKeyboardShortcuts',

  addKeyboardShortcuts() {
    return {
      'Mod-b': () => paperToggleMark(this.editor, 'toggleBold'),
      'Mod-B': () => paperToggleMark(this.editor, 'toggleBold'),
      'Mod-i': () => paperToggleMark(this.editor, 'toggleItalic'),
      'Mod-I': () => paperToggleMark(this.editor, 'toggleItalic'),
      'Mod-Shift-s': () => paperToggleMark(this.editor, 'toggleStrike'),
      'Mod-Shift-S': () => paperToggleMark(this.editor, 'toggleStrike'),
      'Mod-e': () => paperToggleMark(this.editor, 'toggleCode'),
      'Mod-E': () => paperToggleMark(this.editor, 'toggleCode'),

      'Mod-Shift-ArrowUp': () => paperStepFontSize(this.editor, 'up'),
      'Mod-Shift-ArrowDown': () => paperStepFontSize(this.editor, 'down'),
      'Mod-Shift-ArrowLeft': () => paperCycleFontFamily(this.editor, 'prev'),
      'Mod-Shift-ArrowRight': () => paperCycleFontFamily(this.editor, 'next'),

      'Mod-Alt-1': () => paperSetHeadingLevel(this.editor, 1),
      'Mod-Alt-2': () => paperSetHeadingLevel(this.editor, 2),
      'Mod-Alt-3': () => paperSetHeadingLevel(this.editor, 3),
      'Mod-Alt-0': () => paperSetHeadingLevel(this.editor, 0),

      'Mod-Shift-l': () => paperSetTextAlign(this.editor, 'left'),
      'Mod-Shift-e': () => paperSetTextAlign(this.editor, 'center'),
      'Mod-Shift-r': () => paperSetTextAlign(this.editor, 'right'),
      'Mod-Shift-j': () => paperSetTextAlign(this.editor, 'justify'),

      'Mod-Shift-8': () => paperToggleBulletList(this.editor),
      'Mod-Shift-h': () => paperCycleHighlight(this.editor),
    };
  },
});
