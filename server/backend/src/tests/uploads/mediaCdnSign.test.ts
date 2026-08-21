import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MEDIA_CDN_SIGN_BATCH_MAX,
  type MediaCdnSignItem,
} from '../../services/uploads/mediaCdnSign';

describe('mediaCdnSign', () => {
  it('exports a batch cap aligned with retention touch', () => {
    assert.equal(MEDIA_CDN_SIGN_BATCH_MAX, 20);
  });

  it('accepts sign item shape', () => {
    const item: MediaCdnSignItem = {
      storageKey: 'echo/channels/c1/u1/a.png',
      scope: 'object',
    };
    assert.equal(item.storageKey, 'echo/channels/c1/u1/a.png');
  });
});
