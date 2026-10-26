import {
  DISCORD_BUTTON_STYLE,
  DISCORD_COMPONENT_TYPE,
} from '../../../../../contracts/discordMessageComponents';
import { sanitizeWebhookLinkUrl } from '../uploads/webhookMediaUrl';

export const WEBHOOK_COMPONENTS_MAX_ROWS = 5;
export const WEBHOOK_COMPONENTS_MAX_BUTTONS_PER_ROW = 5;
export const WEBHOOK_COMPONENTS_MAX_DEPTH = 4;
export const WEBHOOK_COMPONENTS_MAX_TOP_LEVEL = 10;
export const WEBHOOK_COMPONENTS_MAX_NODES = 50;
const MAX_LABEL = 80;
const MAX_CUSTOM_ID = 100;
const MAX_URL = 512;
const MAX_TEXT = 4000;
const MAX_EMOJI_NAME = 64;
const MAX_EMOJI_ID = 32;

type Rec = Record<string, unknown>;
type Budget = { rows: number; nodes: number };

function asRecord(v: unknown): Rec | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : null;
}

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function safeButtonUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const t = raw.trim();
  if (!t || t.length > MAX_URL) return undefined;
  const safe = sanitizeWebhookLinkUrl(t);
  if (!safe) return undefined;
  try {
    const u = new URL(safe);
    if (u.username || u.password) return undefined;
  } catch {
    return undefined;
  }
  return safe;
}

function sanitizeEmoji(raw: unknown): Rec | undefined {
  const o = asRecord(raw);
  if (!o) return undefined;
  const name = str(o.name, MAX_EMOJI_NAME);
  const id = str(o.id, MAX_EMOJI_ID);
  if (!name && !id) return undefined;
  return {
    ...(name ? { name } : {}),
    ...(id ? { id } : {}),
    ...(o.animated === true ? { animated: true } : {}),
  };
}

function sanitizeButton(raw: unknown): Rec | null {
  const o = asRecord(raw);
  if (!o || Number(o.type) !== DISCORD_COMPONENT_TYPE.BUTTON) return null;
  const style = Number(o.style);
  if (
    style !== DISCORD_BUTTON_STYLE.PRIMARY &&
    style !== DISCORD_BUTTON_STYLE.SECONDARY &&
    style !== DISCORD_BUTTON_STYLE.SUCCESS &&
    style !== DISCORD_BUTTON_STYLE.DANGER &&
    style !== DISCORD_BUTTON_STYLE.LINK
  ) {
    return null;
  }
  const label = str(o.label, MAX_LABEL);
  const emoji = sanitizeEmoji(o.emoji);
  if (!label && !emoji) return null;

  const out: Rec = { type: DISCORD_COMPONENT_TYPE.BUTTON, style };
  if (label) out.label = label;
  if (emoji) out.emoji = emoji;
  if (o.disabled === true) out.disabled = true;
  if (style === DISCORD_BUTTON_STYLE.LINK) {
    const url = safeButtonUrl(o.url);
    if (!url) return null;
    out.url = url;
  } else {
    const customId = str(o.custom_id, MAX_CUSTOM_ID);
    if (!customId) return null;
    out.custom_id = customId;
  }
  return out;
}

function sanitizeActionRow(raw: Rec, budget: Budget): Rec | null {
  if (!Array.isArray(raw.components)) return null;
  if (budget.rows >= WEBHOOK_COMPONENTS_MAX_ROWS) return null;
  const buttons: Rec[] = [];
  for (const child of raw.components.slice(
    0,
    WEBHOOK_COMPONENTS_MAX_BUTTONS_PER_ROW * 2,
  )) {
    if (buttons.length >= WEBHOOK_COMPONENTS_MAX_BUTTONS_PER_ROW) break;
    const b = sanitizeButton(child);
    if (b) buttons.push(b);
  }
  if (!buttons.length) return null;
  budget.rows += 1;
  return { type: DISCORD_COMPONENT_TYPE.ACTION_ROW, components: buttons };
}

function sanitizeNode(raw: unknown, depth: number, budget: Budget): Rec | null {
  if (depth > WEBHOOK_COMPONENTS_MAX_DEPTH) return null;
  if (budget.nodes >= WEBHOOK_COMPONENTS_MAX_NODES) return null;
  budget.nodes += 1;
  const o = asRecord(raw);
  if (!o) return null;
  switch (Number(o.type)) {
    case DISCORD_COMPONENT_TYPE.ACTION_ROW:
      return sanitizeActionRow(o, budget);
    case DISCORD_COMPONENT_TYPE.TEXT_DISPLAY: {
      const content = typeof o.content === 'string' ? o.content : '';
      if (!content.trim()) return null;
      return {
        type: DISCORD_COMPONENT_TYPE.TEXT_DISPLAY,
        content: content.slice(0, MAX_TEXT),
      };
    }
    case DISCORD_COMPONENT_TYPE.SEPARATOR:
      return { type: DISCORD_COMPONENT_TYPE.SEPARATOR };
    case DISCORD_COMPONENT_TYPE.CONTAINER: {
      if (!Array.isArray(o.components)) return null;
      const children = sanitizeList(o.components, depth + 1, budget);
      if (!children.length) return null;
      return { type: DISCORD_COMPONENT_TYPE.CONTAINER, components: children };
    }
    default:
      return null;
  }
}

function sanitizeList(list: unknown[], depth: number, budget: Budget): Rec[] {
  const out: Rec[] = [];
  for (const item of list.slice(0, WEBHOOK_COMPONENTS_MAX_TOP_LEVEL)) {
    const n = sanitizeNode(item, depth, budget);
    if (n) out.push(n);
  }
  return out;
}

/**
 * Allowlist-sanitize Discord webhook `components` to the shapes the Echo client renders
 * (action rows + buttons, text display, separator, container). Unknown types/keys are dropped.
 */
export function sanitizeWebhookComponents(raw: unknown): Rec[] {
  if (!Array.isArray(raw)) return [];
  return sanitizeList(raw, 1, { rows: 0, nodes: 0 });
}
