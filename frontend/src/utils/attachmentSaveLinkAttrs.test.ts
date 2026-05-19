import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachmentSaveLinkAttrs } from './attachmentSaveLinkAttrs';

describe('attachmentSaveLinkAttrs', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      location: {
        href: 'https://chat-echo.com/channels/srv/ch',
        origin: 'https://chat-echo.com',
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses download in-tab for same-origin static paths', () => {
    expect(
      attachmentSaveLinkAttrs('/assets/doc-abc.pdf', 'Paper.pdf'),
    ).toEqual({
      download: 'Paper.pdf',
      target: undefined,
      rel: undefined,
    });
  });

  it('opens same-origin /api URLs in a new tab without download', () => {
    expect(
      attachmentSaveLinkAttrs(
        '/api/v1/echo/uploads/signed?x=1',
        'Paper.pdf',
      ),
    ).toEqual({
      download: undefined,
      target: '_blank',
      rel: 'noopener noreferrer',
    });
  });

  it('opens same-origin /socket.io in a new tab without download', () => {
    expect(
      attachmentSaveLinkAttrs('/socket.io/?EIO=4', 'ignored.bin'),
    ).toEqual({
      download: undefined,
      target: '_blank',
      rel: 'noopener noreferrer',
    });
  });

  it('opens cross-origin URLs in a new tab without download', () => {
    expect(
      attachmentSaveLinkAttrs(
        'https://cdn.discordapp.com/attachments/1/2/file.png',
        'file.png',
      ),
    ).toEqual({
      download: undefined,
      target: '_blank',
      rel: 'noopener noreferrer',
    });
  });
});
