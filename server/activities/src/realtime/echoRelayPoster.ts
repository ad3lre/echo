import { signEchoWebhookBody } from '../../../../contracts/echoWebhookHmac';
import type { GameEventMsg, GameSnapshotMsg } from '../../cores/games';

export type EchoRelayPoster = {
  postSnapshot: (userId: string, msg: GameSnapshotMsg) => void;
  postEventToUser: (userId: string, msg: GameEventMsg) => void;
  postEventToRoom: (msg: GameEventMsg) => void;
};

export function createEchoRelayPoster(opts: {
  relayBaseUrl: string;
  forwardSecret: string;
}): EchoRelayPoster | null {
  const base = opts.relayBaseUrl.trim().replace(/\/$/, '');
  const secret = opts.forwardSecret.trim();
  if (!base || !secret) return null;

  const url = `${base}/api/v1/internal/game/outbound`;

  function post(body: unknown): void {
    const rawBody = JSON.stringify(body);
    const signed = signEchoWebhookBody(secret, rawBody);
    void fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-echo-signature-ts': signed['x-echo-signature-ts'],
        'x-echo-signature': signed['x-echo-signature'],
      },
      body: rawBody,
    })
      .then((res) => {
        if (!res.ok) {
          console.warn(`[echo-relay] POST ${url} failed status=${res.status}`);
        }
      })
      .catch((err) => {
        console.warn(
          `[echo-relay] POST ${url} error:`,
          err instanceof Error ? err.message : String(err),
        );
      });
  }

  return {
    postSnapshot: (userId, msg) => post({ userId, snapshot: msg }),
    postEventToUser: (userId, msg) => post({ userId, event: msg }),
    postEventToRoom: (msg) => post({ roomEvent: msg }),
  };
}
