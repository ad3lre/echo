import { describe, expect, it } from 'vitest';
import {
  buildChatSlashCommands,
  filterSlashCommands,
  slashCommandGroupLabel,
} from '@/features/chat/chatSlashCommands';

describe('buildChatSlashCommands', () => {
  it('includes media, blocks, markdown, and math commands when allowed', () => {
    const cmds = buildChatSlashCommands({
      mediaAllowed: true,
      pollAllowed: true,
      editingMessage: false,
    });
    expect(cmds.some((c) => c.name === 'upload')).toBe(true);
    expect(cmds.some((c) => c.name === 'gif')).toBe(true);
    expect(cmds.some((c) => c.name === 'poll')).toBe(true);
    expect(cmds.some((c) => c.name === 'image')).toBe(true);
    expect(cmds.some((c) => c.name === 'imageslot-4-3')).toBe(true);
    expect(cmds.some((c) => c.name === 'buttonrow-confirm')).toBe(true);
    expect(cmds.some((c) => c.name === 'button-link')).toBe(true);
    expect(cmds.some((c) => c.name === 'bold')).toBe(true);
    expect(cmds.some((c) => c.name === 'codeblock')).toBe(true);
    expect(cmds.some((c) => c.name === 'alert-note')).toBe(true);
    expect(cmds.some((c) => c.name === 'math')).toBe(true);
    expect(cmds.some((c) => c.name === 'matrix')).toBe(true);
  });

  it('omits poll while editing and when poll send is blocked', () => {
    const editing = buildChatSlashCommands({
      mediaAllowed: true,
      pollAllowed: true,
      editingMessage: true,
    });
    expect(editing.some((c) => c.name === 'poll')).toBe(false);

    const blocked = buildChatSlashCommands({
      mediaAllowed: true,
      pollAllowed: false,
      editingMessage: false,
    });
    expect(blocked.some((c) => c.name === 'poll')).toBe(false);
  });

  it('omits upload and gif when media send is blocked', () => {
    const cmds = buildChatSlashCommands({
      mediaAllowed: false,
      pollAllowed: true,
      editingMessage: false,
    });
    expect(cmds.some((c) => c.name === 'upload')).toBe(false);
    expect(cmds.some((c) => c.name === 'gif')).toBe(false);
    expect(cmds.some((c) => c.name === 'imageslot-4-3')).toBe(true);
    expect(cmds.some((c) => c.name === 'mathblock')).toBe(true);
  });

  it('assigns rich block actions with button presets', () => {
    const link = buildChatSlashCommands({
      mediaAllowed: true,
      pollAllowed: true,
      editingMessage: false,
    }).find((c) => c.name === 'button-link');
    expect(link?.action.type).toBe('button-row');
    if (link?.action.type === 'button-row') {
      expect(link.action.buttons[0]?.url).toContain('https://');
    }
  });
});

describe('filterSlashCommands', () => {
  const commands = buildChatSlashCommands({
    mediaAllowed: true,
    pollAllowed: true,
    editingMessage: false,
  });

  it('filters by command prefix', () => {
    const filtered = filterSlashCommands(commands, 'imageslot-4');
    expect(filtered.map((c) => c.name)).toEqual(['imageslot-4-3']);
  });

  it('maps the default 16:9 slot to /image', () => {
    const filtered = filterSlashCommands(commands, '16:9');
    expect(filtered.some((c) => c.name === 'image')).toBe(true);
  });

  it('finds markdown commands by keyword', () => {
    const filtered = filterSlashCommands(commands, 'blockquote');
    expect(filtered.some((c) => c.name === 'quote')).toBe(true);
  });

  it('finds math commands by alias', () => {
    const filtered = filterSlashCommands(commands, 'latex');
    expect(filtered.some((c) => c.name === 'math')).toBe(true);
  });

  it('returns grouped commands for an empty query', () => {
    const filtered = filterSlashCommands(commands, '');
    expect(filtered.length).toBe(commands.length);
    expect(filtered[0]?.group).toBe('media');
  });
});

describe('slashCommandGroupLabel', () => {
  it('returns human labels for groups', () => {
    expect(slashCommandGroupLabel('math')).toContain('Math');
  });
});
