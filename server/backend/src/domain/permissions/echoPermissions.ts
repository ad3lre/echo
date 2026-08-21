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
  evaluateEchoPostMessageAccess,
  gatherEchoPostMessageFailureDiagnostics,
  getEchoChannelCapabilitiesForUser,
  getEffectiveChannelPermissions,
  getEchoServerCapabilitiesForUser,
  isEchoServerOwner,
  messageContainsMassMention,
} from '../echoStore';
import { getEchoMemberAccessState } from '../echoStore/members/memberAccessState';

/**
 * Single surface for Echo permission checks (REST + Socket.IO).
 * Implementation lives in `echoStore`; this module is the stable import path.
 *
 * Member-and-not-banned via the cached member-access state (same SQL semantics as the
 * previous raw member + ban queries, one round-trip, 20s TTL, invalidated at every
 * membership/ban mutation site) — this runs on most role/server REST routes.
 */
export async function isMemberOfServer(
  pool: pg.Pool,
  serverId: string,
  userId: string,
): Promise<boolean> {
  const state = await getEchoMemberAccessState(pool, serverId, userId);
  return state.isMember && !state.banned;
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
  evaluateEchoPostMessageAccess,
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
  EchoPostMessageAccessContext,
  EchoPostMessageDenialReason,
} from '../echoStore';
