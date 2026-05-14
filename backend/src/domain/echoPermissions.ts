import type pg from 'pg';
import {
  canUserMassMentionInChannel,
  canUserSendMassMentionInChannel,
  canUserAccessChannel,
  canUserAddMessageReaction,
  canUserCreateEchoChannel,
  canUserCreateInvite,
  canUserPostMessage,
  diagnoseEchoChannelAccess,
  diagnoseEchoPostMessageDenial,
  gatherEchoPostMessageFailureDiagnostics,
  getEchoChannelCapabilitiesForUser,
  getEffectiveChannelPermissions,
  getEchoServerCapabilitiesForUser,
  isEchoServerOwner,
  isUserBannedFromServer,
  messageContainsMassMention,
} from './echoStore';

/**
 * Single surface for Echo permission checks (REST + Socket.IO).
 * Implementation lives in `echoStore`; this module is the stable import path.
 */
export async function isMemberOfServer(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM echo_server_members WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  if (r.rows.length === 0) return false;
  return !(await isUserBannedFromServer(pool, serverId, userId));
}

export {
  canUserMassMentionInChannel,
  canUserSendMassMentionInChannel,
  canUserAccessChannel,
  canUserAddMessageReaction,
  canUserCreateEchoChannel,
  canUserCreateInvite,
  canUserPostMessage,
  diagnoseEchoChannelAccess,
  diagnoseEchoPostMessageDenial,
  gatherEchoPostMessageFailureDiagnostics,
  getEchoChannelCapabilitiesForUser,
  getEffectiveChannelPermissions,
  getEchoServerCapabilitiesForUser,
  isEchoServerOwner,
  messageContainsMassMention,
};
export type {
  EchoChannelAccessDenialCode,
  EchoChannelAccessDiagnosis,
  EchoPostMessageDenialReason,
} from './echoStore';
