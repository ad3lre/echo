import type pg from 'pg';
import { canUserReadEchoTicket } from './echoTicketAccess';
import type { EchoWorkspaceEvent } from '../../../../../contracts/types/socket';
import { canUserAccessChannel, isMemberOfServer } from './echoPermissions';
import { assertPaperContentVisibleToUser } from '../echoStore/paper/paperShare';
import { getEchoTicketById } from '../echoStore/community/tickets';

/** Reuse HTTP read policies at delivery time, including durable-event replay. */
export async function canUserReceiveServerWorkspaceEvent(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  event: EchoWorkspaceEvent,
): Promise<boolean> {
  if (event.serverId && event.serverId !== serverId) return false;
  if (!(await isMemberOfServer(pool, serverId, userId))) return false;
  if (
    event.kind === 'paper_document_updated' ||
    event.kind === 'paper_comment_updated'
  ) {
    const channelId =
      event.kind === 'paper_document_updated'
        ? event.paperDocument?.channelId
        : event.paperComment?.channelId;
    if (!channelId || !(await canUserAccessChannel(pool, userId, channelId)))
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
  return true;
}
