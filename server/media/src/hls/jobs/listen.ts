import pg from 'pg';
import { config } from '../../../../backend/src/config';
import { ECHO_VIDEO_HLS_NOTIFY_CHANNEL } from './notify';
import type { EchoVideoHlsScheduler } from './scheduler';
import type { EchoVideoHlsLog } from './drain';

/**
 * LISTEN on a dedicated Postgres connection; kick the scheduler when the API enqueues work.
 * On failure, returns a no-op teardown and the worker continues on poll-only.
 */
export async function startEchoVideoHlsListen(
  scheduler: EchoVideoHlsScheduler,
  log: EchoVideoHlsLog,
): Promise<() => Promise<void>> {
  const connectionString = config.databaseUrl;
  if (!connectionString) {
    return async () => {};
  }

  let client: pg.Client | null = null;

  try {
    client = new pg.Client({ connectionString });
    await client.connect();
    await client.query(`LISTEN ${ECHO_VIDEO_HLS_NOTIFY_CHANNEL}`);

    const onNotification = (): void => {
      scheduler.kick();
    };
    const onError = (err: Error): void => {
      log.warn({ err: err.message }, 'echo.video_hls.listen_connection_error');
    };
    client.on('notification', onNotification);
    client.on('error', onError);

    log.info(
      { channel: ECHO_VIDEO_HLS_NOTIFY_CHANNEL },
      'echo.video_hls.listen_started',
    );

    return async () => {
      client?.removeListener('notification', onNotification);
      client?.removeListener('error', onError);
      try {
        if (client) {
          await client.query(`UNLISTEN ${ECHO_VIDEO_HLS_NOTIFY_CHANNEL}`);
        }
      } catch {
        /* closing */
      }
      try {
        await client?.end();
      } catch {
        /* closed */
      }
      client = null;
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(
      { err: message, channel: ECHO_VIDEO_HLS_NOTIFY_CHANNEL },
      'echo.video_hls.listen_failed_poll_only',
    );
    try {
      await client?.end();
    } catch {
      /* ignore */
    }
    return async () => {};
  }
}
