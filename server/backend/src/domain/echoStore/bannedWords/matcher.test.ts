import assert from 'node:assert/strict';
import type { EchoBannedWordsConfig } from '../../../../../../contracts/types/bannedWords';
import { matchBannedWords } from './matcher';

const config = {
  serverId: 'test',
  presetLevel: 'low',
  categories: {},
  customWords: ['bad'],
} as EchoBannedWordsConfig;

assert.equal(matchBannedWords('badminton bad', config).length, 1);
assert.equal(matchBannedWords('badminton badger', config).length, 0);
assert.equal(matchBannedWords('bad.', config).length, 1);
assert.equal(matchBannedWords('ébadé', config).length, 0);
console.log('banned word matcher regressions: ok');
