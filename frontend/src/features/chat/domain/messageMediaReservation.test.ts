import { describe, expect, it } from 'vitest';
import {
  CHAT_MEDIA_BOX_ASPECT_CSS,
  CHAT_MEDIA_BOX_HEIGHT_PX,
  chatAttachmentMediaBoxStyle,
  reserveChatAttachmentMediaBoxHeightPx,
} from './messageMediaReservation';

describe('messageMediaReservation', () => {
  it('reserves a fixed 16:9 box height including vertical margin', () => {
    expect(CHAT_MEDIA_BOX_HEIGHT_PX).toBe(360);
    expect(reserveChatAttachmentMediaBoxHeightPx()).toBe(368);
    expect(CHAT_MEDIA_BOX_ASPECT_CSS).toBe('16 / 9');
  });

  it('exposes the same outer style for render as the estimate uses for height', () => {
    const style = chatAttachmentMediaBoxStyle({
      columns: '1fr 1fr',
      rows: '1fr',
    });
    expect(style.aspectRatio).toBe(CHAT_MEDIA_BOX_ASPECT_CSS);
    expect(style.gridTemplateColumns).toBe('1fr 1fr');
  });
});
