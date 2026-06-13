/**
 * Walk / derive Discord components from `buttonRow` nodes in Echo chat TipTap JSON.
 */
import {
  BUTTON_ROW_LIMITS,
  formatButtonRowToken,
  normalizeButtonRowButtons,
  parseButtonRowToken,
  randomButtonRowId,
  type ButtonRowAttrs,
  type ButtonRowButton,
} from './buttonRow';
import { DISCORD_COMPONENT_TYPE } from './discordMessageComponents';

export type ButtonRowWalkEntry = ButtonRowAttrs & { blockIndex: number };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function readButtonEmoji(raw: unknown): ButtonRowButton['emoji'] | undefined {
  if (!isPlainObject(raw)) return undefined;
  const name = typeof raw.name === 'string' ? raw.name : undefined;
  const id = typeof raw.id === 'string' ? raw.id : undefined;
  const animated = raw.animated === true ? true : undefined;
  if (!name && !id && !animated) return undefined;
  return {
    ...(name ? { name } : {}),
    ...(id ? { id } : {}),
    ...(animated ? { animated: true } : {}),
  };
}

function readButtons(raw: unknown): ButtonRowButton[] {
  if (!Array.isArray(raw)) return [];
  const out: ButtonRowButton[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    const label = typeof item.label === 'string' ? item.label : '';
    const styleNum = Number(item.style);
    if (
      styleNum !== 1 &&
      styleNum !== 2 &&
      styleNum !== 3 &&
      styleNum !== 4 &&
      styleNum !== 5
    ) {
      continue;
    }
    const url = typeof item.url === 'string' ? item.url : undefined;
    const customId =
      typeof item.customId === 'string'
        ? item.customId
        : typeof item.custom_id === 'string'
          ? item.custom_id
          : undefined;
    const emoji = readButtonEmoji(item.emoji);
    out.push({
      label,
      style: styleNum,
      ...(url ? { url } : {}),
      ...(customId ? { customId } : {}),
      ...(item.disabled === true ? { disabled: true } : {}),
      ...(emoji ? { emoji } : {}),
    });
  }
  return normalizeButtonRowButtons(out);
}

export function readRowAttrs(attrs: unknown): ButtonRowAttrs | null {
  if (!isPlainObject(attrs)) return null;
  const rowId = typeof attrs.rowId === 'string' ? attrs.rowId.trim() : '';
  if (!rowId || rowId.length > BUTTON_ROW_LIMITS.rowIdMax) return null;
  const buttons = readButtons(attrs.buttons);
  if (!buttons.length) return null;
  return { rowId, buttons };
}

function buttonRowNode(attrs: ButtonRowAttrs): Record<string, unknown> {
  return {
    type: 'buttonRow',
    attrs: {
      rowId: attrs.rowId,
      buttons: attrs.buttons.map((btn) => ({
        label: btn.label,
        style: btn.style,
        ...(btn.url ? { url: btn.url } : {}),
        ...(btn.customId ? { customId: btn.customId } : {}),
        ...(btn.disabled ? { disabled: true } : {}),
        ...(btn.emoji ? { emoji: btn.emoji } : {}),
      })),
    },
  };
}

/** Ordered top-level `buttonRow` blocks in a doc. */
export function walkButtonRows(doc: unknown): ButtonRowWalkEntry[] {
  if (!isPlainObject(doc) || doc.type !== 'doc') return [];
  const content = doc.content;
  if (!Array.isArray(content)) return [];
  const out: ButtonRowWalkEntry[] = [];
  for (let i = 0; i < content.length; i++) {
    const node = content[i];
    if (!isPlainObject(node) || node.type !== 'buttonRow') continue;
    const attrs = readRowAttrs(node.attrs);
    if (!attrs) continue;
    out.push({ ...attrs, blockIndex: i });
  }
  return out;
}

export function countButtonRows(doc: unknown): number {
  return walkButtonRows(doc).length;
}

export function docContainsButtonRows(doc: unknown): boolean {
  return countButtonRows(doc) > 0;
}

/** Map stored button rows to Discord webhook/API `components` action rows. */
export function deriveMessageComponentsFromContentJson(
  doc: unknown,
): unknown[] | null {
  const rows = walkButtonRows(doc);
  if (!rows.length) return null;
  return rows.slice(0, BUTTON_ROW_LIMITS.maxRowsPerMessage).map((row) => ({
    type: DISCORD_COMPONENT_TYPE.ACTION_ROW,
    components: row.buttons.map((btn) => ({
      type: DISCORD_COMPONENT_TYPE.BUTTON,
      style: btn.style,
      label: btn.label,
      ...(btn.style === 5 && btn.url ? { url: btn.url } : {}),
      ...(btn.style !== 5 && btn.customId ? { custom_id: btn.customId } : {}),
      ...(btn.disabled ? { disabled: true } : {}),
      ...(btn.emoji ? { emoji: btn.emoji } : {}),
    })),
  }));
}

/** Build a new button row node for composer insert. */
export function createButtonRowNode(
  buttons: ButtonRowButton[],
  rowId?: string,
): Record<string, unknown> {
  return buttonRowNode({
    rowId: rowId ?? randomButtonRowId(),
    buttons: normalizeButtonRowButtons(buttons),
  });
}

type InlineMention = {
  kind: string;
  label: string;
  start: number;
  end: number;
  userId?: string;
  channelId?: string;
  roleId?: string;
  mentionId?: string;
};

function paragraphFromPlainLine(
  line: string,
  lineStartInPlain: number,
  mentions: InlineMention[] | undefined,
): Record<string, unknown> {
  const inline: Record<string, unknown>[] = [];
  const lineEnd = lineStartInPlain + line.length;
  const lineMentions = (mentions ?? [])
    .filter((m) => m.start >= lineStartInPlain && m.end <= lineEnd)
    .map((m) => ({
      ...m,
      start: m.start - lineStartInPlain,
      end: m.end - lineStartInPlain,
    }))
    .sort((a, b) => a.start - b.start);

  let cursor = 0;
  for (const m of lineMentions) {
    if (m.start > cursor) {
      inline.push({ type: 'text', text: line.slice(cursor, m.start) });
    }
    if (m.kind === 'channel') {
      inline.push({
        type: 'channelMention',
        attrs: {
          label: m.label,
          channelId: m.channelId ?? '',
          mentionId: m.mentionId ?? '',
        },
      });
    } else {
      inline.push({
        type: 'mentionEntity',
        attrs: {
          kind: m.kind,
          label: m.label,
          userId: m.userId ?? '',
          roleId: m.roleId ?? '',
          mentionId: m.mentionId ?? '',
        },
      });
    }
    cursor = m.end;
  }
  if (cursor < line.length) {
    inline.push({ type: 'text', text: line.slice(cursor) });
  }
  return {
    type: 'paragraph',
    content: inline.length ? inline : undefined,
  };
}

function buttonRowsById(doc: unknown): Map<string, ButtonRowAttrs> {
  const map = new Map<string, ButtonRowAttrs>();
  for (const row of walkButtonRows(doc)) {
    map.set(row.rowId, { rowId: row.rowId, buttons: row.buttons });
  }
  return map;
}

/** Build a stored `buttonRow` node from attrs (for plain-text rebuild). */
export function buttonRowNodeFromAttrs(
  attrs: ButtonRowAttrs,
): Record<string, unknown> {
  return buttonRowNode(attrs);
}

export { buttonRowsById };

/** Rebuild v2 doc from edited plain text while preserving button rows by `rowId`. */
export function rebuildContentJsonPreservingButtonRows(
  originalDoc: unknown,
  editedPlain: string,
  mentions?: InlineMention[],
): Record<string, unknown> {
  const rowsById = buttonRowsById(originalDoc);
  const plain = editedPlain.replace(/\r\n/g, '\n');
  const blocks: Record<string, unknown>[] = [];

  if (!plain.length) {
    return { type: 'doc', content: blocks };
  }

  const lines = plain.split('\n');
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = offset;
    offset += line.length + 1;

    const trimmed = line.trim();
    if (!trimmed) {
      if (line.length === 0 && i < lines.length - 1) {
        blocks.push({ type: 'paragraph' });
      }
      continue;
    }

    const parsed = parseButtonRowToken(trimmed);
    if (
      parsed &&
      trimmed === line.trim() &&
      line.trim().length === trimmed.length
    ) {
      const prior = rowsById.get(parsed.rowId);
      if (prior) {
        blocks.push(buttonRowNode(prior));
      }
      continue;
    }

    blocks.push(paragraphFromPlainLine(line, lineStart, mentions));
  }

  if (!blocks.length) {
    blocks.push({ type: 'paragraph' });
  }

  return { type: 'doc', content: blocks };
}

export type ButtonRowSegment = {
  type: 'buttonRow';
  rowId: string;
  buttons: ButtonRowButton[];
};
