/**
 * Golden HLS packaging test: runs the real ffmpeg arg builder + validator end-to-end and
 * asserts the output is a *playable* ABR pack, not just "some files exist". Guards the bugs
 * that shallow validation missed:
 *   - segments written to the wrong directory (every playlist reference must resolve on disk)
 *   - a non-adaptive ladder (the rungs must have clearly separated bitrates)
 *   - oversized/unaligned segments (TARGETDURATION must be ~SEGMENT_SECONDS)
 *   - missing EXT-X-ENDLIST / EXT-X-INDEPENDENT-SEGMENTS
 *
 * Skips cleanly when ffmpeg/ffprobe are unavailable (e.g. CI without media tooling).
 *
 * Run: node --import tsx server/media/src/tests/hls/echoVideoHls.golden.test.ts
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  RENDITION_LADDER,
  SEGMENT_SECONDS,
  buildFfmpegArgs,
  parseHlsMediaUris,
  parseHlsVariantPlaylistUris,
  validateHlsOutput,
} from '../../hls/processor';

const execFileAsync = promisify(execFile);
const ffmpeg = process.env.FFMPEG_PATH?.trim() || 'ffmpeg';

async function hasFfmpeg(): Promise<boolean> {
  try {
    await execFileAsync(ffmpeg, ['-version'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

async function variantStats(
  outDir: string,
  variantPlaylist: string,
): Promise<{
  bitrateBps: number;
  targetDuration: number;
  independentSegments: boolean;
}> {
  const text = await readFile(path.join(outDir, variantPlaylist), 'utf8');
  const { initUris, segments } = parseHlsMediaUris(text);
  let bytes = 0;
  for (const name of [...initUris, ...segments]) {
    bytes += (await stat(path.join(outDir, name))).size;
  }
  let durationSec = 0;
  for (const m of text.matchAll(/#EXTINF:([\d.]+)/g)) {
    durationSec += Number(m[1]);
  }
  const targetDuration = Number(
    text.match(/#EXT-X-TARGETDURATION:(\d+)/)?.[1] ?? '0',
  );
  assert.ok(
    durationSec > 0,
    `variant ${variantPlaylist} has no EXTINF duration`,
  );
  return {
    bitrateBps: (bytes * 8) / durationSec,
    targetDuration,
    independentSegments: text.includes('#EXT-X-INDEPENDENT-SEGMENTS'),
  };
}

async function main(): Promise<void> {
  if (!(await hasFfmpeg())) {
    console.log(
      'echoVideoHls.golden.test.ts: SKIP (ffmpeg/ffprobe not available)',
    );
    return;
  }

  const root = await mkdtemp(path.join(os.tmpdir(), 'echo-hls-golden-'));
  try {
    const inPath = path.join(root, 'input.mp4');
    const outDir = path.join(root, 'out');
    await mkdir(outDir, { recursive: true });

    // 12s 720p clip with audio → exercises a real two-rung ladder.
    await execFileAsync(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=1280x720:rate=30:duration=12',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=12',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        inPath,
      ],
      { timeout: 120_000, maxBuffer: 32 * 1024 * 1024 },
    );

    const renditions = [RENDITION_LADDER[0]!, RENDITION_LADDER[1]!]; // 360p, 720p
    const args = buildFfmpegArgs({
      inPath,
      renditions,
      hasAudio: true,
      rotation: 0,
    });
    await execFileAsync(ffmpeg, args, {
      cwd: outDir,
      timeout: 180_000,
      maxBuffer: 32 * 1024 * 1024,
    });

    // (1) Strict validation: every referenced init/segment file resolves on disk.
    await validateHlsOutput(outDir);

    const masterText = await readFile(path.join(outDir, 'master.m3u8'), 'utf8');
    const masterHasIndependent = masterText.includes(
      '#EXT-X-INDEPENDENT-SEGMENTS',
    );
    const variants = parseHlsVariantPlaylistUris(masterText);
    assert.equal(variants.length, 2, 'expected two variant playlists');

    // (2) Per-variant: IDR-aligned segments (TARGETDURATION ~ SEGMENT_SECONDS) and a
    //     truthful EXT-X-INDEPENDENT-SEGMENTS declaration (master or media playlist).
    const v360 = await variantStats(outDir, variants[0]!);
    const v720 = await variantStats(outDir, variants[1]!);
    for (const [name, v] of [
      [variants[0]!, v360],
      [variants[1]!, v720],
    ] as const) {
      assert.ok(
        v.targetDuration >= 1 && v.targetDuration <= SEGMENT_SECONDS + 1,
        `variant ${name} TARGETDURATION ${v.targetDuration}s should be ~${SEGMENT_SECONDS}s`,
      );
      assert.ok(
        v.independentSegments || masterHasIndependent,
        `variant ${name} should be covered by #EXT-X-INDEPENDENT-SEGMENTS`,
      );
    }

    // (3) Real ABR separation. 360p is maxrate-capped at 856k, so it must sit well
    //     under 720p; the pre-fix non-indexed args encoded 360p at ~2.4 Mbps.
    assert.ok(
      v360.bitrateBps < 1_800_000,
      `360p bitrate ${Math.round(v360.bitrateBps)} bps should be < 1.8 Mbps (non-adaptive ladder regression)`,
    );
    assert.ok(
      v720.bitrateBps > v360.bitrateBps,
      `720p bitrate ${Math.round(v720.bitrateBps)} should exceed 360p ${Math.round(v360.bitrateBps)}`,
    );

    // (4) Negative control: the strict validator must reject a pack with a missing
    //     segment (the exact failure the old "has a .m4s-ish file" check let through).
    const firstSeg = parseHlsMediaUris(
      await readFile(path.join(outDir, variants[0]!), 'utf8'),
    ).segments[0];
    assert.ok(firstSeg, 'variant should reference at least one segment');
    await unlink(path.join(outDir, firstSeg!));
    await assert.rejects(
      () => validateHlsOutput(outDir),
      /missing file/i,
      'validateHlsOutput must reject a pack with a referenced-but-absent segment',
    );

    console.log(
      `echoVideoHls.golden.test.ts: ok (360p≈${Math.round(v360.bitrateBps / 1000)}kbps, 720p≈${Math.round(v720.bitrateBps / 1000)}kbps, target=${v360.targetDuration}s)`,
    );
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
