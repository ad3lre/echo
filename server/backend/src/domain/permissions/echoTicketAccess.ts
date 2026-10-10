import type pg from 'pg';
import type { EchoTicket } from '../../../../../contracts/types/ticket';
import { isMemberOfServer } from './echoPermissions';
import { isTicketHandler } from '../echoStore/community/tickets';

/** Ticket details are visible only to current member authors and handlers. */
export async function canUserReadEchoTicket(
  pool: pg.Pool,
  serverId: string,
  userId: string,
  ticket: Pick<EchoTicket, 'serverId' | 'authorId'>,
): Promise<boolean> {
  if (ticket.serverId !== serverId) return false;
  if (!(await isMemberOfServer(pool, serverId, userId))) return false;
  return (
    ticket.authorId === userId ||
    (await isTicketHandler(pool, serverId, userId))
  );
}
