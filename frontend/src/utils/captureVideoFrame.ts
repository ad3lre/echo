/** Client-side video probe: dimensions + still frame near `seekSec` (default 1s). */

export type VideoDimensions = {
  width: number;
  height: number;
  aspectRatio: string;
};

export type VideoProbeResult = VideoDimensions & {
  frameUrl: string;
};

/** Only `blob:` URLs from createObjectURL are assigned to <video src>. */
function blobUrlForVideoElement(url: string): string {
  const trimmed = url.trim();
  if (!trimmed.startsWith('blob:')) {
    throw new Error('Video probe requires a blob: URL');
  }
  return trimmed;
}

function loadVideoMetadata(source: Blob): Promise<{
  video: HTMLVideoElement;
  width: number;
  height: number;
  blobUrl: string;
}> {
  const blobUrl = blobUrlForVideoElement(URL.createObjectURL(source));
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onErr);
    };
    const onMeta = () => {
      cleanup();
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (width > 0 && height > 0) resolve({ video, width, height, blobUrl });
      else {
        URL.revokeObjectURL(blobUrl);
        disposeVideoElement(video);
        reject(new Error('Video has no dimensions'));
      }
    };
    const onErr = () => {
      cleanup();
      URL.revokeObjectURL(blobUrl);
      disposeVideoElement(video);
      reject(new Error('Video metadata load failed'));
    };
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('error', onErr);
    video.src = blobUrl;
  });
}

function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onErr);
      resolve();
    };
    const onErr = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onErr);
      reject(new Error('Video seek failed'));
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onErr);
    const target = Math.min(
      Math.max(0, timeSec),
      Number.isFinite(video.duration)
        ? Math.max(0, video.duration - 0.05)
        : timeSec,
    );
    video.currentTime = target;
  });
}

function disposeVideoElement(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute('src');
  video.load();
}

function frameFromVideo(video: HTMLVideoElement): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  const blob = canvas.toDataURL('image/jpeg', 0.82);
  return blob.startsWith('data:') ? blob : null;
}

/** Fast metadata-only probe — sets aspect ratio before a frame decode finishes. */
export async function probeVideoDimensionsOnly(
  source: Blob,
): Promise<VideoDimensions | null> {
  let video: HTMLVideoElement | null = null;
  let blobUrl: string | null = null;
  try {
    const loaded = await loadVideoMetadata(source);
    video = loaded.video;
    blobUrl = loaded.blobUrl;
    const { width, height } = loaded;
    return {
      width,
      height,
      aspectRatio: `${width} / ${height}`,
    };
  } catch {
    return null;
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    if (video) disposeVideoElement(video);
  }
}

/** Returns a data URL frame and locked aspect ratio, or null when probing fails. */
export async function probeVideoBlobUrl(
  source: Blob,
  seekSec = 0.5,
): Promise<VideoProbeResult | null> {
  let video: HTMLVideoElement | null = null;
  let blobUrl: string | null = null;
  try {
    const loaded = await loadVideoMetadata(source);
    video = loaded.video;
    blobUrl = loaded.blobUrl;
    const { width, height } = loaded;
    const aspectRatio = `${width} / ${height}`;
    try {
      await seekVideo(video, seekSec);
    } catch {
      video.currentTime = 0;
      await seekVideo(video, 0).catch(() => undefined);
    }
    const frameUrl = frameFromVideo(video);
    if (!frameUrl) return null;
    return {
      width,
      height,
      aspectRatio,
      frameUrl,
    };
  } catch {
    return null;
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    if (video) disposeVideoElement(video);
  }
}
