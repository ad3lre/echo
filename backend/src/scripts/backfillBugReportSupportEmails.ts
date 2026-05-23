/**
 * One-off: email all rows in echo_bug_reports to ECHO_SUPPORT_EMAIL.
 *
 * Usage (from backend/):
 *   npx ts-node src/scripts/backfillBugReportSupportEmails.ts           # dry-run
 *   npx ts-node src/scripts/backfillBugReportSupportEmails.ts --execute # send
 */
import 'dotenv/config';
import pino from 'pino';
import type { FastifyBaseLogger } from 'fastify';
import { closePgPool, getPgPool } from '../db/pg';
import { sendBugReportSupportEmail } from '../services/email/echoBugReportEmail';

const execute = process.argv.includes('--execute');

function scriptLog(): FastifyBaseLogger {
  return pino({ level: 'info' }) as unknown as FastifyBaseLogger;
}

async function main(): Promise<void> {
  const pool = getPgPool();
  if (!pool) {
    console.error('DATABASE_URL is not set; nothing to do.');
    process.exit(1);
  }

  const { rows } = await pool.query(
    `
    SELECT
      br.id,
      br.body,
      br.client_meta,
      br.trace_json,
      br.attachment_urls,
      br.created_at,
      u.id AS reporter_id,
      u.username AS reporter_username,
      u.display_name AS reporter_display_name,
      u.email AS reporter_email
    FROM echo_bug_reports br
    JOIN auth_users u ON u.id = br.reporter_id
    ORDER BY br.created_at ASC
    `,
  );

  if (rows.length === 0) {
    console.log('No bug reports in database.');
    await closePgPool();
    return;
  }

  console.log(
    `${execute ? 'Sending' : 'Would send'} ${rows.length} bug report email(s) to support.`,
  );

  const log = scriptLog();
  for (const row of rows) {
    const id = String(row.id);
    const label = `${id} (@${row.reporter_username})`;
    if (!execute) {
      console.log(`  · ${label}`);
      continue;
    }
    await sendBugReportSupportEmail(log, {
      id,
      body: String(row.body ?? ''),
      clientMeta: row.client_meta ?? {},
      traceJson: row.trace_json ?? {},
      attachmentUrls: Array.isArray(row.attachment_urls)
        ? row.attachment_urls.map((entry: unknown) => String(entry))
        : [],
      createdAt: new Date(row.created_at).toISOString(),
      reporter: {
        id: String(row.reporter_id),
        username: String(row.reporter_username ?? ''),
        displayName: String(row.reporter_display_name ?? ''),
        ...(row.reporter_email ? { email: String(row.reporter_email) } : {}),
      },
    });
    console.log(`  ✓ ${label}`);
  }

  if (!execute) {
    console.log('\nDry run. Re-run with --execute to send.');
  }

  await closePgPool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
