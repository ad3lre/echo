/**
 * Run: node --import tsx backend/src/tests/paperCollabCursorBatching.test.ts
 *
 * Verifies that paper:cursor broadcasts are coalesced per channel: rapid moves
 * collapse into a single delayed snapshot, while emitCursorsNow flushes immediately.
 */
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import type { Server } from 'socket.io';
import {
  CURSOR_FLUSH_MS,
  broadcastCursors,
  cancelPendingCursorFlush,
  channelCursors,
  emitCursorsNow,
} from '../sockets/paperCollabHandler';

type EmitRecord = { event: string; payload: unknown };

/** Minimal io stub recording room emits. */
function makeFakeIo(): { io: Server; emits: EmitRecord[] } {
  const emits: EmitRecord[] = [];
  const io = {
    to() {
      return {
        emit(event: string, payload: unknown) {
          emits.push({ event, payload });
        },
      };
    },
  } as unknown as Server;
  return { io, emits };
}

function seedCursor(channelId: string, userId: string): void {
  let map = channelCursors.get(channelId);
  if (!map) {
    map = new Map();
    channelCursors.set(channelId, map);
  }
  map.set(userId, {
    userId,
    displayName: userId,
    color: '#6366f1',
    blockId: 'b1',
    anchor: 0,
    head: 1,
    updatedAt: Date.now(),
  });
}

function reset(channelId: string): void {
  cancelPendingCursorFlush(channelId);
  channelCursors.delete(channelId);
}

async function testCoalescesRapidMoves(): Promise<void> {
  const channelId = 'ch-batch';
  reset(channelId);
  seedCursor(channelId, 'u1');
  seedCursor(channelId, 'u2');
  const { io, emits } = makeFakeIo();

  // Many rapid moves within the flush window.
  for (let i = 0; i < 25; i++) broadcastCursors(io, channelId);
  assert.equal(emits.length, 0, 'no emit before the flush window elapses');

  await delay(CURSOR_FLUSH_MS + 20);
  assert.equal(emits.length, 1, 'exactly one coalesced emit');
  assert.equal(emits[0].event, 'paper:cursors');
  const payload = emits[0].payload as { channelId: string; cursors: unknown[] };
  assert.equal(payload.channelId, channelId);
  assert.equal(payload.cursors.length, 2, 'snapshot carries both cursors');

  reset(channelId);
}

async function testEmitNowFlushesImmediatelyAndCancelsPending(): Promise<void> {
  const channelId = 'ch-now';
  reset(channelId);
  seedCursor(channelId, 'u1');
  const { io, emits } = makeFakeIo();

  broadcastCursors(io, channelId); // schedule a pending flush
  emitCursorsNow(io, channelId); // immediate flush, should cancel the pending one
  assert.equal(emits.length, 1, 'emitCursorsNow emits synchronously');

  await delay(CURSOR_FLUSH_MS + 20);
  assert.equal(
    emits.length,
    1,
    'pending flush was cancelled — no duplicate emit',
  );

  reset(channelId);
}

async function run(): Promise<void> {
  await testCoalescesRapidMoves();
  await testEmitNowFlushesImmediatelyAndCancelsPending();
  console.log('paperCollabCursorBatching.test: ok');
}

void run();
