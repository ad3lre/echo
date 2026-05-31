import { API_BASE } from '@/config';
import type { EchoApplicationAttachmentAnswerDto } from './types';
import { echoCsrfHeaders } from '@/utils/echoCsrf';
import {
  chatAudioContentTypeForPresign,
  chatDocumentContentTypeForPresign,
  chatImageContentTypeForPresign,
  chatVideoContentTypeForPresign,
  inferChatPendingMediaKind,
  isChatAudioUpload,
  isChatDocumentUpload,
  isChatVideoUpload,
  resolveChatUploadContentTypeAndKind,
} from '@/utils/chatUploadMediaTypes';
import { compressFileForEchoUpload } from '@/utils/uploadCompression';
import {
  ECHO_PLAN_UPLOAD_CAP_BYTES,
  ECHO_RINGTONE_UPLOAD_MAX_BYTES,
  ECHO_UPLOAD_ABS_MAX_BYTES,
} from '@shared/echoPlanLimits';
import { echoFetch } from './transport';
import { randomUuidV4 } from '@/utils/randomUuid';
import { sha256HexOfBlob } from '@/utils/uploadFingerprint';

function sha256HexToBase64(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return btoa(String.fromCharCode(...bytes));
}

/** Upper bound for a single presigned upload (Echo Black). Server still enforces per-user plan + local disk cap. */
export const ECHO_CLIENT_UPLOAD_MAX_BYTES = ECHO_UPLOAD_ABS_MAX_BYTES;

/**
 * Max picked image size before client-side compression runs. Capped so devtools do not
 * allocate multi-GB buffers; tier above this still works for video/other via server error.
 */
export const ECHO_CLIENT_RAW_IMAGE_MAX_BYTES = Math.min(
  120 * 1024 * 1024,
  ECHO_PLAN_UPLOAD_CAP_BYTES.plus,
);

/** Max picked video size before upload (same guard as raw images; optimize runs on the server). */
export const ECHO_CLIENT_RAW_VIDEO_MAX_BYTES = Math.min(
  120 * 1024 * 1024,
  ECHO_PLAN_UPLOAD_CAP_BYTES.plus,
);

export { isChatVideoUpload };

export type EchoPresignResponse = {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  headers: Record<string, string>;
  publicUrlPrefixes?: string[];
  uploadMode?: 's3' | 'local';
};

function resolveEchoUploadPutUrl(uploadUrl: string): string {
  if (uploadUrl.startsWith('/')) {
    return `${API_BASE.replace(/\/$/, '')}${uploadUrl}`;
  }
  return uploadUrl;
}

/**
 * Desktop / split-host UIs load from `window.location` (e.g. `https://tauri.localhost`) while
 * `API_BASE` points at the Echo host. `echoFetch` always uses `credentials: 'include'` there;
 * upload PUTs to the same Echo origin must match or `requireAuth` on `/uploads/local/put` never
 * sees `echo_sid`. Presigned S3/R2 URLs are a different origin — keep `withCredentials` off.
 */
export function echoUploadPutCredentialPlan(opts: {
  resolvedPutUrl: string;
  windowOrigin: string;
  apiBase: string;
}): { includeCredentials: boolean; includeCsrf: boolean } {
  let putOrigin: string;
  try {
    putOrigin = new URL(opts.resolvedPutUrl).origin;
  } catch {
    return { includeCredentials: false, includeCsrf: false };
  }
  const pageOrigin = opts.windowOrigin;
  const pageCrossOrigin = putOrigin !== pageOrigin;
  let apiOrigin: string;
  try {
    apiOrigin = new URL(`${opts.apiBase.replace(/\/$/, '')}/`).origin;
  } catch {
    return {
      includeCredentials: !pageCrossOrigin,
      includeCsrf: !pageCrossOrigin,
    };
  }
  const putTargetsEchoApi = putOrigin === apiOrigin;
  return {
    includeCredentials: !pageCrossOrigin || putTargetsEchoApi,
    includeCsrf: !pageCrossOrigin,
  };
}

function putEchoUploadBodyWithProgress(
  presign: EchoPresignResponse,
  body: Blob,
  contentType: string,
  onProgress?: (loaded: number, total: number) => void,
  sha256Hex?: string,
): Promise<void> {
  const putUrl = resolveEchoUploadPutUrl(presign.uploadUrl);
  const plan = echoUploadPutCredentialPlan({
    resolvedPutUrl: putUrl,
    windowOrigin: window.location.origin,
    apiBase: API_BASE,
  });
  /** Presigned S3/R2 PUT: auth is in the URL — no cookies. Echo-hosted local PUT matches `echoFetch` credentials when the shell and API origins differ. */
  const headers: Record<string, string> = {
    ...(plan.includeCsrf ? echoCsrfHeaders() : {}),
    ...(presign.headers ?? {}),
  };
  if (!headers['Content-Type']?.trim()) {
    headers['Content-Type'] = contentType;
  }
  if (sha256Hex && presign.headers?.['x-amz-checksum-algorithm'] === 'SHA256') {
    headers['x-amz-checksum-sha256'] = sha256HexToBase64(sha256Hex);
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', putUrl);
    xhr.withCredentials = plan.includeCredentials;
    for (const [k, v] of Object.entries(headers)) {
      try {
        xhr.setRequestHeader(k, v);
      } catch {
        /* browser may reject forbidden header names */
      }
    }
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(ev.loaded, ev.total);
      }
    };
    xhr.onload = () => {
      /** Cross-origin failures / mixed content sometimes surface as status 0. */
      if (xhr.status === 0) {
        reject(
          new Error(
            'Upload blocked or failed before a response (CORS, TLS, or network)',
          ),
        );
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      const t = xhr.responseText?.trim() ?? '';
      reject(new Error(t || "Couldn't upload that file. Try again."));
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "Couldn't reach the server to upload. Check your connection and try again.",
        ),
      );
    xhr.onabort = () => reject(new Error('Upload was cancelled'));
    xhr.send(body);
  });
}

async function putEchoUploadBody(
  presign: EchoPresignResponse,
  body: Blob,
  contentType: string,
  sha256Hex?: string,
): Promise<void> {
  await putEchoUploadBodyWithProgress(
    presign,
    body,
    contentType,
    undefined,
    sha256Hex,
  );
}

function sanitizeUploadKeyFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 200);
  return base || 'file';
}

export async function postEchoUploadPresign(
  token: string | null,
  body: {
    channelId?: string;
    serverId?: string;
    purpose?:
      | 'channel_media'
      | 'legacy_server'
      | 'server_emoji'
      | 'user_avatar'
      | 'user_banner'
      | 'server_icon'
      | 'server_banner'
      | 'server_event_cover'
      | 'server_application_attachment'
      | 'bug_report'
      | 'user_ringtone';
    key: string;
    contentType: string;
    contentLength: number;
  },
): Promise<EchoPresignResponse> {
  return echoFetch<EchoPresignResponse>(token, '/uploads/presign', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

type EchoDedupeDestBody = {
  channelId?: string;
  serverId?: string;
  purpose?:
    | 'channel_media'
    | 'legacy_server'
    | 'server_emoji'
    | 'user_avatar'
    | 'user_banner'
    | 'server_icon'
    | 'server_banner'
    | 'server_event_cover'
    | 'server_application_attachment'
    | 'bug_report'
    | 'user_ringtone';
};

export type EchoDedupeMatchResponse = { reusePublicUrl: string | null };

export async function postEchoUploadDedupeMatch(
  token: string | null,
  body: EchoDedupeDestBody & {
    contentType: string;
    sha256Hex: string;
    phashHex: string;
    kind: 'image' | 'video';
  },
): Promise<EchoDedupeMatchResponse> {
  return echoFetch<EchoDedupeMatchResponse>(token, '/uploads/dedupe/match', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function postEchoUploadDedupeRegister(
  token: string | null,
  body: EchoDedupeDestBody & {
    contentType: string;
    objectKey: string;
    storageKey: string;
    publicUrl: string;
    sha256Hex: string;
    phashHex: string;
    kind: 'image' | 'video';
    byteLength: number;
  },
): Promise<void> {
  await echoFetch<Record<string, never>>(token, '/uploads/dedupe/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Phases surfaced to chat upload UI (compress happens before dedupe path). */
export type ChatMediaUploadPhase =
  | 'preparing'
  | 'checking'
  | 'uploading'
  | 'finishing'
  | 'done';

export type ChatMediaUploadProgressEvent = {
  fileIndex: number;
  fileTotal: number;
  fileName: string;
  kind: 'image' | 'video' | 'audio' | 'document';
  phase: ChatMediaUploadPhase;
  /** 0–100 while uploading when the browser reports byte progress; otherwise null. */
  uploadPercent: number | null;
};

export type ChatMediaUploadFileOptions = {
  fileIndex: number;
  fileTotal: number;
  onProgress?: (e: ChatMediaUploadProgressEvent) => void;
};

async function uploadPreparedFileWithDedupe(
  token: string | null,
  dest: EchoDedupeDestBody,
  prepared: File,
  options?: {
    videoDedupeFastPath?: boolean;
    emit?: (phase: ChatMediaUploadPhase, uploadPercent: number | null) => void;
  },
): Promise<{ url: string; storageKey?: string }> {
  const { contentType, kind } = resolveChatUploadContentTypeAndKind(prepared);

  const emit = options?.emit;
  emit?.('checking', null);

  const {
    fingerprintImageFile,
    fingerprintVideoFile,
    sha256HexOfBlob,
    ECHO_CHAT_VIDEO_DEDUPE_PHASH_FAST,
  } = await import('@/utils/uploadFingerprint');
  const dedupeKind: 'image' | 'video' = kind;
  const { sha256Hex, phashHex } =
    dedupeKind === 'video' && options?.videoDedupeFastPath
      ? {
          sha256Hex: await sha256HexOfBlob(prepared),
          phashHex: ECHO_CHAT_VIDEO_DEDUPE_PHASH_FAST,
        }
      : dedupeKind === 'video'
        ? await fingerprintVideoFile(prepared)
        : await fingerprintImageFile(prepared);

  const match = await postEchoUploadDedupeMatch(token, {
    ...dest,
    contentType,
    sha256Hex,
    phashHex,
    kind: dedupeKind,
  });
  const reuse = match.reusePublicUrl?.trim();
  if (reuse) {
    emit?.('done', null);
    return { url: reuse };
  }

  emit?.('uploading', 0);
  const key = `${randomUuidV4()}-${sanitizeUploadKeyFilename(prepared.name)}`;
  const presign = await postEchoUploadPresign(token, {
    ...dest,
    key,
    contentType,
    contentLength: prepared.size,
  });
  await putEchoUploadBodyWithProgress(
    presign,
    prepared,
    contentType,
    (loaded, total) => {
      const pct =
        total > 0 ? Math.min(100, Math.round((100 * loaded) / total)) : null;
      emit?.('uploading', pct);
    },
    sha256Hex,
  );
  emit?.('finishing', null);
  await postEchoUploadDedupeRegister(token, {
    ...dest,
    contentType,
    objectKey: key,
    storageKey: presign.key,
    publicUrl: presign.publicUrl,
    sha256Hex,
    phashHex,
    kind: dedupeKind,
    byteLength: prepared.size,
  }).catch(() => {});
  emit?.('done', null);
  return { url: presign.publicUrl, storageKey: presign.key };
}

/** Presign + PUT for chat attachments (requires `channelId` and object storage configured on the API). */
export async function uploadChatMediaFile(
  token: string,
  channelId: string,
  file: File,
  fileOptions?: ChatMediaUploadFileOptions,
): Promise<{ url: string; storageKey?: string }> {
  const isVideo = isChatVideoUpload(file);
  const kind: 'image' | 'video' = isVideo ? 'video' : 'image';
  const emitIf = (
    phase: ChatMediaUploadPhase,
    uploadPercent: number | null = null,
  ) => {
    fileOptions?.onProgress?.({
      fileIndex: fileOptions.fileIndex,
      fileTotal: fileOptions.fileTotal,
      fileName: file.name,
      kind,
      phase,
      uploadPercent,
    });
  };

  if (!isVideo && fileOptions?.onProgress) {
    emitIf('preparing', null);
  }

  const prepared = isVideo
    ? file
    : await compressFileForEchoUpload(file, 'chat');
  if (prepared.size > ECHO_CLIENT_UPLOAD_MAX_BYTES) {
    throw new Error(
      `File exceeds ${ECHO_CLIENT_UPLOAD_MAX_BYTES / (1024 * 1024)} MiB limit`,
    );
  }
  return uploadPreparedFileWithDedupe(token, { channelId }, prepared, {
    videoDedupeFastPath: isVideo,
    emit: fileOptions?.onProgress ? emitIf : undefined,
  });
}

/**
 * Presign + PUT for chat attachments (images/videos via dedupe pipeline; audio and documents direct PUT).
 * Returns the public URL plus the attachment kind for `MessageAttachmentPayload`.
 */
export async function uploadChatAttachmentFile(
  token: string,
  channelId: string,
  file: File,
  fileOptions?: ChatMediaUploadFileOptions,
): Promise<{
  url: string;
  storageKey?: string;
  kind: 'image' | 'video' | 'audio' | 'document';
  fileSize?: number;
}> {
  const isVideo = isChatVideoUpload(file);
  const isDocument = isChatDocumentUpload(file);
  const isAudio = isChatAudioUpload(file);
  const kind: 'image' | 'video' | 'audio' | 'document' = isVideo
    ? 'video'
    : isDocument
      ? 'document'
      : isAudio
        ? 'audio'
        : 'image';

  const emitIf = (
    phase: ChatMediaUploadPhase,
    uploadPercent: number | null = null,
  ) => {
    fileOptions?.onProgress?.({
      fileIndex: fileOptions.fileIndex,
      fileTotal: fileOptions.fileTotal,
      fileName: file.name,
      kind,
      phase,
      uploadPercent,
    });
  };

  if (kind === 'image' && !isVideo && fileOptions?.onProgress) {
    emitIf('preparing', null);
  } else if (fileOptions?.onProgress) {
    emitIf('checking', null);
  }

  if (kind !== 'audio' && kind !== 'document') {
    const uploaded = await uploadChatMediaFile(
      token,
      channelId,
      file,
      fileOptions,
    );
    return { url: uploaded.url, kind, storageKey: uploaded.storageKey };
  }

  if (file.size > ECHO_CLIENT_UPLOAD_MAX_BYTES) {
    throw new Error(
      `File exceeds ${ECHO_CLIENT_UPLOAD_MAX_BYTES / (1024 * 1024)} MiB limit`,
    );
  }
  // Always normalize document content-type through the helper so non-standard
  // browser-reported types (e.g. application/x-pdf, application/zip for .docx)
  // are mapped to the canonical MIME the backend allowlist expects.
  const contentType =
    kind === 'document'
      ? chatDocumentContentTypeForPresign(file)
      : file.type?.trim() || chatAudioContentTypeForPresign(file);
  const key = `${randomUuidV4()}-${sanitizeUploadKeyFilename(file.name)}`;
  const [presign, bodySha256Hex] = await Promise.all([
    postEchoUploadPresign(token, {
      channelId,
      purpose: 'channel_media',
      key,
      contentType,
      contentLength: file.size,
    }),
    sha256HexOfBlob(file),
  ]);
  emitIf('uploading', 0);
  await putEchoUploadBodyWithProgress(
    presign,
    file,
    contentType,
    (l, t) => {
      const pct = t > 0 ? Math.min(100, Math.round((100 * l) / t)) : null;
      emitIf('uploading', pct);
    },
    bodySha256Hex,
  );
  emitIf('done', null);
  return {
    url: presign.publicUrl,
    storageKey: presign.key,
    kind,
    ...(kind === 'document' ? { fileSize: file.size } : {}),
  };
}

/** Reset abandonment timers when chat attachments become visible (debounced client-side). */
export type EchoVideoPlaybackResponse = {
  status: 'ready' | 'pending' | 'failed';
  format: 'hls' | 'progressive';
  playbackUrl?: string;
  sourceUrl: string;
  sourceEtag: string | null;
  sourceSize: number;
  renditions?: { height: number; bandwidth: number; hasAudio: boolean }[];
};

export async function fetchEchoVideoPlayback(
  token: string | null,
  sourceUrl: string,
): Promise<EchoVideoPlaybackResponse> {
  const q = new URLSearchParams({ url: sourceUrl.trim() });
  return echoFetch<EchoVideoPlaybackResponse>(
    token,
    `/uploads/video-playback?${q.toString()}`,
    { method: 'GET', cache: 'no-store' },
  );
}

export async function touchChatUploadRetentionKeys(
  token: string | null,
  storageKeys: string[],
): Promise<{ touched: number }> {
  if (storageKeys.length === 0) return { touched: 0 };
  return echoFetch<{ touched: number }>(token, '/uploads/retention/touch', {
    method: 'POST',
    body: JSON.stringify({ storageKeys }),
  });
}

/** Presign + PUT for custom server emoji image bytes (`purpose: server_emoji`). */
export async function uploadServerEmojiObject(
  token: string,
  serverId: string,
  file: File,
): Promise<string> {
  if (file.size > ECHO_CLIENT_UPLOAD_MAX_BYTES) {
    throw new Error(
      `File exceeds ${ECHO_CLIENT_UPLOAD_MAX_BYTES / (1024 * 1024)} MiB limit`,
    );
  }
  const key = `${randomUuidV4()}-${sanitizeUploadKeyFilename(file.name)}`;
  const contentType = file.type?.trim() || 'application/octet-stream';
  const [presign, emojiSha256Hex] = await Promise.all([
    postEchoUploadPresign(token, {
      serverId,
      purpose: 'server_emoji',
      key,
      contentType,
      contentLength: file.size,
    }),
    sha256HexOfBlob(file),
  ]);
  await putEchoUploadBody(presign, file, contentType, emojiSha256Hex);
  return presign.publicUrl;
}

/**
 * Presign + PUT for join-application attachments (`purpose: server_application_attachment`).
 * Caller must be signed in; server must have applications enabled for non-members.
 */
export async function uploadServerApplicationAttachmentFile(
  token: string,
  serverId: string,
  file: File,
  opts?: {
    questionMaxBytes?: number;
    onProgress?: (percent: number | null) => void;
  },
): Promise<EchoApplicationAttachmentAnswerDto> {
  const cap = Math.min(
    opts?.questionMaxBytes ?? ECHO_CLIENT_UPLOAD_MAX_BYTES,
    ECHO_CLIENT_UPLOAD_MAX_BYTES,
  );
  if (file.size > cap) {
    const mb = Math.max(1, Math.round(cap / (1024 * 1024)));
    throw new Error(`File exceeds ${mb} MiB limit for this question`);
  }

  let prepared: File = file;
  let contentType: string;

  if (isChatVideoUpload(file)) {
    contentType = chatVideoContentTypeForPresign(file);
  } else if (isChatDocumentUpload(file)) {
    contentType = chatDocumentContentTypeForPresign(file);
  } else if (isChatAudioUpload(file)) {
    contentType = chatAudioContentTypeForPresign(file);
  } else if (inferChatPendingMediaKind(file) === 'image') {
    opts?.onProgress?.(null);
    prepared = await compressFileForEchoUpload(file, 'chat');
    const raw = (prepared.type || '').trim();
    const lower = raw.toLowerCase();
    contentType =
      raw && lower !== 'application/octet-stream'
        ? raw
        : chatImageContentTypeForPresign(prepared);
  } else {
    contentType = (file.type || '').trim() || 'application/octet-stream';
    prepared = file;
  }

  if (prepared.size > cap) {
    const mb = Math.max(1, Math.round(cap / (1024 * 1024)));
    throw new Error(`File exceeds ${mb} MiB limit for this question`);
  }

  const key = `${randomUuidV4()}-${sanitizeUploadKeyFilename(file.name)}`;
  const [presign, sha256Hex] = await Promise.all([
    postEchoUploadPresign(token, {
      serverId,
      purpose: 'server_application_attachment',
      key,
      contentType,
      contentLength: prepared.size,
    }),
    sha256HexOfBlob(prepared),
  ]);
  opts?.onProgress?.(0);
  await putEchoUploadBodyWithProgress(
    presign,
    prepared,
    contentType,
    (loaded, total) => {
      if (!opts?.onProgress || total <= 0) return;
      opts.onProgress(Math.min(100, Math.round((100 * loaded) / total)));
    },
    sha256Hex,
  );
  opts?.onProgress?.(100);
  const displayName = file.name.trim().slice(0, 255) || 'file';
  return {
    key: presign.key,
    publicUrl: presign.publicUrl,
    name: displayName,
    size: prepared.size,
    contentType,
  };
}

/** Presign + PUT for profile avatar or banner (`user_avatar` / `user_banner`). */
export async function uploadUserProfileBrandingFile(
  token: string,
  purpose: 'user_avatar' | 'user_banner',
  file: File,
): Promise<string> {
  const preset = purpose === 'user_avatar' ? 'avatar' : 'banner';
  const prepared = await compressFileForEchoUpload(file, preset);
  if (prepared.size > ECHO_CLIENT_UPLOAD_MAX_BYTES) {
    throw new Error(
      `File exceeds ${ECHO_CLIENT_UPLOAD_MAX_BYTES / (1024 * 1024)} MiB limit`,
    );
  }
  return (await uploadPreparedFileWithDedupe(token, { purpose }, prepared)).url;
}

/** Presign + PUT for custom call ringtones (`purpose: user_ringtone`). */
export async function uploadUserRingtoneFile(
  token: string | null,
  file: File,
): Promise<{ url: string; storageKey: string }> {
  if (!isChatAudioUpload(file)) {
    throw new Error('Unsupported file type. Upload an audio file.');
  }
  if (file.size > ECHO_RINGTONE_UPLOAD_MAX_BYTES) {
    throw new Error('File too large. Max size is 6MB.');
  }
  const contentType = file.type?.trim() || chatAudioContentTypeForPresign(file);
  const key = `${randomUuidV4()}-${sanitizeUploadKeyFilename(file.name)}`;
  const [presign, bodySha256Hex] = await Promise.all([
    postEchoUploadPresign(token, {
      purpose: 'user_ringtone',
      key,
      contentType,
      contentLength: file.size,
    }),
    sha256HexOfBlob(file),
  ]);
  await putEchoUploadBody(presign, file, contentType, bodySha256Hex);
  return { url: presign.publicUrl, storageKey: presign.key };
}

/** Presign + PUT for Bug Hunter report screenshots (authenticated; no channel). */
export async function uploadBugReportImage(
  token: string | null,
  file: File,
): Promise<string> {
  const prepared = await compressFileForEchoUpload(file, 'bug_report');
  if (prepared.size > ECHO_CLIENT_UPLOAD_MAX_BYTES) {
    throw new Error(
      `File exceeds ${ECHO_CLIENT_UPLOAD_MAX_BYTES / (1024 * 1024)} MiB limit`,
    );
  }
  return (
    await uploadPreparedFileWithDedupe(
      token,
      { purpose: 'bug_report' },
      prepared,
    )
  ).url;
}

/** Presign + PUT for guild event cover images (requires `MANAGE_GUILD` / owner on `serverId`). */
export async function uploadServerEventCoverFile(
  token: string,
  serverId: string,
  file: File,
): Promise<string> {
  const prepared = await compressFileForEchoUpload(file, 'banner');
  if (prepared.size > ECHO_CLIENT_UPLOAD_MAX_BYTES) {
    throw new Error(
      `File exceeds ${ECHO_CLIENT_UPLOAD_MAX_BYTES / (1024 * 1024)} MiB limit`,
    );
  }
  return (
    await uploadPreparedFileWithDedupe(
      token,
      {
        serverId,
        purpose: 'server_event_cover',
      },
      prepared,
    )
  ).url;
}

/** Presign + PUT for server icon or banner image (requires `MANAGE_GUILD`). */
export async function uploadServerBrandingFile(
  token: string,
  serverId: string,
  purpose: 'server_icon' | 'server_banner',
  file: File,
): Promise<string> {
  const preset = purpose === 'server_icon' ? 'avatar' : 'banner';
  const prepared = await compressFileForEchoUpload(file, preset);
  if (prepared.size > ECHO_CLIENT_UPLOAD_MAX_BYTES) {
    throw new Error(
      `File exceeds ${ECHO_CLIENT_UPLOAD_MAX_BYTES / (1024 * 1024)} MiB limit`,
    );
  }
  return (
    await uploadPreparedFileWithDedupe(token, { serverId, purpose }, prepared)
  ).url;
}
