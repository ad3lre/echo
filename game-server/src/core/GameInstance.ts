import type {
  GameEventMsg,
  GameErrorReason,
  GameSnapshotMsg,
} from '../../../shared/games';
import type { GameModule } from './GameModule';

/**
 * Transport seam. The instance speaks in user ids; the implementation fans a
 * per-user snapshot out to all of that user's sockets (and across nodes via the
 * NATS adapter). Injected so the core is transport-agnostic and unit-testable.
 */
export interface GameEmitter {
  snapshotToUser(userId: string, msg: GameSnapshotMsg): void;
  eventToUser(userId: string, msg: GameEventMsg): void;
  eventToRoom(msg: GameEventMsg): void;
}

/** One authoritative match for one room. Owns state; everyone else renders projections. */
export class GameInstance<S = unknown, V = unknown> {
  private state: S;
  private rev = 0;
  private readonly members = new Set<string>();
  private lastActiveAt: number;

  constructor(
    private readonly module: GameModule<S, V>,
    private readonly roomId: string,
    private readonly emitter: GameEmitter,
    now: number,
  ) {
    this.state = module.createInitialState({
      roomId,
      gameKey: module.key,
      now,
    });
    this.lastActiveAt = now;
  }

  get gameKey() {
    return this.module.key;
  }
  get tickHz() {
    return this.module.tickHz;
  }
  get memberCount() {
    return this.members.size;
  }
  isEmpty(): boolean {
    return this.members.size === 0;
  }
  idleSince(): number {
    return this.lastActiveAt;
  }
  roster(): string[] {
    return [...this.members].sort((a, b) => a.localeCompare(b));
  }

  join(userId: string, now: number): void {
    this.lastActiveAt = now;
    const fresh = !this.members.has(userId);
    this.members.add(userId);
    if (fresh && this.module.onJoin) {
      const next = this.module.onJoin(this.state, userId, now);
      if (next != null) {
        this.state = next;
        this.rev++;
        this.broadcast();
        return;
      }
    }
    // The joiner always needs the current snapshot, even if state didn't change.
    this.sendSnapshot(userId);
  }

  leave(userId: string, now: number): void {
    if (!this.members.delete(userId)) return;
    this.lastActiveAt = now;
    if (this.module.onLeave) {
      const next = this.module.onLeave(this.state, userId, now);
      if (next != null) {
        this.state = next;
        this.rev++;
        this.broadcast();
      }
    }
  }

  /** Returns an error reason on rejection, or `null` on success. */
  dispatch(
    userId: string,
    type: string,
    payload: unknown,
    now: number,
  ): GameErrorReason | null {
    if (!this.members.has(userId)) return 'not_in_room';
    this.lastActiveAt = now;
    const ctx = {
      userId,
      type,
      now,
      roster: this.roster(),
    };
    const next = this.module.reduce(this.state, payload, ctx);
    if (next != null) {
      this.state = next;
      this.rev++;
      this.broadcast();
      return null;
    }
    if (this.module.relay) {
      const evt = this.module.relay(this.state, payload, ctx);
      if (evt) {
        this.emitter.eventToRoom({
          roomId: this.roomId,
          kind: evt.kind,
          data: evt.data,
        });
        return null;
      }
    }
    return 'rejected';
  }

  /** Drive timers. Returns true if state mutated. */
  runTick(now: number): boolean {
    if (!this.module.tick) return false;
    const next = this.module.tick(this.state, now, this.roster());
    if (next == null) return false;
    this.state = next;
    this.rev++;
    this.lastActiveAt = now;
    this.broadcast();
    return true;
  }

  private sendSnapshot(userId: string): void {
    this.emitter.snapshotToUser(userId, {
      roomId: this.roomId,
      gameKey: this.module.key,
      rev: this.rev,
      view: this.module.serializeFor(userId, this.state),
    });
  }

  private broadcast(): void {
    for (const uid of this.members) this.sendSnapshot(uid);
  }
}
