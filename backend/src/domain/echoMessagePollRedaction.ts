import { redactPollForViewer } from '../../../shared/types';
import type { EchoMessageRow } from './echoMessagesDal';

export function redactAnonymousPollsInEchoMessageRows(
  rows: EchoMessageRow[],
  viewerUserId: string | undefined,
): EchoMessageRow[] {
  return rows.map((row) => {
    if (!row.poll || row.poll.anonymous !== true) return row;
    return { ...row, poll: redactPollForViewer(row.poll, viewerUserId) };
  });
}
