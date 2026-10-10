import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import Fastify from 'fastify';
import { registerInternalGameRoutes } from './internalGameRoutes';
import type { RoomManager } from '../core/RoomManager';
import { TunneledMembership } from '../realtime/tunneledMembership';
import { gameServerConfig } from '../config';

for (const operation of ['join', 'action', 'leave']) {
  test(`${operation} authenticates before accessing game state`, async () => {
    const app = Fastify();
    let calls = 0;
    const manager = {
      join() {
        calls++;
        return null;
      },
      dispatch() {
        calls++;
        return null;
      },
      leave() {
        calls++;
      },
      getSnapshotForUser() {
        calls++;
        return null;
      },
    } as unknown as RoomManager;
    const tunneled = new TunneledMembership();
    tunneled.add('room', 'victim');
    registerInternalGameRoutes(app, manager, tunneled);
    const payload = JSON.stringify({
      roomId: 'room',
      userId: 'victim',
      gameKey: 'tic_tac_toe',
      type: 'move',
    });
    const ts = String(Date.now());
    const sign = (body: string, timestamp = ts) => ({
      'x-echo-signature-ts': timestamp,
      'x-echo-signature': createHmac(
        'sha256',
        gameServerConfig.echoForwardSecret,
      )
        .update(`${timestamp}.${body}`)
        .digest('hex'),
    });
    try {
      for (const headers of [
        {},
        { 'x-echo-signature-ts': ts, 'x-echo-signature': '00'.repeat(32) },
        sign(`${payload} `),
        sign(payload, String(Date.now() - 600_000)),
      ]) {
        const res = await app.inject({
          method: 'POST',
          url: `/internal/v1/game/${operation}`,
          payload,
          headers: { 'content-type': 'application/json', ...headers },
        });
        assert.equal(res.statusCode, 401);
        assert.equal(calls, 0);
        assert.equal(tunneled.has('room', 'victim'), true);
      }
      const res = await app.inject({
        method: 'POST',
        url: `/internal/v1/game/${operation}`,
        payload,
        headers: { 'content-type': 'application/json', ...sign(payload) },
      });
      assert.equal(res.statusCode, 200);
      assert.ok(calls > 0);
    } finally {
      await app.close();
    }
  });
}
