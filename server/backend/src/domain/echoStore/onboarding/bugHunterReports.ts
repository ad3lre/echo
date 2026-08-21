import type pg from 'pg';
import { nextEchoSnowflakeId } from '../../echoSnowflake';

export async function insertEchoBugReport(
  pool: pg.Pool,
  reporterId: string,
  opts: {
    body: string;
    clientMeta: unknown;
    traceJson: unknown;
    attachmentUrls: string[];
  },
): Promise<string> {
  const id = nextEchoSnowflakeId();
  await pool.query(
    `
    INSERT INTO echo_bug_reports (id, reporter_id, body, client_meta, trace_json, attachment_urls)
    VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
    `,
    [
      id,
      reporterId,
      opts.body,
      JSON.stringify(opts.clientMeta ?? {}),
      JSON.stringify(opts.traceJson ?? {}),
      JSON.stringify(opts.attachmentUrls ?? []),
    ],
  );
  return id;
}
