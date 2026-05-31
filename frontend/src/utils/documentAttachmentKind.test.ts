import { describe, expect, it } from 'vitest';
import type { MessageAttachmentPayload } from '@shared/types';
import {
  isDocxAttachment,
  isLegacyDocAttachment,
  isPdfAttachment,
} from '@/utils/documentAttachmentKind';

function att(
  partial: Partial<MessageAttachmentPayload>,
): MessageAttachmentPayload {
  return {
    url: 'https://example.com/file',
    filename: 'file.bin',
    ...partial,
  } as MessageAttachmentPayload;
}

describe('documentAttachmentKind', () => {
  it('detects PDF by mime and extension', () => {
    expect(isPdfAttachment(att({ mimeType: 'application/pdf' }))).toBe(true);
    expect(isPdfAttachment(att({ filename: 'report.pdf' }))).toBe(true);
    expect(isPdfAttachment(att({ filename: 'notes.docx' }))).toBe(false);
  });

  it('detects DOCX by mime and extension', () => {
    expect(
      isDocxAttachment(
        att({
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      ),
    ).toBe(true);
    expect(isDocxAttachment(att({ filename: 'draft.docx' }))).toBe(true);
    expect(isDocxAttachment(att({ filename: 'legacy.doc' }))).toBe(false);
  });

  it('detects legacy DOC without matching DOCX', () => {
    expect(isLegacyDocAttachment(att({ filename: 'legacy.doc' }))).toBe(true);
    expect(isLegacyDocAttachment(att({ filename: 'modern.docx' }))).toBe(false);
  });
});
