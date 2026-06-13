/* @vitest-environment happy-dom */
import type { Embed, MentionEntity } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { PUBLIC_INVITE_BASE } from '@/config';
import {
  buildEchoMessageContentSegments,
  buildRenderedEchoMessageSegments,
  echoMessageSegmentRowKey,
} from './messageContentSegments';

function jumpEmbed(url: string): Embed {
  return {
    url,
    echoJump: { channelId: 'ch1', messageId: 'm1' },
  } as Embed;
}

describe('buildEchoMessageContentSegments', () => {
  it('returns no segments for empty content (invite pass drops empty text)', () => {
    expect(buildEchoMessageContentSegments('', undefined)).toEqual([]);
  });

  it('returns a single text segment for plain content', () => {
    expect(buildEchoMessageContentSegments('hello', undefined)).toEqual([
      { type: 'text', text: 'hello' },
    ]);
  });

  it('splits invite URLs using configured public invite base', () => {
    const base = PUBLIC_INVITE_BASE.replace(/\/$/, '');
    const url = `${base}/invite/abcdef123456`;
    const parts = buildEchoMessageContentSegments(`join ${url} now`, undefined);
    expect(parts).toEqual([
      { type: 'text', text: 'join ' },
      { type: 'invite', url },
      { type: 'text', text: ' now' },
    ]);
  });

  it('appends jump widget when href is only in contentJson', () => {
    const base = PUBLIC_INVITE_BASE.replace(/\/$/, '');
    const jumpUrl = `${base}/channels/ch-json/m-json`;
    const contentJson = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'linked',
              marks: [{ type: 'link', attrs: { href: jumpUrl } }],
            },
          ],
        },
      ],
    };
    const parts = buildEchoMessageContentSegments(
      'linked',
      undefined,
      contentJson,
    );
    expect(parts).toEqual([
      { type: 'text', text: 'linked' },
      {
        type: 'jump',
        url: jumpUrl,
        embed: expect.objectContaining({
          echoJump: { channelId: 'ch-json', messageId: 'm-json' },
        }),
      },
    ]);
  });

  it('includes imageSlot segments from contentJson', () => {
    const contentJson = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'before' }],
        },
        {
          type: 'imageSlot',
          attrs: {
            slotId: 'slot-1',
            aspectW: 16,
            aspectH: 9,
            imageUrl: null,
            storageKey: null,
            width: null,
            height: null,
          },
        },
      ],
    };
    const parts = buildEchoMessageContentSegments(
      'before\n![image: ratio=16:9, slotId=slot-1]',
      undefined,
      contentJson,
    );
    expect(parts).toEqual([
      { type: 'text', text: 'before' },
      {
        type: 'imageSlot',
        slotId: 'slot-1',
        aspectW: 16,
        aspectH: 9,
        imageUrl: null,
        width: null,
        height: null,
      },
    ]);
  });

  it('includes buttonRow segments from contentJson', () => {
    const contentJson = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'before' }],
        },
        {
          type: 'buttonRow',
          attrs: {
            rowId: 'row-1',
            buttons: [
              {
                label: 'Go',
                style: 5,
                url: 'https://example.com',
              },
            ],
          },
        },
      ],
    };
    const parts = buildEchoMessageContentSegments(
      'before\n![button: rowId=row-1]',
      undefined,
      contentJson,
    );
    expect(parts).toEqual([
      { type: 'text', text: 'before' },
      {
        type: 'buttonRow',
        rowId: 'row-1',
        buttons: [
          {
            label: 'Go',
            style: 5,
            url: 'https://example.com',
          },
        ],
      },
    ]);
  });

  it('interleaves jump embeds and invite splits in order', () => {
    const jumpUrl = 'https://echo.test/jump/1';
    const embeds = [jumpEmbed(jumpUrl)];
    const base = PUBLIC_INVITE_BASE.replace(/\/$/, '');
    const inviteUrl = `${base}/invite/abcdef123456`;
    const content = `a ${jumpUrl} b ${inviteUrl} c`;
    const parts = buildEchoMessageContentSegments(content, embeds);
    expect(parts).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'jump', url: jumpUrl, embed: embeds[0] },
      { type: 'text', text: ' b ' },
      { type: 'invite', url: inviteUrl },
      { type: 'text', text: ' c' },
    ]);
  });
});

describe('buildRenderedEchoMessageSegments', () => {
  it('applies markdown to text segments', () => {
    const rows = buildRenderedEchoMessageSegments('**bold**', undefined);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.type).toBe('text');
    if (row?.type === 'text') {
      expect(row.html).toContain('strong');
      expect(row.html.toLowerCase()).toContain('bold');
    }
  });

  it('passes mention entities into parseMessageContent for channel styling', () => {
    const mentions: MentionEntity[] = [
      {
        id: 'c1',
        kind: 'channel',
        label: 'general',
        start: 0,
        end: 9,
      },
    ];
    const rows = buildRenderedEchoMessageSegments(
      '#general',
      undefined,
      mentions,
    );
    const row = rows[0];
    expect(row?.type).toBe('text');
    if (row?.type === 'text') {
      expect(row.html).toContain('mention');
      expect(row.html).toContain('mention--channel');
    }
  });
});

describe('echoMessageSegmentRowKey', () => {
  it('prefixes by segment kind and index', () => {
    expect(
      echoMessageSegmentRowKey(
        { type: 'jump', url: 'u', embed: {} as Embed },
        2,
      ),
    ).toBe('j-2-u');
    expect(echoMessageSegmentRowKey({ type: 'invite', url: 'u' }, 1)).toBe(
      'i-1-u',
    );
    expect(
      echoMessageSegmentRowKey({ type: 'text', text: 'hello', html: '' }, 0),
    ).toBe('t-0-hello');
  });
});
