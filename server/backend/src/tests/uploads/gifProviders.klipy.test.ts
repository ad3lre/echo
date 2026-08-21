import assert from 'node:assert/strict';
import { klipyGifToGiphyProxyShape } from '../../services/search/gifProviders';

const sample = {
  id: 123,
  title: 'Test GIF',
  file: {
    hd: {
      gif: { url: 'https://static.klipy.com/hd.gif' },
      webp: { url: 'https://static.klipy.com/hd.webp' },
      jpg: { url: 'https://static.klipy.com/hd.jpg' },
      mp4: { url: 'https://static.klipy.com/hd.mp4' },
    },
    sm: {
      gif: { url: 'https://static.klipy.com/sm.gif' },
      jpg: { url: 'https://static.klipy.com/sm.jpg' },
      mp4: { url: 'https://static.klipy.com/sm.mp4' },
    },
    xs: {
      gif: { url: 'https://static.klipy.com/xs.gif' },
      jpg: { url: 'https://static.klipy.com/xs.jpg' },
    },
  },
};

const mapped = klipyGifToGiphyProxyShape(sample);
assert.equal(mapped.id, '123');
assert.equal(mapped.title, 'Test GIF');
assert.equal(mapped.images.original?.url, 'https://static.klipy.com/hd.gif');
assert.equal(mapped.images.downsized?.webp, undefined);
assert.equal(
  mapped.images.fixed_height_small_still?.url,
  'https://static.klipy.com/xs.jpg',
);
assert.equal(mapped.images.preview?.mp4, 'https://static.klipy.com/sm.mp4');

console.log('gifProviders.klipy.test: ok');
