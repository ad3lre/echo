import assert from 'node:assert/strict';
import type { EchoVcActivityKey } from '../../cores/vcActivityCatalog';
import type { GameEventMsg, GameSnapshotMsg } from '../../cores/games';
import type { GameEmitter } from '../core/GameInstance';
import type { GameModule } from '../core/GameModule';
import { RoomManager } from '../core/RoomManager';

class CapturingEmitter implements GameEmitter {
  readonly last = new Map<string, GameSnapshotMsg>();
  readonly snapshotCount = new Map<string, number>();
  readonly events: GameEventMsg[] = [];
  snapshotToUser(userId: string, msg: GameSnapshotMsg): void {
    this.last.set(userId, msg);
    this.snapshotCount.set(userId, (this.snapshotCount.get(userId) ?? 0) + 1);
  }
  eventToUser(_userId: string, msg: GameEventMsg): void {
    this.events.push(msg);
  }
  eventToRoom(msg: GameEventMsg): void {
    this.events.push(msg);
  }
}

type ClaimState = { owner: string | null; secret: string; claims: number };
type ClaimView = {
  owner: string | null;
  claims: number;
  secret: string | null;
};

/** Turn game whose `serializeFor` redacts the secret from everyone but the owner. */
function claimModule(key: EchoVcActivityKey): GameModule {
  return {
    key,
    tickHz: 0,
    createInitialState: () =>
      ({ owner: null, secret: 'S3CRET', claims: 0 }) satisfies ClaimState,
    reduce: (state, _payload, ctx) => {
      const s = state as ClaimState;
      if (ctx.type !== 'claim') return null; // reject unknown actions
      return {
        ...s,
        owner: ctx.userId,
        claims: s.claims + 1,
      } satisfies ClaimState;
    },
    serializeFor: (viewer, state): ClaimView => {
      const s = state as ClaimState;
      return {
        owner: s.owner,
        claims: s.claims,
        secret: viewer === s.owner ? s.secret : null,
      };
    },
  };
}

type CountState = { ticks: number };
const timedModule: GameModule = {
  key: 'wordle',
  tickHz: 4,
  createInitialState: () => ({ ticks: 0 }) satisfies CountState,
  reduce: () => null,
  tick: (state) =>
    ({ ticks: (state as CountState).ticks + 1 }) satisfies CountState,
  serializeFor: (_viewer, state) => state,
};

export function runRoomLifecycleTests(): void {
  const emitters = new Map<string, CapturingEmitter>();
  const counts: Array<{ key: string; delta: number }> = [];
  const manager = new RoomManager(
    [claimModule('tic_tac_toe'), claimModule('hangman'), timedModule],
    (roomId) => {
      const e = new CapturingEmitter();
      emitters.set(roomId, e);
      return e;
    },
    (key, delta) => counts.push({ key, delta }),
  );

  // join → instance created, joiner gets a snapshot
  assert.equal(manager.join('R1', 'tic_tac_toe', 'alice', 1000), null);
  assert.equal(manager.size, 1);
  const e1 = emitters.get('R1')!;
  assert.ok(e1.last.get('alice'), 'alice should receive a snapshot on join');
  assert.equal(counts.filter((c) => c.delta === 1).length, 1);

  // unknown (unregistered) game → unknown_game
  assert.equal(manager.join('R2', 'skriggles', 'bob', 1000), 'unknown_game');
  assert.equal(manager.size, 1);

  // a room runs one game → mismatch is rejected
  assert.equal(manager.join('R1', 'hangman', 'eve', 1000), 'room_mismatch');

  // second member joins the same room
  assert.equal(manager.join('R1', 'tic_tac_toe', 'bob', 1100), null);

  // member action applies + broadcasts to ALL members with a higher rev
  const revBefore = e1.last.get('alice')!.rev;
  assert.equal(manager.dispatch('R1', 'alice', 'claim', undefined, 1200), null);
  const aliceSnap = e1.last.get('alice')!;
  const bobSnap = e1.last.get('bob')!;
  assert.ok(aliceSnap.rev > revBefore, 'rev should advance on a state change');
  assert.equal(
    bobSnap.rev,
    aliceSnap.rev,
    'all members share one authoritative rev',
  );

  // ⚑ anti-cheat: only the owner's view carries the secret
  assert.equal((aliceSnap.view as ClaimView).owner, 'alice');
  assert.equal((aliceSnap.view as ClaimView).secret, 'S3CRET');
  assert.equal((bobSnap.view as ClaimView).secret, null);

  // illegal action → rejected, no rev bump, no extra broadcast
  const revAfterClaim = e1.last.get('alice')!.rev;
  const aliceCountBefore = e1.snapshotCount.get('alice')!;
  assert.equal(
    manager.dispatch('R1', 'alice', 'noop', undefined, 1300),
    'rejected',
  );
  assert.equal(e1.last.get('alice')!.rev, revAfterClaim);
  assert.equal(e1.snapshotCount.get('alice')!, aliceCountBefore);

  // non-member action → not_in_room
  assert.equal(
    manager.dispatch('R1', 'mallory', 'claim', undefined, 1400),
    'not_in_room',
  );

  // timed module advances on tickAll
  assert.equal(manager.join('R3', 'wordle', 'carol', 2000), null);
  const e3 = emitters.get('R3')!;
  const ticksBefore = (e3.last.get('carol')!.view as CountState).ticks;
  manager.tickAll(2100);
  assert.equal(
    (e3.last.get('carol')!.view as CountState).ticks,
    ticksBefore + 1,
  );

  // leave everyone + idle sweep disposes the instance
  manager.leave('R1', 'alice', 3000);
  manager.leave('R1', 'bob', 3000);
  manager.sweepIdle(3000 + 60_001, 60_000);
  assert.ok(manager.size < 3, 'idle empty instance should be reaped');
  assert.ok(
    counts.some((c) => c.delta === -1),
    'instance disposal should emit a -1 count change',
  );

  console.log('✓ roomLifecycle: 16 assertions passed');
}
