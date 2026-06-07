import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type pg from 'pg';
import {
  hlsManifestStorageKeyForSourceKey,
  hlsPackPrefixForSourceKey,
  hlsStagingPrefixForSourceKey,
} from '../../../shared/echoUploadStorageKey';
import { config } from '../config';
import {
  deleteEchoUploadPrefix,
  downloadEchoUploadObjectToFile,
  publishEchoHlsStagingToPackPrefix,
  statLocalDirectoryFiles,
  uploadLocalDirectoryToEchoUploadPrefix,
} from './echoUploadHlsObjectStore';
import { readEchoUploadSourceMetadata } from './echoUploadSourceMetadata';
import {
  getEchoVideoPlaybackBySourceKey,
  type EchoVideoPlaybackRendition,
} from './echoVideoPlayback';
import {
  markEchoVideoHlsJobDone,
  markEchoVideoHlsJobFailed,
  type VideoHlsJobRow,
} from './echoVideoOptimizeQueue';

const execFileAsync = promisify(execFile);

const SINGLE_RENDITION_MAX_BYTES = 5 * 1024 * 1024;
const SINGLE_RENDITION_MAX_DURATION_S = 10;

/** Target HLS segment length (seconds). Drives `-hls_time` and the forced-keyframe cadence. */
export const SEGMENT_SECONDS = 4;

export type RenditionSpec = {
  height: number;
  videoBitrate: string;
  maxrate: string;
  bufsize: string;
};

export const RENDITION_LADDER: RenditionSpec[] = [
  { height: 360, videoBitrate: '800k', maxrate: '856k', bufsize: '1200k' },
  { height: 720, videoBitrate: '2500k', maxrate: '2675k', bufsize: '3750k' },
  { height: 1080, videoBitrate: '5000k', maxrate: '5350k', bufsize: '7500k' },
];

function ffmpegBin(): string {
  return process.env.FFMPEG_PATH?.trim() || 'ffmpeg';
}

function ffprobeBin(): string {
  return process.env.FFPROBE_PATH?.trim() || 'ffprobe';
}

type ProbeResult = {
  width: number;
  height: number;
  durationSec: number;
  hasAudio: boolean;
  rotation: number;
};

function parseRotation(stream: Record<string, unknown>): number {
  const tags = stream.tags as Record<string, string> | undefined;
  const rotateTag = tags?.rotate ?? tags?.ROTATE;
  if (rotateTag) {
    const n = parseInt(String(rotateTag), 10);
    if (Number.isFinite(n)) return n;
  }
  const sideData = stream.side_data_list as { rotation?: number }[] | undefined;
  if (Array.isArray(sideData)) {
    for (const sd of sideData) {
      if (typeof sd.rotation === 'number' && Number.isFinite(sd.rotation)) {
        return sd.rotation;
      }
    }
  }
  return 0;
}

async function probeInput(inPath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync(
    ffprobeBin(),
    [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_streams',
      '-show_format',
      inPath,
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout) as {
    streams?: Record<string, unknown>[];
    format?: { duration?: string };
  };
  const streams = parsed.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  if (!video) throw new Error('No video stream found');
  const hasAudio = streams.some((s) => s.codec_type === 'audio');
  const width = Number(video.width ?? 0);
  const height = Number(video.height ?? 0);
  if (width < 1 || height < 1) throw new Error('Invalid video dimensions');
  const durationSec = parseFloat(parsed.format?.duration ?? '0');
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error('Invalid video duration');
  }
  return {
    width,
    height,
    durationSec,
    hasAudio,
    rotation: parseRotation(video),
  };
}

function rotationFilter(rotation: number): string | null {
  const r = ((rotation % 360) + 360) % 360;
  if (r === 90) return 'transpose=1';
  if (r === 180) return 'transpose=1,transpose=1';
  if (r === 270) return 'transpose=2';
  return null;
}

function selectRenditions(
  probe: ProbeResult,
  inputBytes: number,
): RenditionSpec[] {
  const effectiveHeight = probe.height;
  let eligible = RENDITION_LADDER.filter((r) => r.height <= effectiveHeight);
  if (eligible.length === 0) {
    eligible = [RENDITION_LADDER[0]!];
  }
  if (
    probe.durationSec < SINGLE_RENDITION_MAX_DURATION_S ||
    inputBytes < SINGLE_RENDITION_MAX_BYTES
  ) {
    return [eligible[eligible.length - 1]!];
  }
  return eligible;
}

/**
 * Build the ffmpeg args for the ABR HLS pack.
 *
 * Output names are **relative**: the worker runs ffmpeg with `cwd=outDir` (see
 * {@link processEchoVideoHlsJob}) so segments, init files, and the variant + master
 * playlists all land together in `outDir` and reference each other with flat relative
 * URIs. (Passing an absolute `-hls_segment_filename` would write the `.m4s` files to a
 * different directory than the playlists — the published-pack-missing-segments bug.)
 */
export function buildFfmpegArgs(opts: {
  inPath: string;
  renditions: RenditionSpec[];
  hasAudio: boolean;
  rotation: number;
}): string[] {
  const { inPath, renditions, hasAudio, rotation } = opts;
  const n = renditions.length;
  const splitLabels = Array.from({ length: n }, (_, i) => `[v${i}]`).join('');
  const filterParts: string[] = [`[0:v]split=${n}${splitLabels}`];
  const rot = rotationFilter(rotation);
  renditions.forEach((r, i) => {
    const scale = `scale=-2:${r.height}:flags=lanczos,format=yuv420p`;
    const chain = rot
      ? `[v${i}]${rot},${scale}[v${i}out]`
      : `[v${i}]${scale}[v${i}out]`;
    filterParts.push(chain);
  });

  const args: string[] = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-threads',
    String(config.echoFfmpegThreads),
    '-i',
    inPath,
    '-filter_complex',
    filterParts.join(';'),
  ];

  const streamMaps: string[] = [];
  renditions.forEach((r, i) => {
    args.push('-map', `[v${i}out]`);
    if (hasAudio) {
      args.push('-map', '0:a:0?');
    }
    // Every encoder option is scoped to this output stream (`:v:${i}` / `:a:${i}`).
    // Without the stream specifier ffmpeg applies a single value to every video
    // output, collapsing the ladder (e.g. 360p encoding at ~720p's bitrate).
    args.push(
      `-c:v:${i}`,
      'libx264',
      `-preset:v:${i}`,
      'faster',
      `-pix_fmt:v:${i}`,
      'yuv420p',
      `-b:v:${i}`,
      r.videoBitrate,
      `-maxrate:v:${i}`,
      r.maxrate,
      `-bufsize:v:${i}`,
      r.bufsize,
      // Force an IDR at every segment boundary so each segment is independently
      // decodable (predictable, IDR-aligned segments — required for clean ABR and
      // for EXT-X-INDEPENDENT-SEGMENTS to be truthful). sc_threshold=0 stops
      // scene-cut keyframes from creating irregular GOPs.
      `-force_key_frames:v:${i}`,
      `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
      `-sc_threshold:v:${i}`,
      '0',
    );
    if (hasAudio) {
      args.push(`-c:a:${i}`, 'aac', `-b:a:${i}`, '128k', `-ac:a:${i}`, '2');
      streamMaps.push(`v:${i},a:${i}`);
    } else {
      streamMaps.push(`v:${i}`);
    }
  });
  if (!hasAudio) {
    args.push('-an');
  }

  args.push(
    '-f',
    'hls',
    '-hls_time',
    String(SEGMENT_SECONDS),
    '-hls_playlist_type',
    'vod',
    '-hls_segment_type',
    'fmp4',
    // Segments are IDR-aligned (forced keyframes above) so this tag is truthful.
    '-hls_flags',
    'independent_segments',
    '-hls_fmp4_init_filename',
    'v%v_init.mp4',
    '-hls_segment_filename',
    'v%v_seg%03d.m4s',
    '-master_pl_name',
    'master.m3u8',
    '-var_stream_map',
    streamMaps.join(' '),
    '-max_muxing_queue_size',
    '9999',
    'stream_%v.m3u8',
  );
  return args;
}

/** Variant playlist URIs from a master playlist (the line after each EXT-X-STREAM-INF). */
export function parseHlsVariantPlaylistUris(masterText: string): string[] {
  const lines = masterText.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i]!.trim().startsWith('#EXT-X-STREAM-INF')) continue;
    for (let j = i + 1; j < lines.length; j += 1) {
      const uri = lines[j]!.trim();
      if (!uri || uri.startsWith('#')) continue;
      out.push(uri);
      break;
    }
  }
  return out;
}

/** Init (`EXT-X-MAP`) + media segment URIs and whether the playlist is closed (`ENDLIST`). */
export function parseHlsMediaUris(playlistText: string): {
  initUris: string[];
  segments: string[];
  hasEndList: boolean;
} {
  const initUris: string[] = [];
  const segments: string[] = [];
  let hasEndList = false;
  for (const raw of playlistText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXT-X-ENDLIST')) {
      hasEndList = true;
      continue;
    }
    if (line.startsWith('#EXT-X-MAP:')) {
      const m = line.match(/URI="([^"]+)"/);
      if (m?.[1]) initUris.push(m[1]);
      continue;
    }
    if (line.startsWith('#')) continue;
    segments.push(line);
  }
  return { initUris, segments, hasEndList };
}

/**
 * Validate a finished HLS pack on disk **by walking every playlist reference**, not by
 * sampling for "a segment-ish file". Master → each variant playlist → each EXT-X-MAP init
 * and media segment must exist with non-zero size. URIs must be flat + relative, and each
 * variant must be a closed VOD playlist (EXT-X-ENDLIST). This is what catches a pack whose
 * `.m4s` files were written to the wrong directory.
 */
export async function validateHlsOutput(outDir: string): Promise<void> {
  const files = await statLocalDirectoryFiles(outDir);
  const sizeByName = new Map(files.map((f) => [f.name, f.size]));
  const masterSize = sizeByName.get('master.m3u8');
  if (!masterSize || masterSize < 1) throw new Error('Missing master.m3u8');

  const masterText = await readFile(path.join(outDir, 'master.m3u8'), 'utf8');
  if (/https?:\/\//i.test(masterText)) {
    throw new Error('HLS master must use relative URIs');
  }
  const variants = parseHlsVariantPlaylistUris(masterText);
  if (variants.length === 0) {
    throw new Error('master.m3u8 references no variant playlists');
  }

  let totalSegments = 0;
  for (const variant of variants) {
    if (variant.includes('/') || /https?:\/\//i.test(variant)) {
      throw new Error(`Variant URI must be a flat relative name: ${variant}`);
    }
    const variantSize = sizeByName.get(variant);
    if (variantSize == null || variantSize < 1) {
      throw new Error(`Missing variant playlist: ${variant}`);
    }
    const variantText = await readFile(path.join(outDir, variant), 'utf8');
    if (/https?:\/\//i.test(variantText)) {
      throw new Error(`Variant ${variant} must use relative URIs`);
    }
    const { initUris, segments, hasEndList } = parseHlsMediaUris(variantText);
    if (!hasEndList) {
      throw new Error(`Variant ${variant} is missing #EXT-X-ENDLIST`);
    }
    for (const uri of [...initUris, ...segments]) {
      if (uri.includes('/') || /https?:\/\//i.test(uri)) {
        throw new Error(`Media URI must be a flat relative name: ${uri}`);
      }
      const size = sizeByName.get(uri);
      if (size == null || size < 1) {
        throw new Error(`Playlist references missing file: ${uri}`);
      }
    }
    if (segments.length === 0) {
      throw new Error(`Variant ${variant} references no media segments`);
    }
    totalSegments += segments.length;
  }
  if (totalSegments === 0) throw new Error('Missing HLS segments');
}

function parseVideoBitrate(bps: string): number {
  const t = bps.trim().toLowerCase();
  if (t.endsWith('k')) {
    const n = parseInt(t.slice(0, -1), 10);
    return Number.isFinite(n) ? n * 1000 : 800_000;
  }
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : 800_000;
}

function renditionsMetadata(
  specs: RenditionSpec[],
  hasAudio: boolean,
): EchoVideoPlaybackRendition[] {
  return specs.map((s) => ({
    height: s.height,
    bandwidth: parseVideoBitrate(s.videoBitrate),
    hasAudio,
  }));
}

export async function processEchoVideoHlsJob(
  pool: pg.Pool,
  job: VideoHlsJobRow,
  log: {
    info: (o: unknown, m?: string) => void;
    warn: (o: unknown, m?: string) => void;
  },
): Promise<void> {
  const storageKey = job.storage_key;
  const tmpRoot = path.join(os.tmpdir(), `echo-hls-${randomUUID()}`);
  const inPath = path.join(tmpRoot, 'source');
  const outDir = path.join(tmpRoot, 'out');
  const stagingPrefix = hlsStagingPrefixForSourceKey(storageKey, job.id);
  const packPrefix = hlsPackPrefixForSourceKey(storageKey);
  const manifestKey = hlsManifestStorageKeyForSourceKey(storageKey);

  try {
    const playbackRow = await getEchoVideoPlaybackBySourceKey(pool, storageKey);
    const liveMeta = await readEchoUploadSourceMetadata(storageKey);
    if (!liveMeta) throw new Error('Source object not found');

    if (
      playbackRow?.source_etag &&
      playbackRow.source_size &&
      (playbackRow.source_etag !== liveMeta.etag ||
        Number(playbackRow.source_size) !== liveMeta.size)
    ) {
      log.info({ storageKey }, 'echo.video_hls.source_changed');
      await deleteEchoUploadPrefix(packPrefix);
    }

    await mkdir(tmpRoot, { recursive: true });
    await mkdir(outDir, { recursive: true });

    await downloadEchoUploadObjectToFile(storageKey, inPath);
    const inStat = await stat(inPath);
    if (inStat.size < 1) throw new Error('Empty source file');
    if (inStat.size > config.echoVideoHlsMaxInputBytes) {
      throw new Error('Source exceeds max input bytes');
    }

    const probe = await probeInput(inPath);
    if (probe.durationSec > config.echoVideoHlsMaxDurationS) {
      throw new Error('Video exceeds max duration');
    }

    const renditions = selectRenditions(probe, inStat.size);
    const ffmpegArgs = buildFfmpegArgs({
      inPath,
      renditions,
      hasAudio: probe.hasAudio,
      rotation: probe.rotation,
    });

    // cwd=outDir: output names are relative, so segments/init/playlists co-locate
    // in outDir with relative URIs (see buildFfmpegArgs).
    await execFileAsync(ffmpegBin(), ffmpegArgs, {
      cwd: outDir,
      timeout: config.echoVideoHlsTimeoutMs,
      maxBuffer: 32 * 1024 * 1024,
    });

    await validateHlsOutput(outDir);

    await deleteEchoUploadPrefix(stagingPrefix);
    await uploadLocalDirectoryToEchoUploadPrefix(outDir, stagingPrefix);
    await publishEchoHlsStagingToPackPrefix({
      stagingPrefix,
      packPrefix,
      localStagingDir: outDir,
    });
    await deleteEchoUploadPrefix(stagingPrefix);

    await markEchoVideoHlsJobDone(pool, job.id, {
      sourceStorageKey: storageKey,
      manifestStorageKey: manifestKey,
      renditions: renditionsMetadata(renditions, probe.hasAudio),
    });

    log.info(
      {
        storageKey,
        renditions: renditions.length,
        hasAudio: probe.hasAudio,
        durationSec: probe.durationSec,
      },
      'echo.video_hls.done',
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn({ storageKey, err: msg }, 'echo.video_hls.failed');
    await deleteEchoUploadPrefix(stagingPrefix).catch(() => {});
    await markEchoVideoHlsJobFailed(pool, job.id, storageKey, msg);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}
