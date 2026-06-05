import { Node, mergeAttributes } from '@tiptap/core';

/** Horizontal row of adjacent paper shapes. */
export const PaperShapeRow = Node.create({
  name: 'paperShapeRow',
  group: 'block',
  content: 'paperShape+',
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-paper-shape-row]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        class: 'paper-editor-shape-row',
        'data-paper-shape-row': '',
      }),
      0,
    ];
  },
});
