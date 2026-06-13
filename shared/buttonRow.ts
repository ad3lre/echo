/**
 * Button row blocks for chat `buttonRow` nodes (Discord-style action rows).
 * Plain tokens use the universal rich-block grammar (`![button: …]`).
 * @see docs/contracts/ECHO_CONTRACT_V2.md
 */

import {
  DISCORD_BUTTON_STYLE,
  type DiscordComponentEmoji,
} from './discordMessageComponents';
import {
  findAllRichBlockTokens,
  formatRichBlockToken,
  parseRichBlockToken,
  RICH_BLOCK_TYPES,
} from './richBlockToken';

export const BUTTON_ROW_LIMITS = {
  maxRowsPerMessage: 5,
  maxButtonsPerRow: 5,
  labelMax: 80,
  customIdMax: 100,
  urlMax: 2048,
  rowIdMax: 64,
} as const;

export type ButtonRowButton = {
  label: string;
  style: 1 | 2 | 3 | 4 | 5;
  url?: string;
  customId?: string;
  disabled?: boolean;
  emoji?: DiscordComponentEmoji;
};

export type ButtonRowAttrs = {
  rowId: string;
  buttons: ButtonRowButton[];
};

export type ParsedButtonRowToken = {
  rowId: string;
  start: number;
  end: number;
};

const BUTTON_BLOCK_TYPE = RICH_BLOCK_TYPES.button;
const BUTTON_ROW_BLOCK_TYPE = RICH_BLOCK_TYPES.buttonRow;

const STYLE_ALIASES: Record<string, 1 | 2 | 3 | 4 | 5> = {
  primary: DISCORD_BUTTON_STYLE.PRIMARY,
  secondary: DISCORD_BUTTON_STYLE.SECONDARY,
  success: DISCORD_BUTTON_STYLE.SUCCESS,
  danger: DISCORD_BUTTON_STYLE.DANGER,
  link: DISCORD_BUTTON_STYLE.LINK,
  '1': DISCORD_BUTTON_STYLE.PRIMARY,
  '2': DISCORD_BUTTON_STYLE.SECONDARY,
  '3': DISCORD_BUTTON_STYLE.SUCCESS,
  '4': DISCORD_BUTTON_STYLE.DANGER,
  '5': DISCORD_BUTTON_STYLE.LINK,
};

function clipLabel(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  return s.length <= BUTTON_ROW_LIMITS.labelMax
    ? s
    : s.slice(0, BUTTON_ROW_LIMITS.labelMax);
}

export function parseButtonStyle(
  raw: string | undefined,
): 1 | 2 | 3 | 4 | 5 | null {
  const key = (raw ?? '').trim().toLowerCase();
  if (!key) return null;
  return STYLE_ALIASES[key] ?? null;
}

function readRowId(attrs: Record<string, string>): string | null {
  const id =
    attrs.rowId ??
    Object.entries(attrs).find(([k]) => k.toLowerCase() === 'rowid')?.[1] ??
    '';
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > BUTTON_ROW_LIMITS.rowIdMax) return null;
  return trimmed;
}

function readCustomId(attrs: Record<string, string>): string {
  const raw =
    attrs.id ??
    attrs.customId ??
    Object.entries(attrs).find(([k]) => k.toLowerCase() === 'id')?.[1] ??
    Object.entries(attrs).find(([k]) => k.toLowerCase() === 'customid')?.[1] ??
    '';
  return raw.trim().slice(0, BUTTON_ROW_LIMITS.customIdMax);
}

function readUrl(attrs: Record<string, string>): string {
  const raw = attrs.url ?? '';
  return raw.trim().slice(0, BUTTON_ROW_LIMITS.urlMax);
}

function parseButtonsAttr(raw: string | undefined): ButtonRowButton[] | null {
  const body = raw?.trim();
  if (!body) return null;
  const specs = body
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!specs.length) return null;
  const buttons: ButtonRowButton[] = [];
  for (const spec of specs) {
    if (buttons.length >= BUTTON_ROW_LIMITS.maxButtonsPerRow) break;
    const parts = spec.split('|').map((p) => p.trim());
    if (parts.length < 2) continue;
    const label = clipLabel(parts[0] ?? '');
    if (!label) continue;
    const style = parseButtonStyle(parts[1]);
    if (!style) continue;
    const target = (parts[2] ?? '').trim();
    if (style === DISCORD_BUTTON_STYLE.LINK) {
      if (!target || !/^https?:\/\//i.test(target)) continue;
      buttons.push({
        label,
        style,
        url: target.slice(0, BUTTON_ROW_LIMITS.urlMax),
      });
    } else {
      if (!target) continue;
      buttons.push({
        label,
        style,
        customId: target.slice(0, BUTTON_ROW_LIMITS.customIdMax),
      });
    }
  }
  return buttons.length ? buttons : null;
}

function parseSingleButtonShortcut(
  attrs: Record<string, string>,
): ButtonRowButton[] | null {
  const label = clipLabel(attrs.label ?? '');
  if (!label) return null;
  const url = readUrl(attrs);
  if (url) {
    if (!/^https?:\/\//i.test(url)) return null;
    return [{ label, style: DISCORD_BUTTON_STYLE.LINK, url }];
  }
  const style = parseButtonStyle(attrs.style) ?? DISCORD_BUTTON_STYLE.SECONDARY;
  if (style === DISCORD_BUTTON_STYLE.LINK) return null;
  const customId = readCustomId(attrs);
  if (!customId) return null;
  return [{ label, style, customId }];
}

/** Canonical plain projection: `![button: rowId=…]`. */
export function formatButtonRowToken(
  attrs: Pick<ButtonRowAttrs, 'rowId'>,
): string {
  const id = String(attrs.rowId ?? '').trim();
  if (!id) return '';
  return formatRichBlockToken(BUTTON_BLOCK_TYPE, { rowId: id });
}

export function parseButtonRowToken(
  raw: string,
): Omit<ParsedButtonRowToken, 'start' | 'end'> | null {
  const block = parseRichBlockToken(raw.trim());
  if (!block || block.type !== BUTTON_BLOCK_TYPE) return null;
  const rowId = readRowId(block.attrs);
  if (!rowId) return null;
  return { rowId };
}

/** Find persisted button tokens in plain text (with offsets). */
export function findAllButtonRowTokens(plain: string): ParsedButtonRowToken[] {
  const out: ParsedButtonRowToken[] = [];
  if (!plain) return out;
  for (const block of findAllRichBlockTokens(plain, BUTTON_BLOCK_TYPE)) {
    const rowId = readRowId(block.attrs);
    if (!rowId) continue;
    out.push({ rowId, start: block.start, end: block.end });
  }
  return out;
}

/**
 * Parse composer shortcut without `rowId`.
 * - `![button: label=Visit, url=https://…]`
 * - `![button: label=OK, style=primary, id=confirm]`
 * - `![buttonRow: buttons="A|link|https://a.com;B|secondary|cancel"]`
 */
export function parseButtonRowShortcut(raw: string): ButtonRowAttrs | null {
  const block = parseRichBlockToken(raw.trim());
  if (!block) return null;
  if (readRowId(block.attrs)) return null;

  if (block.type === BUTTON_ROW_BLOCK_TYPE) {
    const buttons = parseButtonsAttr(block.attrs.buttons);
    if (!buttons?.length) return null;
    return { rowId: '', buttons };
  }

  if (block.type !== BUTTON_BLOCK_TYPE) return null;
  const buttonsFromList = parseButtonsAttr(block.attrs.buttons);
  if (buttonsFromList?.length) {
    return { rowId: '', buttons: buttonsFromList };
  }
  const single = parseSingleButtonShortcut(block.attrs);
  if (!single) return null;
  return { rowId: '', buttons: single };
}

export function randomButtonRowId(): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isValidButtonRowButton(btn: ButtonRowButton): boolean {
  const label = clipLabel(btn.label);
  if (!label) return false;
  if (
    btn.style !== DISCORD_BUTTON_STYLE.PRIMARY &&
    btn.style !== DISCORD_BUTTON_STYLE.SECONDARY &&
    btn.style !== DISCORD_BUTTON_STYLE.SUCCESS &&
    btn.style !== DISCORD_BUTTON_STYLE.DANGER &&
    btn.style !== DISCORD_BUTTON_STYLE.LINK
  ) {
    return false;
  }
  if (btn.style === DISCORD_BUTTON_STYLE.LINK) {
    const url = (btn.url ?? '').trim();
    return url.length > 0 && /^https?:\/\//i.test(url);
  }
  return Boolean((btn.customId ?? '').trim());
}

export function normalizeButtonRowButtons(
  buttons: ButtonRowButton[] | undefined,
): ButtonRowButton[] {
  if (!buttons?.length) return [];
  return buttons
    .slice(0, BUTTON_ROW_LIMITS.maxButtonsPerRow)
    .filter(isValidButtonRowButton)
    .map((btn) => ({
      label: clipLabel(btn.label),
      style: btn.style,
      ...(btn.url ? { url: btn.url.trim() } : {}),
      ...(btn.customId ? { customId: btn.customId.trim() } : {}),
      ...(btn.disabled ? { disabled: true } : {}),
      ...(btn.emoji ? { emoji: btn.emoji } : {}),
    }));
}
