import {
  fetchEchoServerApplicationSettings as implFetchServerApplicationSettings,
  fetchEchoServerApplications as implFetchServerApplications,
  postEchoServerApplicationApprove as implApproveServerApplication,
  postEchoServerApplicationReject as implRejectServerApplication,
  postEchoServerApplicationSubmit as implSubmitServerApplication,
} from '@/api/echo/serverApplications';
import {
  ECHO_CLIENT_UPLOAD_MAX_BYTES,
  uploadServerApplicationAttachmentFile as implUploadServerApplicationAttachment,
} from '@/api/echo/uploads';

export { ECHO_CLIENT_UPLOAD_MAX_BYTES };

export async function httpFetchServerApplicationSettings(
  ...args: Parameters<typeof implFetchServerApplicationSettings>
) {
  return implFetchServerApplicationSettings(...args);
}

export async function httpFetchServerApplications(
  ...args: Parameters<typeof implFetchServerApplications>
) {
  return implFetchServerApplications(...args);
}

export async function httpApproveServerApplication(
  ...args: Parameters<typeof implApproveServerApplication>
) {
  return implApproveServerApplication(...args);
}

export async function httpRejectServerApplication(
  ...args: Parameters<typeof implRejectServerApplication>
) {
  return implRejectServerApplication(...args);
}

export async function httpSubmitServerApplication(
  ...args: Parameters<typeof implSubmitServerApplication>
) {
  return implSubmitServerApplication(...args);
}

export async function httpUploadServerApplicationAttachment(
  ...args: Parameters<typeof implUploadServerApplicationAttachment>
) {
  return implUploadServerApplicationAttachment(...args);
}
