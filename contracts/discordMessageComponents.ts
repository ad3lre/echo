/** Discord `MessageFlags.IS_COMPONENTS_V2` (`1 << 15`). */
export const DISCORD_MSG_FLAG_IS_COMPONENTS_V2 = 1 << 15;

export const DISCORD_COMPONENT_TYPE = {
  ACTION_ROW: 1,
  BUTTON: 2,
  STRING_SELECT: 3,
  TEXT_DISPLAY: 10,
  CONTAINER: 17,
  SEPARATOR: 14,
} as const;

export const DISCORD_BUTTON_STYLE = {
  PRIMARY: 1,
  SECONDARY: 2,
  SUCCESS: 3,
  DANGER: 4,
  LINK: 5,
} as const;

export type DiscordComponentEmoji = {
  name?: string;
  id?: string;
  animated?: boolean;
};

export type DiscordMessageButton = {
  label: string;
  style: 1 | 2 | 3 | 4 | 5;
  customId?: string;
  url?: string;
  disabled?: boolean;
  emoji?: DiscordComponentEmoji;
};

export type DiscordActionRow = {
  buttons: DiscordMessageButton[];
};

export type DiscordParsedMessageComponents = {
  componentsV2: boolean;
  textBlocks: string[];
  actionRows: DiscordActionRow[];
};

const MAX_ACTION_ROWS = 5;
const MAX_BUTTONS_PER_ROW = 5;
const MAX_LABEL_LEN = 80;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function clipLabel(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return '';
  return s.length <= MAX_LABEL_LEN ? s : s.slice(0, MAX_LABEL_LEN);
}

function parseEmoji(raw: unknown): DiscordComponentEmoji | undefined {
  const o = asRecord(raw);
  if (!o) return undefined;
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  const id = typeof o.id === 'string' ? o.id.trim() : '';
  if (!name && !id) return undefined;
  return {
    ...(name ? { name } : {}),
    ...(id ? { id } : {}),
    ...(o.animated === true ? { animated: true } : {}),
  };
}

function parseButton(raw: unknown): DiscordMessageButton | null {
  const o = asRecord(raw);
  if (!o || Number(o.type) !== DISCORD_COMPONENT_TYPE.BUTTON) return null;

  const styleNum = Number(o.style);
  if (
    styleNum !== DISCORD_BUTTON_STYLE.PRIMARY &&
    styleNum !== DISCORD_BUTTON_STYLE.SECONDARY &&
    styleNum !== DISCORD_BUTTON_STYLE.SUCCESS &&
    styleNum !== DISCORD_BUTTON_STYLE.DANGER &&
    styleNum !== DISCORD_BUTTON_STYLE.LINK
  ) {
    return null;
  }

  const label = clipLabel(o.label);
  const emoji = parseEmoji(o.emoji);
  if (!label && !emoji) return null;

  const url =
    typeof o.url === 'string' && o.url.trim()
      ? o.url.trim().slice(0, 2048)
      : '';
  const customId =
    typeof o.custom_id === 'string' && o.custom_id.trim()
      ? o.custom_id.trim().slice(0, 100)
      : '';

  if (styleNum === DISCORD_BUTTON_STYLE.LINK) {
    if (!url) return null;
  } else if (!customId) {
    return null;
  }

  return {
    label,
    style: styleNum,
    ...(customId ? { customId } : {}),
    ...(url ? { url } : {}),
    ...(o.disabled === true ? { disabled: true } : {}),
    ...(emoji ? { emoji } : {}),
  };
}

function parseActionRow(raw: unknown): DiscordActionRow | null {
  const o = asRecord(raw);
  if (!o || Number(o.type) !== DISCORD_COMPONENT_TYPE.ACTION_ROW) return null;
  if (!Array.isArray(o.components)) return null;

  const buttons: DiscordMessageButton[] = [];
  for (const child of o.components) {
    if (buttons.length >= MAX_BUTTONS_PER_ROW) break;
    const btn = parseButton(child);
    if (btn) buttons.push(btn);
  }
  if (!buttons.length) return null;
  return { buttons };
}

function parseTextDisplay(raw: unknown): string | null {
  const o = asRecord(raw);
  if (!o || Number(o.type) !== DISCORD_COMPONENT_TYPE.TEXT_DISPLAY) return null;
  const content = typeof o.content === 'string' ? o.content : '';
  if (!content.trim()) return null;
  return content;
}

function walkComponentsV2(
  nodes: unknown[],
  out: { textBlocks: string[]; actionRows: DiscordActionRow[] },
): void {
  for (const node of nodes) {
    const o = asRecord(node);
    if (!o) continue;
    const type = Number(o.type);

    if (type === DISCORD_COMPONENT_TYPE.TEXT_DISPLAY) {
      const text = parseTextDisplay(o);
      if (text) out.textBlocks.push(text);
      continue;
    }

    if (type === DISCORD_COMPONENT_TYPE.ACTION_ROW) {
      if (out.actionRows.length >= MAX_ACTION_ROWS) continue;
      const row = parseActionRow(o);
      if (row) out.actionRows.push(row);
      continue;
    }

    if (
      type === DISCORD_COMPONENT_TYPE.CONTAINER &&
      Array.isArray(o.components)
    ) {
      walkComponentsV2(o.components, out);
      continue;
    }

    if (type === DISCORD_COMPONENT_TYPE.SEPARATOR) {
      out.textBlocks.push('---');
    }
  }
}

/** Normalize Discord message `components` JSON for Echo UI rendering. */
export function parseDiscordMessageComponents(
  raw: unknown,
  messageFlags?: number,
): DiscordParsedMessageComponents | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const componentsV2 =
    messageFlags != null &&
    Number.isFinite(messageFlags) &&
    (Math.floor(messageFlags) & DISCORD_MSG_FLAG_IS_COMPONENTS_V2) !== 0;

  if (componentsV2) {
    const acc = {
      textBlocks: [] as string[],
      actionRows: [] as DiscordActionRow[],
    };
    walkComponentsV2(raw, acc);
    if (!acc.textBlocks.length && !acc.actionRows.length) return null;
    return {
      componentsV2: true,
      textBlocks: acc.textBlocks,
      actionRows: acc.actionRows.slice(0, MAX_ACTION_ROWS),
    };
  }

  const actionRows: DiscordActionRow[] = [];
  for (const node of raw) {
    if (actionRows.length >= MAX_ACTION_ROWS) break;
    const row = parseActionRow(node);
    if (row) actionRows.push(row);
  }
  if (!actionRows.length) return null;
  return { componentsV2: false, textBlocks: [], actionRows };
}
