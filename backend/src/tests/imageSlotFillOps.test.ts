import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { fillEchoMessageImageSlot } from '../domain/imageSlotFillOps';

const emptySlotDoc = {
  type: 'doc',
  content: [
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

function mockPool(
  rows: {
    authorId?: string;
    deleted?: boolean;
    messageFormatVersion?: number;
    contentJson?: unknown;
    contentSchemaVersion?: number;
  } = {},
): pg.Pool {
  const authorId = rows.authorId ?? 'author-1';
  const deleted = rows.deleted ?? false;
  const messageFormatVersion = rows.messageFormatVersion ?? 2;
  const contentJson = rows.contentJson ?? emptySlotDoc;
  const contentSchemaVersion = rows.contentSchemaVersion ?? 2;

  return {
    query: async (sql: string) => {
      if (sql.includes('author_id') && sql.includes('deleted_at')) {
        return {
          rows: deleted
            ? []
            : [
                {
                  author_id: authorId,
                  deleted_at: null,
                  message_format_version: messageFormatVersion,
                },
              ],
        };
      }
      if (sql.includes('content_json')) {
        return {
          rows: [
            {
              content_json: contentJson,
              content_schema_version: contentSchemaVersion,
            },
          ],
        };
      }
      if (sql.includes('UPDATE echo_messages')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT gif')) {
        return {
          rows: [
            {
              gif: false,
              image_url: null,
              search_index_text: '',
              attachments: null,
              stickers: null,
              embeds: null,
            },
          ],
        };
      }
      return { rows: [] };
    },
  } as unknown as pg.Pool;
}

describe('fillEchoMessageImageSlot', () => {
  it('returns not_found when message row is missing', async () => {
    const pool = {
      query: async () => ({ rows: [] }),
    } as unknown as pg.Pool;
    const result = await fillEchoMessageImageSlot(
      pool,
      'ch1',
      'msg1',
      'author-1',
      'slot-1',
      { imageUrl: 'https://example.com/a.png' },
    );
    expect(result).toEqual({ ok: false, code: 'not_found' });
  });

  it('returns forbidden for non-author', async () => {
    const pool = mockPool({ authorId: 'other-user' });
    const result = await fillEchoMessageImageSlot(
      pool,
      'ch1',
      'msg1',
      'editor-1',
      'slot-1',
      { imageUrl: 'https://example.com/a.png' },
    );
    expect(result).toEqual({ ok: false, code: 'forbidden' });
  });

  it('returns invalid_format for legacy message format', async () => {
    const pool = mockPool({ messageFormatVersion: 1 });
    const result = await fillEchoMessageImageSlot(
      pool,
      'ch1',
      'msg1',
      'author-1',
      'slot-1',
      { imageUrl: 'https://example.com/a.png' },
    );
    expect(result).toEqual({ ok: false, code: 'invalid_format' });
  });

  it('returns slot_not_found for unknown slot id', async () => {
    const pool = mockPool();
    const result = await fillEchoMessageImageSlot(
      pool,
      'ch1',
      'msg1',
      'author-1',
      'missing-slot',
      { imageUrl: 'https://example.com/a.png' },
    );
    expect(result).toEqual({ ok: false, code: 'slot_not_found' });
  });

  it('fills an empty slot for the author', async () => {
    const pool = mockPool();
    const result = await fillEchoMessageImageSlot(
      pool,
      'ch1',
      'msg1',
      'author-1',
      'slot-1',
      {
        imageUrl: 'https://example.com/a.png',
        width: 640,
        height: 360,
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toContain('![image: ratio=16:9, slotId=slot-1]');
      const doc = result.contentJson as {
        content?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
      };
      const slot = doc.content?.[0];
      expect(slot?.type).toBe('imageSlot');
      expect(slot?.attrs?.imageUrl).toBe('https://example.com/a.png');
      expect(slot?.attrs?.width).toBe(640);
      expect(slot?.attrs?.height).toBe(360);
    }
  });
});
