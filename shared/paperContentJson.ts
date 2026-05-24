/**
 * TipTap node types allowed in paper channel documents (superset of chat content_json).
 */
export const PAPER_CONTENT_JSON_NODE_TYPES = [
  'doc',
  'paragraph',
  'text',
  'hardBreak',
  'mentionEntity',
  'channelMention',
  'customEmoji',
  'appIcon',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'heading',
  'horizontalRule',
  'image',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
] as const;

export type PaperContentJsonNodeType =
  (typeof PAPER_CONTENT_JSON_NODE_TYPES)[number];

export const PAPER_BLOCK_ATTR_KEYS = [
  'paperBlockId',
  'authorId',
  'lastEditedAt',
] as const;
