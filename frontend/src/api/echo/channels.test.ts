import { describe, expect, it } from 'vitest';
import { echoChannelRowToChannelSummary } from './channels';
import type { EchoChannelRow } from './types';

function paperRow(overrides: Partial<EchoChannelRow> = {}): EchoChannelRow {
  return {
    id: 'ch-paper',
    name: 'Notes',
    type: 'paper',
    categoryId: 'cat-1',
    categoryName: 'Docs',
    categoryPosition: 0,
    position: 0,
    slowmodeSeconds: 0,
    userLimit: 0,
    bitrateBps: null,
    nsfw: false,
    paperCommentsEnabled: true,
    paperShowAuthorGutter: false,
    ...overrides,
  };
}

describe('echoChannelRowToChannelSummary', () => {
  it('preserves paper channel type and paper settings after workspace refresh', () => {
    const summary = echoChannelRowToChannelSummary(paperRow(), 'srv-1');
    expect(summary.type).toBe('paper');
    expect(summary.paperCommentsEnabled).toBe(true);
    expect(summary.paperShowAuthorGutter).toBe(false);
  });

  it('does not treat paper channels as text', () => {
    const summary = echoChannelRowToChannelSummary(
      paperRow({ paperCommentsEnabled: false }),
      'srv-1',
    );
    expect(summary.type).not.toBe('text');
    expect(summary.paperCommentsEnabled).toBe(false);
  });
});
