import { describe, expect, it, vi } from 'vitest';
import { createSlashCommandSuggestableConfig } from '@/suggestables/adapters/slashCommandSuggestable';
import { buildChatSlashCommands } from '@/features/chat/slashCommands/chatSlashCommands';

describe('slashCommandSuggestable', () => {
  it('detects slash trigger and applies command by clearing the token', () => {
    const replaceRange = vi.fn();
    const onCommand = vi.fn();
    const commands = buildChatSlashCommands({
      mediaAllowed: true,
      pollAllowed: true,
      editingMessage: false,
    });
    const config = createSlashCommandSuggestableConfig(
      replaceRange,
      onCommand,
      { getCommands: () => commands },
    );

    const trigger = config.detectTrigger({ text: 'hello /po', cursor: 9 });
    expect(trigger).toEqual({ start: 6, query: 'po' });

    const suggestions = config.getSuggestions('po', {
      text: 'hello /po',
      cursor: 9,
    });
    expect(suggestions.some((c) => c.name === 'poll')).toBe(true);

    const poll = commands.find((c) => c.name === 'poll');
    expect(poll).toBeDefined();
    config.applySelection(
      poll!,
      { start: 6, end: 9 },
      { text: 'hello /po', cursor: 9 },
    );
    expect(replaceRange).toHaveBeenCalledWith(6, 9, '');
    expect(onCommand).toHaveBeenCalledWith(poll);
  });
});
