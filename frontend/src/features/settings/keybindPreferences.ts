export type KeybindActionId =
  | 'voice.toggleMute'
  | 'voice.toggleDeafen'
  | 'navigation.quickSwitcher'
  | 'navigation.openSearch'
  | 'navigation.markChannelRead'
  | 'navigation.selectRailServer1'
  | 'navigation.selectRailServer2'
  | 'navigation.selectRailServer3'
  | 'navigation.selectRailServer4'
  | 'navigation.selectRailServer5'
  | 'composer.bold'
  | 'composer.italic'
  | 'composer.inlineCode'
  | 'composer.strike'
  | 'composer.spoiler';

export interface KeybindDefinition {
  id: KeybindActionId;
  action: string;
  binding: string;
}

export interface NormalizedKeybindCombo {
  ctrlOrMeta: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

const STORAGE_KEY = 'echo-keybind-preferences-v1';

const DEFAULT_KEYBINDS: Record<KeybindActionId, string> = {
  'voice.toggleMute': 'Ctrl+Shift+M',
  'voice.toggleDeafen': 'Ctrl+Shift+D',
  'navigation.quickSwitcher': 'Ctrl+K',
  'navigation.openSearch': 'Ctrl+F',
  /** Unbound: Esc is reserved for closing overlays, fullscreen, etc. */
  'navigation.markChannelRead': '',
  /**
   * Ctrl+Shift+digit avoids Ctrl+1..5 (browser tab switching). Slots match the
   * first five icons on the server rail (starred + MRU), left-to-top order.
   */
  'navigation.selectRailServer1': 'Ctrl+Shift+1',
  'navigation.selectRailServer2': 'Ctrl+Shift+2',
  'navigation.selectRailServer3': 'Ctrl+Shift+3',
  'navigation.selectRailServer4': 'Ctrl+Shift+4',
  'navigation.selectRailServer5': 'Ctrl+Shift+5',
  'composer.bold': 'Ctrl+B',
  'composer.italic': 'Ctrl+I',
  'composer.inlineCode': 'Ctrl+E',
  'composer.strike': 'Ctrl+Shift+S',
  'composer.spoiler': 'Ctrl+Shift+H',
};

const ACTION_TITLES: Record<KeybindActionId, string> = {
  'voice.toggleMute': 'Mute / Unmute',
  'voice.toggleDeafen': 'Toggle Deafen',
  'navigation.quickSwitcher': 'Quick Switcher',
  'navigation.openSearch': 'Open Search',
  'navigation.markChannelRead': 'Mark Channel Read',
  'navigation.selectRailServer1': 'Server rail: 1st slot',
  'navigation.selectRailServer2': 'Server rail: 2nd slot',
  'navigation.selectRailServer3': 'Server rail: 3rd slot',
  'navigation.selectRailServer4': 'Server rail: 4th slot',
  'navigation.selectRailServer5': 'Server rail: 5th slot',
  'composer.bold': 'Bold (message composer)',
  'composer.italic': 'Italic (message composer)',
  'composer.inlineCode': 'Inline code (message composer)',
  'composer.strike': 'Strikethrough (message composer)',
  'composer.spoiler': 'Spoiler (message composer)',
};

export const KEYBIND_ACTION_ORDER: KeybindActionId[] = [
  'voice.toggleMute',
  'voice.toggleDeafen',
  'navigation.quickSwitcher',
  'navigation.openSearch',
  'navigation.markChannelRead',
  'navigation.selectRailServer1',
  'navigation.selectRailServer2',
  'navigation.selectRailServer3',
  'navigation.selectRailServer4',
  'navigation.selectRailServer5',
  'composer.bold',
  'composer.italic',
  'composer.inlineCode',
  'composer.strike',
  'composer.spoiler',
];

function readStored(): Partial<Record<KeybindActionId, string>> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<Record<KeybindActionId, string>>;
  } catch {
    return {};
  }
}

export function loadKeybindMap(): Record<KeybindActionId, string> {
  const stored = readStored();
  const merged = { ...DEFAULT_KEYBINDS, ...stored };
  if (merged['navigation.markChannelRead'] === 'Esc') {
    merged['navigation.markChannelRead'] = '';
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      }
    } catch {
      /* ignore */
    }
  }
  return merged;
}

export function saveKeybindMap(
  next: Partial<Record<KeybindActionId, string>>,
): Record<KeybindActionId, string> {
  const merged = { ...loadKeybindMap(), ...next };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      /* ignore */
    }
  }
  return merged;
}

export function resetKeybindsToDefaults(): Record<KeybindActionId, string> {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  return { ...DEFAULT_KEYBINDS };
}

export function listKeybindDefinitions(): KeybindDefinition[] {
  const map = loadKeybindMap();
  return KEYBIND_ACTION_ORDER.map((id) => ({
    id,
    action: ACTION_TITLES[id],
    binding: map[id],
  }));
}

export function keybindActionTitle(id: KeybindActionId): string {
  return ACTION_TITLES[id];
}

export function normalizeBindingString(binding: string): string {
  const cleaned = binding
    .trim()
    .replace(/\s+/g, '')
    .replace(/Command/gi, 'Cmd')
    .replace(/Control/gi, 'Ctrl');
  return cleaned;
}

export function normalizeKeyFromKeyboardEvent(e: KeyboardEvent): string {
  const key = e.key ?? '';
  if (key === ' ') return 'Space';
  if (key === 'Escape') return 'Esc';
  if (e.code === 'Backquote') return '`';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export function eventToBindingString(e: KeyboardEvent): string {
  const key = normalizeKeyFromKeyboardEvent(e);
  const parts: string[] = [];
  const lower = key.toLowerCase();
  const keyIsCtrl = lower === 'control' || lower === 'ctrl' || lower === 'meta';
  const keyIsShift = lower === 'shift';
  const keyIsAlt = lower === 'alt' || lower === 'option';
  if ((e.ctrlKey || e.metaKey) && !keyIsCtrl) parts.push('Ctrl');
  if (e.shiftKey && !keyIsShift) parts.push('Shift');
  if (e.altKey && !keyIsAlt) parts.push('Alt');
  parts.push(keyIsCtrl ? 'Ctrl' : keyIsAlt ? 'Alt' : key);
  return parts.join('+');
}

export function parseBinding(binding: string): NormalizedKeybindCombo | null {
  const parts = normalizeBindingString(binding).split('+').filter(Boolean);
  if (parts.length === 0) return null;
  let ctrlOrMeta = false;
  let shift = false;
  let alt = false;
  let key = '';
  for (const part of parts) {
    const p = part.toLowerCase();
    if (p === 'ctrl' || p === 'cmd' || p === 'meta') {
      ctrlOrMeta = true;
      continue;
    }
    if (p === 'shift') {
      shift = true;
      continue;
    }
    if (p === 'alt' || p === 'option') {
      alt = true;
      continue;
    }
    key = part;
  }
  if (!key) return null;
  return { ctrlOrMeta, shift, alt, key: key.toUpperCase() };
}

export function matchesBinding(e: KeyboardEvent, binding: string): boolean {
  const combo = parseBinding(binding);
  if (!combo) return false;
  const eventKey = normalizeKeyFromKeyboardEvent(e).toUpperCase();
  return (
    combo.ctrlOrMeta === (e.ctrlKey || e.metaKey) &&
    combo.shift === e.shiftKey &&
    combo.alt === e.altKey &&
    combo.key === eventKey
  );
}

export function findActionForKeyboardEvent(
  e: KeyboardEvent,
): KeybindActionId | null {
  const map = loadKeybindMap();
  const actionIds = Object.keys(map) as KeybindActionId[];
  for (const id of actionIds) {
    if (matchesBinding(e, map[id])) return id;
  }
  return null;
}
