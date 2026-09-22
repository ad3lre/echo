import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeEchoMessageSearchFlags } from '../../echoMessageSearchFlags';

describe('computeEchoMessageSearchFlags', () => {
  it('counts image attachments as hasImage (not only hasAttachment)', () => {
    const flags = computeEchoMessageSearchFlags({
      attachments: [
        {
          url: 'https://cdn.example/p.jpg',
          kind: 'image',
          mimeType: 'image/jpeg',
          filename: 'p.jpg',
        },
      ],
    });
    assert.equal(flags.hasImage, true);
    assert.equal(flags.hasGif, false);
    assert.equal(flags.hasAttachment, true);
    assert.equal(flags.hasDocs, false);
  });

  it('counts gif attachments as hasGif', () => {
    const flags = computeEchoMessageSearchFlags({
      attachments: [
        {
          url: 'https://cdn.example/g.gif',
          kind: 'gif',
          mimeType: 'image/gif',
        },
      ],
    });
    assert.equal(flags.hasGif, true);
    assert.equal(flags.hasImage, false);
    assert.equal(flags.hasAttachment, true);
  });

  it('infers image from mime when kind is missing/wrong', () => {
    const flags = computeEchoMessageSearchFlags({
      attachments: [
        {
          url: 'https://cdn.example/shot.png',
          kind: 'document',
          mimeType: 'image/png',
          filename: 'shot.png',
        },
      ],
    });
    assert.equal(flags.hasImage, true);
    assert.equal(flags.hasDocs, false);
  });

  it('keeps pdf documents as hasDocs only', () => {
    const flags = computeEchoMessageSearchFlags({
      attachments: [
        {
          url: 'https://cdn.example/a.pdf',
          kind: 'document',
          mimeType: 'application/pdf',
          filename: 'a.pdf',
        },
      ],
    });
    assert.equal(flags.hasDocs, true);
    assert.equal(flags.hasImage, false);
    assert.equal(flags.hasAttachment, true);
  });

  it('does not treat kind:image + document mime as hasImage', () => {
    const flags = computeEchoMessageSearchFlags({
      attachments: [
        {
          url: 'https://cdn.example/d.pdf',
          kind: 'image',
          mimeType: 'application/pdf',
        },
      ],
    });
    assert.equal(flags.hasImage, false);
    assert.equal(flags.hasDocs, true);
  });

  it('counts bare kind:image with empty mime as hasImage (native photo uploads)', () => {
    const flags = computeEchoMessageSearchFlags({
      attachments: [
        {
          url: 'https://cdn.example/media/abc123',
          kind: 'image',
        },
      ],
    });
    assert.equal(flags.hasImage, true);
    assert.equal(flags.hasGif, false);
    assert.equal(flags.hasAttachment, true);
  });
});
