import { describe, expect, it } from 'vitest';
import type { MentionEntity } from '@shared/types';
import {
  ECHO_OUTBOUND_MESSAGE_CHUNK_CHARS,
  mentionsForTextSlice,
  mentionsInTrimmedSlice,
  preparePlainTextChunks,
  echoHardFormatPrefixSatisfied,
  stripLeadingDuplicateHardFormatTemplate,
} from '@shared/messageChunkLimits';

describe('preparePlainTextChunks', () => {
  it('returns null when trimmed length is within chunk size', () => {
    expect(
      preparePlainTextChunks('a'.repeat(ECHO_OUTBOUND_MESSAGE_CHUNK_CHARS)),
    ).toBeNull();
    expect(preparePlainTextChunks('  hi  ', 2000)).toBeNull();
  });

  it('splits trimmed body into fixed-size chunks', () => {
    const plan = preparePlainTextChunks(
      'a'.repeat(ECHO_OUTBOUND_MESSAGE_CHUNK_CHARS + 3),
      ECHO_OUTBOUND_MESSAGE_CHUNK_CHARS,
    );
    expect(plan).not.toBeNull();
    expect(plan!.chunks).toHaveLength(2);
    expect(plan!.chunks[0]!.length).toBe(ECHO_OUTBOUND_MESSAGE_CHUNK_CHARS);
    expect(plan!.chunks[1]!.length).toBe(3);
    expect(plan!.trimStart).toBe(0);
    expect(plan!.trimEnd).toBe(ECHO_OUTBOUND_MESSAGE_CHUNK_CHARS + 3);
  });

  it('ignores leading and trailing whitespace for chunking only', () => {
    const inner = 'x'.repeat(ECHO_OUTBOUND_MESSAGE_CHUNK_CHARS + 1);
    const raw = `  ${inner}  `;
    const plan = preparePlainTextChunks(raw, ECHO_OUTBOUND_MESSAGE_CHUNK_CHARS);
    expect(plan).not.toBeNull();
    expect(plan!.trimStart).toBe(2);
    expect(plan!.trimEnd).toBe(2 + inner.length);
    expect(plan!.chunks.join('')).toBe(inner);
  });
});

describe('mention chunk mapping', () => {
  const m = (start: number, end: number): MentionEntity => ({
    id: '1',
    kind: 'user',
    label: '@u',
    start,
    end,
    userId: 'u1',
  });

  it('maps mentions into trimmed coordinates', () => {
    const raw = '  hello @u there ';
    const mentions: MentionEntity[] = [m(8, 11)];
    let trimStart = 0;
    let trimEnd = raw.length;
    while (trimStart < trimEnd && /\s/.test(raw[trimStart]!)) trimStart++;
    while (trimEnd > trimStart && /\s/.test(raw[trimEnd - 1]!)) trimEnd--;
    const shifted = mentionsInTrimmedSlice(mentions, trimStart, trimEnd);
    expect(shifted).toHaveLength(1);
    expect(shifted[0]!.start).toBe(6);
    expect(shifted[0]!.end).toBe(9);
  });

  it('slices mentions per chunk', () => {
    const mentions: MentionEntity[] = [m(5, 8), m(2100, 2103)];
    const a = mentionsForTextSlice(mentions, 0, 2000);
    expect(a).toHaveLength(1);
    expect(a[0]!.start).toBe(5);
    const b = mentionsForTextSlice(mentions, 2000, 4000);
    expect(b).toHaveLength(1);
    expect(b[0]!.start).toBe(100);
    expect(b[0]!.end).toBe(103);
  });
});

describe('hard format helpers', () => {
  it('echoHardFormatPrefixSatisfied treats CRLF template like LF plain', () => {
    expect(
      echoHardFormatPrefixSatisfied('Name:\nAge:\nhi', 'Name:\r\nAge:\r\n'),
    ).toBe(true);
  });

  it('stripLeadingDuplicateHardFormatTemplate removes one doubled prefix', () => {
    const T = 'Name:\nAge:\n';
    expect(stripLeadingDuplicateHardFormatTemplate(`${T}${T}tail`, T)).toBe(
      `${T}tail`,
    );
  });

  it('stripLeadingDuplicateHardFormatTemplate returns null when not doubled', () => {
    expect(
      stripLeadingDuplicateHardFormatTemplate('Name:\nAge:\nx', 'Name:\nAge:\n'),
    ).toBe(null);
  });
});
