/* @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { parseMessageContent } from '@/composables/useMarkdown';

describe('useMarkdown alerts', () => {
  it('renders markdown NOTE/TIP/IMPORTANT/WARNING/CAUTION as alert blocks', () => {
    const src = [
      '> [!NOTE]',
      '> note body',
      '',
      '> [!TIP]',
      '> tip body',
      '',
      '> [!IMPORTANT]',
      '> important body',
      '',
      '> [!WARNING]',
      '> warning body',
      '',
      '> [!CAUTION]',
      '> caution body',
    ].join('\n');
    const out = parseMessageContent(src);
    expect(out).toContain('md-alert md-alert--note');
    expect(out).toContain('md-alert md-alert--tip');
    expect(out).toContain('md-alert md-alert--important');
    expect(out).toContain('md-alert md-alert--warning');
    expect(out).toContain('md-alert md-alert--caution');
    expect(out).toContain('md-alert__title');
    expect(out).toContain('note body');
    expect(out).not.toContain('[!NOTE]');
  });

  it('keeps regular blockquote rendering when no alert marker exists', () => {
    const out = parseMessageContent('> plain quote');
    expect(out).toContain('<blockquote>');
    expect(out).not.toContain('md-alert');
  });
});
