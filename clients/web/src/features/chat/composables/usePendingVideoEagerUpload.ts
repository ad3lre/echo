import { watch, type Ref } from 'vue';
import { uploadChatAttachmentFile } from '@/api/echoClient';
import { useAuthSessionStore } from '@/features/auth/authSession';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { sha256HexOfBlob } from '@/features/chat/uploadFingerprint';
import type { PendingVideo } from './usePendingMedia';

type InFlightJob = {
  promise: Promise<void>;
  attachChannelId: string;
};

const inFlight = new WeakMap<File, InFlightJob>();

function isVideoStillAttached(
  pendingVideos: readonly PendingVideo[],
  video: PendingVideo,
  attachChannelId: string,
): boolean {
  return pendingVideos.some(
    (v) =>
      v.file === video.file &&
      v.attachChannelId?.trim() === attachChannelId.trim(),
  );
}

async function uploadPendingVideo(
  attachChannelId: string,
  video: PendingVideo,
  pendingVideos: Ref<PendingVideo[]>,
): Promise<void> {
  const channel = attachChannelId.trim();
  if (!channel) return;

  if (video.uploadStatus === 'done' || video.uploadStatus === 'uploading') {
    return;
  }
  if (echoSyncCapabilities.isMockDataMode) {
    if (!isVideoStillAttached(pendingVideos.value, video, channel)) return;
    video.uploadStatus = 'done';
    video.uploadPercent = null;
    return;
  }

  const auth = useAuthSessionStore();
  const token = auth.accessToken?.trim() ?? '';
  if (!auth.isAuthenticated || !token) return;

  if (!isVideoStillAttached(pendingVideos.value, video, channel)) return;

  video.uploadStatus = 'uploading';
  video.uploadPercent = null;

  try {
    const cachedSha256Hex =
      video.sha256Hex?.trim() || (await sha256HexOfBlob(video.file));
    if (!isVideoStillAttached(pendingVideos.value, video, channel)) return;
    video.sha256Hex = cachedSha256Hex;

    const uploaded = await uploadChatAttachmentFile(
      token,
      channel,
      video.file,
      {
        fileIndex: 0,
        fileTotal: 1,
        cachedSha256Hex,
        onProgress: (e) => {
          if (e.kind !== 'video') return;
          if (!isVideoStillAttached(pendingVideos.value, video, channel))
            return;
          if (e.phase === 'uploading' && e.uploadPercent != null) {
            video.uploadPercent = e.uploadPercent;
          } else if (
            e.phase === 'checking' ||
            e.phase === 'finishing' ||
            e.phase === 'preparing'
          ) {
            video.uploadPercent = null;
          }
        },
      },
    );
    if (!isVideoStillAttached(pendingVideos.value, video, channel)) return;
    video.uploadUrl = uploaded.url;
    video.uploadStorageKey = uploaded.storageKey;
    video.uploadStatus = 'done';
    video.uploadPercent = null;
  } catch {
    if (!isVideoStillAttached(pendingVideos.value, video, channel)) return;
    video.uploadStatus = 'error';
    video.uploadPercent = null;
  }
}

/**
 * Starts chat video uploads as soon as files land in the composer (before send).
 * Uploads are scoped to {@link PendingVideo.attachChannelId} so channel switches
 * cannot retarget in-flight work to the wrong channel.
 */
export function usePendingVideoEagerUpload(
  channelId: Ref<string | undefined>,
  pendingVideos: Ref<PendingVideo[]>,
): void {
  watch(
    [channelId, pendingVideos],
    ([cid, videos]) => {
      const activeChannel = cid?.trim();
      if (!activeChannel) return;
      for (const video of videos) {
        const attachChannel = video.attachChannelId?.trim();
        if (!attachChannel || attachChannel !== activeChannel) {
          continue;
        }
        if (
          video.uploadStatus === 'done' ||
          video.uploadStatus === 'uploading'
        ) {
          continue;
        }
        const existing = inFlight.get(video.file);
        if (existing?.attachChannelId === attachChannel) {
          continue;
        }
        const job: InFlightJob = {
          attachChannelId: attachChannel,
          promise: uploadPendingVideo(
            attachChannel,
            video,
            pendingVideos,
          ).finally(() => {
            const current = inFlight.get(video.file);
            if (current?.promise === job.promise) {
              inFlight.delete(video.file);
            }
          }),
        };
        inFlight.set(video.file, job);
      }
    },
    { deep: true, immediate: true },
  );
}
