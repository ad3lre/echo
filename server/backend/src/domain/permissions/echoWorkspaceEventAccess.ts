import type pg from 'pg';
import { canUserReadEchoTicket } from './echoTicketAccess';
import type { EchoWorkspaceEvent } from '../../../../../contracts/types/socket';
import { canUserAccessChannel, isMemberOfServer } from './echoPermissions';
import { assertPaperContentVisibleToUser } from '../echoStore/paper/paperShare';
import { getEchoTicketById } from '../echoStore/community/tickets';

type WorkspaceEventAccessDeps = {
  isMemberOfServer: typeof isMemberOfServer;
  canUserAccessChannel: typeof canUserAccessChannel;
};

const defaultDeps: WorkspaceEventAccessDeps = {
  isMemberOfServer,
  canUserAccessChannel,
};

let deps: WorkspaceEventAccessDeps = defaultDeps;

/** Test-only: swap membership / channel-access probes. */
export function setEchoWorkspaceEventAccessDepsForTests(
  next: Partial<WorkspaceEventAccessDeps>,
): void {
  deps = { ...deps, ...next };
}

export function resetEchoWorkspaceEventAccessDepsForTests(): void {
  deps = { ...defaultDeps };
}

function voiceChannelIdFromWorkspaceEvent(
  event: EchoWorkspaceEvent,
): string | null {
  const top =
    typeof event.voiceChannelId === 'string' ? event.voiceChannelId.trim() : '';
  if (top) return top;
  const fromMedia =
    typeof event.voiceMediaKey?.channelId === 'string'
      ? event.voiceMediaKey.channelId.trim()
      : '';
  if (fromMedia) return fromMedia;
  const fromMls =
    typeof event.voiceMls?.channelId === 'string'
      ? event.voiceMls.channelId.trim()
      : '';
  return fromMls || null;
}

/** Reuse HTTP read policies at delivery time, including durable-event replay. */
export async function canUserReceiveServerWorkspaceEvent(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  event: EchoWorkspaceEvent,
): Promise<boolean> {
  if (event.serverId && event.serverId !== serverId) return false;
  if (!(await deps.isMemberOfServer(pool, serverId, userId))) return false;
  if (
    event.kind === 'paper_document_updated' ||
    event.kind === 'paper_comment_updated'
  ) {
    const channelId =
      event.kind === 'paper_document_updated'
        ? event.paperDocument?.channelId
        : event.paperComment?.channelId;
    if (
      !channelId ||
      !(await deps.canUserAccessChannel(pool, userId, channelId))
    )
      return false;
    return (await assertPaperContentVisibleToUser(pool, channelId, userId)).ok;
  }
  if (event.kind === 'ticket_created' || event.kind === 'ticket_updated') {
    if (!event.ticketEvent?.ticketId) return false;
    const ticket = await getEchoTicketById(pool, event.ticketEvent.ticketId);
    if (
      !ticket ||
      ticket.serverId !== serverId ||
      ticket.channelId !== event.ticketEvent.channelId
    )
      return false;
    return canUserReadEchoTicket(pool, serverId, userId, ticket);
  }
  // Voice channel–scoped notifies must not leak private/staff VC activity to
  // members who lack VIEW_CHANNEL (roster deltas already filter separately).
  if (
    event.kind === 'voice_media_key' ||
    event.kind === 'voice_e2ee_epoch_superseded' ||
    event.kind === 'voice_active_speakers' ||
    event.kind === 'voice_mls_message'
  ) {
    const channelId = voiceChannelIdFromWorkspaceEvent(event);
    if (
      !channelId ||
      !(await deps.canUserAccessChannel(pool, userId, channelId))
    ) {
      return false;
    }
    const mlsRecipient = event.voiceMls?.recipientUserId?.trim();
    if (mlsRecipient && mlsRecipient !== userId) return false;
    return true;
  }
  return true;
}
