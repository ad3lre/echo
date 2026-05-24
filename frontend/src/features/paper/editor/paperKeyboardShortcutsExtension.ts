import { Extension } from '@tiptap/core';
import {
  paperCycleFontFamily,
  paperCycleHighlight,
  paperSetHeadingLevel,
  paperSetTextAlign,
  paperStepFontSize,
  paperToggleBulletList,
} from '@/features/paper/editor/paperKeyboardActions';

/** Paper editor keyboard shortcuts (typography, alignment, structure). */
export const PaperKeyboardShortcuts = Extension.create({
  name: 'paperKeyboardShortcuts',

  addKeyboardShortcuts() {
    return {
      'Shift-ArrowUp': () => paperStepFontSize(this.editor, 'up'),
      'Shift-ArrowDown': () => paperStepFontSize(this.editor, 'down'),
      'Shift-ArrowLeft': () => paperCycleFontFamily(this.editor, 'prev'),
      'Shift-ArrowRight': () => paperCycleFontFamily(this.editor, 'next'),

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
