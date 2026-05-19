import messageLatexMd from '../../../../terms/message-latex.md?raw';
import messageMarkdownMd from '../../../../terms/message-markdown.md?raw';

export type FormattingGuideTabId = 'markdown' | 'latex';

export interface FormattingGuideTab {
  id: FormattingGuideTabId;
  label: string;
  markdown: string;
}

export const FORMATTING_GUIDE_TABS: readonly FormattingGuideTab[] = [
  { id: 'markdown', label: 'Markdown', markdown: messageMarkdownMd },
  { id: 'latex', label: 'Math (LaTeX)', markdown: messageLatexMd },
] as const;
