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

type RenditionSpec = {
  height: number;
  videoBitrate: string;
  maxrate: string;
  bufsize: string;
};

const RENDITION_LADDER: RenditionSpec[] = [
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

function buildFfmpegArgs(opts: {
  inPath: string;
  outDir: string;
  renditions: RenditionSpec[];
  hasAudio: boolean;
  rotation: number;
}): string[] {
  const { inPath, outDir, renditions, hasAudio, rotation } = opts;
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
  renditions.forEach((_r, i) => {
    args.push('-map', `[v${i}out]`);
    if (hasAudio) {
      args.push('-map', '0:a:0?');
    }
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'faster',
      '-pix_fmt',
      'yuv420p',
      '-b:v',
      renditions[i]!.videoBitrate,
      '-maxrate',
      renditions[i]!.maxrate,
      '-bufsize',
      renditions[i]!.bufsize,
    );
    if (hasAudio) {
      args.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2');
      streamMaps.push(`v:${i},a:${i}`);
    } else {
      args.push('-an');
      streamMaps.push(`v:${i}`);
    }
  });

  args.push(
    '-f',
    'hls',
    '-hls_time',
    '4',
    '-hls_playlist_type',
    'vod',
    '-hls_segment_type',
    'fmp4',
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
    path.join(outDir, 'stream_%v.m3u8'),
  );
  return args;
}

async function validateHlsOutput(outDir: string): Promise<void> {
  const files = await statLocalDirectoryFiles(outDir);
  const master = files.find((f) => f.name === 'master.m3u8');
  if (!master || master.size < 1) throw new Error('Missing master.m3u8');
  const hasSegment = files.some(
    (f) => f.name.endsWith('.m4s') || f.name.endsWith('_init.mp4'),
  );
  if (!hasSegment) throw new Error('Missing HLS segments');
  const masterText = await readFile(path.join(outDir, 'master.m3u8'), 'utf8');
  if (masterText.includes('http://') || masterText.includes('https://')) {
    throw new Error('HLS master must use relative URIs');
  }
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
      outDir,
      renditions,
      hasAudio: probe.hasAudio,
      rotation: probe.rotation,
    });

    await execFileAsync(ffmpegBin(), ffmpegArgs, {
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

/** @deprecated */
export const processEchoVideoOptimizeJob = processEchoVideoHlsJob;
