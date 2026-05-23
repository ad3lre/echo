import {
  deleteEchoStageRequestSpeak,
  postEchoStageRequestSpeak,
} from '@/api/echo/voice';

/** Stage audience: request moderator approval to speak (HTTP; not a LiveKit control). */
export async function requestEchoStageSpeak(
  accessToken: string,
  serverId: string,
  channelId: string,
): Promise<void> {
  await postEchoStageRequestSpeak(accessToken, serverId, channelId);
}

/** Withdraw a pending speak request on a stage channel. */
export async function cancelEchoStageSpeakRequest(
  accessToken: string,
  serverId: string,
  channelId: string,
): Promise<void> {
  await deleteEchoStageRequestSpeak(accessToken, serverId, channelId);
}
