import { expect, test } from 'bun:test';
import {
  buildFfmpegArgs,
  ffInputSafetyArgs,
  RENDITION_LADDER,
} from '../../hls/processor';

test('ffInputSafetyArgs restricts protocols and demuxers', () => {
  const args = ffInputSafetyArgs();
  expect(args[args.indexOf('-protocol_whitelist') + 1]).toBe('file');
  const fmts = args[args.indexOf('-format_whitelist') + 1]!.split(',');
  expect(fmts).toContain('mp4');
  expect(fmts).not.toContain('hls');
  expect(fmts).not.toContain('concat');
});

test('buildFfmpegArgs places whitelists before -i', () => {
  const args = buildFfmpegArgs({
    inPath: '/tmp/source',
    renditions: [RENDITION_LADDER[0]!],
    hasAudio: false,
    rotation: 0,
  });
  const i = args.indexOf('-i');
  expect(i).toBeGreaterThan(0);
  expect(args.indexOf('-protocol_whitelist')).toBeGreaterThan(-1);
  expect(args.indexOf('-protocol_whitelist')).toBeLessThan(i);
  expect(args.indexOf('-format_whitelist')).toBeLessThan(i);
});
