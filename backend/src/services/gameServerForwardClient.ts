import { config } from '../config';
import { signEchoWebhookBody } from '../../../shared/echoWebhookHmac';
import type { GameErrorReason, GameSnapshotMsg } from '../../../shared/games';
import type { EchoVcActivityKey } from '../../../shared/vcActivityCatalog';

type ForwardOk<T> = { ok: true } & T;
type ForwardErr = { ok: false; reason: GameErrorReason };

export type GameForwardJoinResult =
  | ForwardOk<{ snapshot: GameSnapshotMsg | null }>
  | ForwardErr;

export type GameForwardActionResult =
  | ForwardOk<{ snapshot: GameSnapshotMsg | null }>
  | ForwardErr;

export type GameForwardLeaveResult = { ok: true } | ForwardErr;

async function postGameServer<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T | null> {
  if (!config.gameServerEnabled) return null;
  const base = config.gameServerInternalUrl.replace(/\/$/, '');
  const secret = config.gameServerForwardSecret;
  if (!base || !secret) return null;

  const rawBody = JSON.stringify(body);
  const signed = signEchoWebhookBody(secret, rawBody);
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-echo-signature-ts': signed['x-echo-signature-ts'],
      'x-echo-signature': signed['x-echo-signature'],
    },
    body: rawBody,
  });
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function forwardGameJoin(opts: {
  roomId: string;
  gameKey: EchoVcActivityKey;
  userId: string;
}): Promise<GameForwardJoinResult | null> {
  const data = await postGameServer<{
    ok: boolean;
    reason?: GameErrorReason;
    snapshot?: GameSnapshotMsg | null;
  }>('/internal/v1/game/join', opts);
  if (!data) return null;
  if (!data.ok) {
    return { ok: false, reason: data.reason ?? 'rejected' };
  }
  return { ok: true, snapshot: data.snapshot ?? null };
}

export async function forwardGameAction(opts: {
  roomId: string;
  userId: string;
  type: string;
  payload?: unknown;
}): Promise<GameForwardActionResult | null> {
  const data = await postGameServer<{
    ok: boolean;
    reason?: GameErrorReason;
    snapshot?: GameSnapshotMsg | null;
  }>('/internal/v1/game/action', opts);
  if (!data) return null;
  if (!data.ok) {
    return { ok: false, reason: data.reason ?? 'rejected' };
  }
  return { ok: true, snapshot: data.snapshot ?? null };
}

export async function forwardGameLeave(opts: {
  roomId: string;
  userId: string;
}): Promise<GameForwardLeaveResult | null> {
  const data = await postGameServer<{ ok: boolean; reason?: GameErrorReason }>(
    '/internal/v1/game/leave',
    opts,
  );
  if (!data) return null;
  if (!data.ok) {
    return { ok: false, reason: data.reason ?? 'rejected' };
  }
  return { ok: true };
}
