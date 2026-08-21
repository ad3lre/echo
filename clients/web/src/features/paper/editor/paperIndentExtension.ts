import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paperIndent: {
      indent: () => ReturnType;
      outdent: () => ReturnType;
      setIndent: (level: number) => ReturnType;
    };
  }
}

export const MAX_INDENT_LEVEL = 4;
export const INDENT_STEP_PX = 40;

/** Paragraph/list indent via margin-left on block nodes (paragraph, heading, listItem). */
export const PaperIndent = Extension.create({
  name: 'paperIndent',

  addOptions() {
    return {
      types: ['paragraph', 'heading', 'listItem'] as string[],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => {
              const indent = element.getAttribute('data-indent');
              if (!indent) return 0;
              const n = parseInt(indent, 10);
              return Number.isFinite(n)
                ? Math.max(0, Math.min(MAX_INDENT_LEVEL, n))
                : 0;
            },
            renderHTML: (attributes) => {
              const level = Math.max(
                0,
                Math.min(MAX_INDENT_LEVEL, attributes.indent ?? 0),
              );
              if (!level) return {};
              return {
                'data-indent': String(level),
                style: `margin-left: ${level * INDENT_STEP_PX}px`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      indent:
        () =>
        ({ commands, editor }) => {
          const applicable = this.options.types.filter((t) =>
            editor.isActive(t),
          );
          if (!applicable.length) return false;
          const currentLevel = this.options.types.reduce((max, t) => {
            const attr = editor.getAttributes(t);
            return Math.max(max, (attr.indent ?? 0) as number);
          }, 0);
          const nextLevel = Math.min(MAX_INDENT_LEVEL, currentLevel + 1);
          return this.options.types.every((t) =>
            commands.updateAttributes(t, { indent: nextLevel }),
          );
        },
      outdent:
        () =>
        ({ commands, editor }) => {
          const applicable = this.options.types.filter((t) =>
            editor.isActive(t),
          );
          if (!applicable.length) return false;
          const currentLevel = this.options.types.reduce((min, t) => {
            const attr = editor.getAttributes(t);
            return Math.min(min, (attr.indent ?? 0) as number);
          }, MAX_INDENT_LEVEL);
          const nextLevel = Math.max(0, currentLevel - 1);
          return this.options.types.every((t) =>
            commands.updateAttributes(t, { indent: nextLevel }),
          );
        },
      setIndent:
        (level: number) =>
        ({ commands }) => {
          const clamped = Math.max(0, Math.min(MAX_INDENT_LEVEL, level));
          return this.options.types.every((t) =>
            commands.updateAttributes(t, { indent: clamped }),
          );
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.indent(),
      'Shift-Tab': () => this.editor.commands.outdent(),
    };
  },
});
