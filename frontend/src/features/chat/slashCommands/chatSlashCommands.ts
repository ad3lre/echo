import { IMAGE_SLOT_ASPECT_RATIOS } from '@shared/imageSlot';
import { DISCORD_BUTTON_STYLE } from '@shared/discordMessageComponents';
import type { ButtonRowButton } from '@shared/buttonRow';
import type { MarkdownComposerWrapKind } from '@/features/chat/composables/markdownComposerKeybinds';

export type SlashCommandGroup = 'media' | 'blocks' | 'markdown' | 'math';

export type SlashCommandAction =
  | { type: 'upload' }
  | { type: 'poll' }
  | { type: 'gif' }
  | { type: 'image-slot'; aspectW: number; aspectH: number }
  | { type: 'button-row'; buttons: readonly ButtonRowButton[] }
  | { type: 'markdown-wrap'; kind: MarkdownComposerWrapKind }
  | { type: 'insert-text'; text: string; cursorOffset?: number };

export type ChatSlashCommand = {
  id: string;
  /** Command token after `/` (e.g. `poll`, `imageslot-16-9`). */
  name: string;
  label: string;
  description: string;
  group: SlashCommandGroup;
  /** Optional snippet shown in the slash menu. */
  preview?: string;
  keywords: readonly string[];
  action: SlashCommandAction;
};

export type ChatSlashCommandContext = {
  mediaAllowed: boolean;
  pollAllowed: boolean;
  editingMessage: boolean;
};

const GROUP_ORDER: Record<SlashCommandGroup, number> = {
  media: 0,
  blocks: 1,
  markdown: 2,
  math: 3,
};

export const SLASH_COMMAND_GROUP_LABELS: Record<SlashCommandGroup, string> = {
  media: 'Media & polls',
  blocks: 'Rich blocks',
  markdown: 'Markdown',
  math: 'Math (LaTeX)',
};

function command(
  name: string,
  label: string,
  description: string,
  group: SlashCommandGroup,
  action: SlashCommandAction,
  keywords: string[] = [],
  preview?: string,
): ChatSlashCommand {
  return {
    id: name,
    name,
    label,
    description,
    group,
    preview,
    keywords,
    action,
  };
}

function insertText(text: string, cursorOffset = 0): SlashCommandAction {
  return { type: 'insert-text', text, cursorOffset };
}

function markdownWrap(kind: MarkdownComposerWrapKind): SlashCommandAction {
  return { type: 'markdown-wrap', kind };
}

function buttonRow(buttons: readonly ButtonRowButton[]): SlashCommandAction {
  return { type: 'button-row', buttons };
}

const BUTTON_LINK: ButtonRowButton = {
  label: 'Link',
  style: DISCORD_BUTTON_STYLE.LINK,
  url: 'https://example.com',
};

const BUTTON_PRIMARY: ButtonRowButton = {
  label: 'Continue',
  style: DISCORD_BUTTON_STYLE.PRIMARY,
  customId: 'continue',
};

const BUTTON_SECONDARY: ButtonRowButton = {
  label: 'Button',
  style: DISCORD_BUTTON_STYLE.SECONDARY,
  customId: 'action',
};

const BUTTON_SUCCESS: ButtonRowButton = {
  label: 'Done',
  style: DISCORD_BUTTON_STYLE.SUCCESS,
  customId: 'done',
};

const BUTTON_DANGER: ButtonRowButton = {
  label: 'Delete',
  style: DISCORD_BUTTON_STYLE.DANGER,
  customId: 'delete',
};

/** @deprecated Use button-row action presets instead. */
export const DEFAULT_BUTTON_ROW_INSERT = [BUTTON_SECONDARY] as const;

function buildMediaCommands(ctx: ChatSlashCommandContext): ChatSlashCommand[] {
  const out: ChatSlashCommand[] = [];
  if (ctx.mediaAllowed) {
    out.push(
      command(
        'upload',
        'Upload file',
        'Attach images, documents, and more',
        'media',
        { type: 'upload' },
      ),
      command(
        'gif',
        'GIF',
        'Search and insert a GIF',
        'media',
        { type: 'gif' },
        ['giphy', 'tenor', 'animate'],
      ),
    );
  }
  if (ctx.pollAllowed && !ctx.editingMessage) {
    out.push(
      command(
        'poll',
        'Create poll',
        'Ask a question with options',
        'media',
        { type: 'poll' },
        ['vote', 'survey'],
      ),
    );
  }
  return out;
}

function buildBlockCommands(): ChatSlashCommand[] {
  const out: ChatSlashCommand[] = [];

  out.push(
    command(
      'image',
      'Image slot 16:9',
      'Default widescreen placeholder',
      'blocks',
      { type: 'image-slot', aspectW: 16, aspectH: 9 },
      ['imageslot', 'slot', '16:9', 'photo'],
      '![image: ratio=16:9]',
    ),
  );

  for (const ratio of IMAGE_SLOT_ASPECT_RATIOS) {
    if (ratio.w === 16 && ratio.h === 9) continue;
    const name = `imageslot-${ratio.w}-${ratio.h}`;
    out.push(
      command(
        name,
        `Image slot ${ratio.w}:${ratio.h}`,
        'Placeholder image to fill later',
        'blocks',
        { type: 'image-slot', aspectW: ratio.w, aspectH: ratio.h },
        ['image', 'slot', `${ratio.w}:${ratio.h}`, `${ratio.w}x${ratio.h}`],
        `![image: ratio=${ratio.w}:${ratio.h}]`,
      ),
    );
  }

  out.push(
    command(
      'buttonrow',
      'Button row',
      'Insert a secondary action button',
      'blocks',
      buttonRow([BUTTON_SECONDARY]),
      ['button', 'buttons', 'actions'],
      '![button: …]',
    ),
    command(
      'buttonrow-confirm',
      'Confirm / Cancel row',
      'Two-button confirmation row',
      'blocks',
      buttonRow([
        { ...BUTTON_PRIMARY, label: 'Confirm', customId: 'confirm' },
        { ...BUTTON_SECONDARY, label: 'Cancel', customId: 'cancel' },
      ]),
      ['confirm', 'cancel', 'dialog'],
    ),
    command(
      'button-link',
      'Link button',
      'Single button that opens a URL',
      'blocks',
      buttonRow([BUTTON_LINK]),
      ['url', 'href', 'website'],
      '![button: label=Link, url=…]',
    ),
    command(
      'button-primary',
      'Primary button',
      'Highlighted call-to-action button',
      'blocks',
      buttonRow([BUTTON_PRIMARY]),
      ['cta', 'continue'],
    ),
    command(
      'button-success',
      'Success button',
      'Positive confirmation button',
      'blocks',
      buttonRow([BUTTON_SUCCESS]),
      ['ok', 'done', 'green'],
    ),
    command(
      'button-danger',
      'Danger button',
      'Destructive action button',
      'blocks',
      buttonRow([BUTTON_DANGER]),
      ['delete', 'remove', 'red'],
    ),
  );

  return out;
}

function buildMarkdownCommands(): ChatSlashCommand[] {
  return [
    command(
      'bold',
      'Bold',
      'Wrap selection in **bold**',
      'markdown',
      markdownWrap('bold'),
      ['strong', 'b'],
      '**text**',
    ),
    command(
      'italic',
      'Italic',
      'Wrap selection in *italic*',
      'markdown',
      markdownWrap('italic'),
      ['em', 'i'],
      '*text*',
    ),
    command(
      'strike',
      'Strikethrough',
      'Wrap selection in ~~strike~~',
      'markdown',
      markdownWrap('strike'),
      ['strikethrough', 'del'],
      '~~text~~',
    ),
    command(
      'code',
      'Inline code',
      'Wrap selection in backticks',
      'markdown',
      markdownWrap('inlineCode'),
      ['monospace', 'inline'],
      '`code`',
    ),
    command(
      'spoiler',
      'Spoiler',
      'Hide text behind a spoiler tag',
      'markdown',
      markdownWrap('spoiler'),
      ['hidden', 'blur'],
      '||text||',
    ),
    command(
      'highlight',
      'Highlight',
      'Mark text with ==highlight==',
      'markdown',
      insertText('==highlight==', -3),
      ['mark', 'yellow'],
      '==text==',
    ),
    command(
      'codeblock',
      'Code block',
      'Fenced multiline code block',
      'markdown',
      insertText('```\n\n```', -4),
      ['fence', 'pre', 'snippet'],
      '``` … ```',
    ),
    command(
      'quote',
      'Blockquote',
      'Start a quoted line',
      'markdown',
      insertText('> ', 0),
      ['blockquote', 'cite'],
      '> quote',
    ),
    command(
      'h1',
      'Heading 1',
      'Large section heading',
      'markdown',
      insertText('# Heading\n', -8),
      ['heading1', 'title'],
      '# Heading',
    ),
    command(
      'h2',
      'Heading 2',
      'Medium section heading',
      'markdown',
      insertText('## Heading\n', -8),
      ['heading2', 'subtitle'],
      '## Heading',
    ),
    command(
      'h3',
      'Heading 3',
      'Small section heading',
      'markdown',
      insertText('### Heading\n', -8),
      ['heading3'],
      '### Heading',
    ),
    command(
      'ul',
      'Bullet list',
      'Start an unordered list item',
      'markdown',
      insertText('- Item\n', -5),
      ['list', 'bullet', 'unordered'],
      '- item',
    ),
    command(
      'ol',
      'Numbered list',
      'Start an ordered list item',
      'markdown',
      insertText('1. Item\n', -5),
      ['list', 'numbered', 'ordered'],
      '1. item',
    ),
    command(
      'table',
      'Table',
      'Simple 2×2 GitHub-style table',
      'markdown',
      insertText('| Col A | Col B |\n| --- | --- |\n| A1 | B1 |\n', 0),
      ['grid', 'columns'],
      '| A | B |',
    ),
    command(
      'alert-note',
      'Note alert',
      'GitHub-style note callout',
      'markdown',
      insertText('> [!NOTE]\n> Useful information.\n\n', 0),
      ['callout', 'info'],
      '> [!NOTE]',
    ),
    command(
      'alert-tip',
      'Tip alert',
      'Helpful tip callout',
      'markdown',
      insertText('> [!TIP]\n> Helpful advice.\n\n', 0),
      ['callout', 'hint'],
      '> [!TIP]',
    ),
    command(
      'alert-warning',
      'Warning alert',
      'Caution callout',
      'markdown',
      insertText('> [!WARNING]\n> Be careful.\n\n', 0),
      ['callout', 'caution'],
      '> [!WARNING]',
    ),
    command(
      'alert-important',
      'Important alert',
      'Critical information callout',
      'markdown',
      insertText('> [!IMPORTANT]\n> Key information.\n\n', 0),
      ['callout', 'critical'],
      '> [!IMPORTANT]',
    ),
  ];
}

function buildMathCommands(): ChatSlashCommand[] {
  return [
    command(
      'math',
      'Inline math',
      'KaTeX inline formula with \\(\\)',
      'math',
      insertText('\\( \\)', -3),
      ['latex', 'inline', 'katex', 'formula'],
      '\\( … \\)',
    ),
    command(
      'mathblock',
      'Display math',
      'Centered block formula with $$',
      'math',
      insertText('$$\n\n$$', -3),
      ['latex', 'display', 'katex', 'equation'],
      '$$ … $$',
    ),
    command(
      'frac',
      'Fraction',
      'Inline fraction template',
      'math',
      insertText('\\(\\frac{a}{b}\\)', -8),
      ['fraction', 'divide'],
      '\\frac{a}{b}',
    ),
    command(
      'sqrt',
      'Square root',
      'Inline square root',
      'math',
      insertText('\\(\\sqrt{x}\\)', -5),
      ['root', 'radical'],
      '\\sqrt{x}',
    ),
    command(
      'matrix',
      'Matrix',
      'Bare matrix environment (display)',
      'math',
      insertText('\\begin{matrix}\na & b \\\\\nc & d\n\\end{matrix}\n', 0),
      ['array', 'grid', 'linear-algebra'],
      '\\begin{matrix}',
    ),
    command(
      'align',
      'Aligned equations',
      'Multi-line aligned display math',
      'math',
      insertText(
        '\\begin{align}\nx &= a + b \\\\\ny &= c + d\n\\end{align}\n',
        0,
      ),
      ['aligned', 'equations', 'system'],
      '\\begin{align}',
    ),
    command(
      'sum',
      'Summation',
      'Sigma summation notation',
      'math',
      insertText('\\(\\sum_{i=1}^{n} x_i\\)', -6),
      ['sigma', 'series'],
      '\\sum',
    ),
    command(
      'integral',
      'Integral',
      'Definite integral template',
      'math',
      insertText('\\(\\int_{a}^{b} f(x)\\,dx\\)', -8),
      ['calculus', 'area'],
      '\\int',
    ),
  ];
}

/** Composer slash commands filtered by send permissions and edit mode. */
export function buildChatSlashCommands(
  ctx: ChatSlashCommandContext,
): ChatSlashCommand[] {
  return [
    ...buildMediaCommands(ctx),
    ...buildBlockCommands(),
    ...buildMarkdownCommands(),
    ...buildMathCommands(),
  ];
}

function sortSlashCommands(
  commands: readonly ChatSlashCommand[],
): ChatSlashCommand[] {
  return [...commands].sort((a, b) => {
    const ga = GROUP_ORDER[a.group];
    const gb = GROUP_ORDER[b.group];
    if (ga !== gb) return ga - gb;
    return a.label.localeCompare(b.label);
  });
}

function scoreSlashCommand(cmd: ChatSlashCommand, q: string): number {
  if (cmd.name === q) return 100;
  if (cmd.name.startsWith(q)) return 90;
  if (cmd.keywords.some((kw) => kw === q || kw.startsWith(q))) return 75;
  if (cmd.label.toLowerCase().includes(q)) return 55;
  if (cmd.description.toLowerCase().includes(q)) return 45;
  if (cmd.preview?.toLowerCase().includes(q)) return 40;
  if (cmd.group.includes(q)) return 30;
  if (cmd.keywords.some((kw) => kw.includes(q))) return 25;
  if (cmd.name.includes(q)) return 20;
  return -1;
}

export function filterSlashCommands(
  commands: readonly ChatSlashCommand[],
  query: string,
): ChatSlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return sortSlashCommands(commands);
  return commands
    .map((cmd) => ({ cmd, score: scoreSlashCommand(cmd, q) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score || a.cmd.label.localeCompare(b.cmd.label))
    .map(({ cmd }) => cmd);
}

export function slashCommandGroupLabel(group: SlashCommandGroup): string {
  return SLASH_COMMAND_GROUP_LABELS[group];
}
