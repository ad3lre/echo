import { useSuggestable } from '@/suggestables/useSuggestable';
import type {
  SuggestableConfig,
  SuggestableInputContext,
  SuggestableSelectionRange,
  SuggestableSession,
} from '@/suggestables/types';
import {
  filterSlashCommands,
  type ChatSlashCommand,
} from '@/features/chat/chatSlashCommands';

/** `/command` at line start or after whitespace. */
const SLASH_TRIGGER = /(?:^|\s)\/([a-z0-9-]*)$/i;
const SLASH_TRIGGER_FROM_START = /^\/([a-z0-9-]*)/i;

const SUGGESTION_LIMIT = 14;

export type SlashCommandSuggestableOptions = {
  getCommands: () => readonly ChatSlashCommand[];
};

function detectSlashTrigger(
  ctx: SuggestableInputContext,
): { start: number; query: string } | null {
  const before = ctx.text.slice(0, ctx.cursor);
  const match = before.match(SLASH_TRIGGER);
  if (!match) return null;
  const leading = match[0].startsWith('/') ? 0 : 1;
  return {
    start: ctx.cursor - match[0].length + leading,
    query: match[1] ?? '',
  };
}

function currentSlashTriggerRange(
  ctx: SuggestableInputContext,
): SuggestableSelectionRange | null {
  const before = ctx.text.slice(0, ctx.cursor);
  const match = before.match(SLASH_TRIGGER);
  if (!match) return null;
  const leading = match[0].startsWith('/') ? 0 : 1;
  const start = ctx.cursor - match[0].length + leading;
  return { start, end: ctx.cursor };
}

function slashTriggerRangeFromState(
  ctx: SuggestableInputContext,
  triggerStart: number,
): SuggestableSelectionRange | null {
  if (triggerStart < 0 || triggerStart >= ctx.text.length) return null;
  if (ctx.text[triggerStart] !== '/') return null;
  const match = ctx.text.slice(triggerStart).match(SLASH_TRIGGER_FROM_START);
  if (!match) return null;
  const end = triggerStart + match[0].length;
  return { start: triggerStart, end: Math.min(end, ctx.cursor) };
}

function resolveSlashSelectionRange(
  ctx: SuggestableInputContext,
  triggerStart: number,
): SuggestableSelectionRange | null {
  const cursorRange = currentSlashTriggerRange(ctx);
  const stateRange = slashTriggerRangeFromState(ctx, triggerStart);
  if (cursorRange && stateRange && cursorRange.start === stateRange.start) {
    return {
      start: cursorRange.start,
      end: Math.max(cursorRange.end, stateRange.end),
    };
  }
  return cursorRange ?? stateRange;
}

export function createSlashCommandSuggestableConfig(
  replaceRange: (start: number, end: number, text: string) => void,
  onCommand: (command: ChatSlashCommand) => void,
  options: SlashCommandSuggestableOptions,
): SuggestableConfig<ChatSlashCommand> {
  return {
    showWithEmptyQuery: true,
    detectTrigger: detectSlashTrigger,
    getSuggestions: (query) =>
      filterSlashCommands(options.getCommands(), query).slice(
        0,
        SUGGESTION_LIMIT,
      ),
    resolveSelectionRange: resolveSlashSelectionRange,
    applySelection: (command, range) => {
      replaceRange(range.start, range.end, '');
      onCommand(command);
    },
  };
}

export function useSlashCommandSuggestable(
  getText: () => string,
  getCursorOffset: () => number,
  replaceRange: (start: number, end: number, text: string) => void,
  onCommand: (command: ChatSlashCommand) => void,
  options: SlashCommandSuggestableOptions,
): SuggestableSession<ChatSlashCommand> {
  return useSuggestable(
    getText,
    getCursorOffset,
    createSlashCommandSuggestableConfig(replaceRange, onCommand, options),
  );
}
