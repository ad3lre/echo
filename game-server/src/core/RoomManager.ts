import type { EchoVcActivityKey } from '../../../shared/vcActivityCatalog';
import type { GameErrorReason } from '../../../shared/games';
import { GameInstance, type GameEmitter } from './GameInstance';
import type { GameModule } from './GameModule';

export type EmitterFactory = (roomId: string) => GameEmitter;

/** Called when an instance is created (+1) or disposed (-1), for metrics. */
export type InstanceCountListener = (
  gameKey: EchoVcActivityKey,
  delta: 1 | -1,
) => void;

/**
 * Owns the live `roomId → GameInstance` map and the registry of game modules.
 * One instance per room; a room runs a single game at a time.
 */
export class RoomManager {
  private readonly instances = new Map<string, GameInstance>();
  private readonly modules = new Map<EchoVcActivityKey, GameModule>();

  constructor(
    modules: readonly GameModule[],
    private readonly emitterFactory: EmitterFactory,
    private readonly onInstanceCountChange?: InstanceCountListener,
  ) {
    for (const m of modules) this.modules.set(m.key, m);
  }

  hasGame(key: string): key is EchoVcActivityKey {
    return this.modules.has(key as EchoVcActivityKey);
  }

  join(
    roomId: string,
    gameKey: EchoVcActivityKey,
    userId: string,
    now: number,
  ): GameErrorReason | null {
    const module = this.modules.get(gameKey);
    if (!module) return 'unknown_game';
    let inst = this.instances.get(roomId);
    if (inst && inst.gameKey !== gameKey) return 'room_mismatch';
    if (!inst) {
      inst = new GameInstance(module, roomId, this.emitterFactory(roomId), now);
      this.instances.set(roomId, inst);
      this.onInstanceCountChange?.(gameKey, 1);
    }
    inst.join(userId, now);
    return null;
  }

  leave(roomId: string, userId: string, now: number): void {
    this.instances.get(roomId)?.leave(userId, now);
  }

  dispatch(
    roomId: string,
    userId: string,
    type: string,
    payload: unknown,
    now: number,
  ): GameErrorReason | null {
    const inst = this.instances.get(roomId);
    if (!inst) return 'not_in_room';
    return inst.dispatch(userId, type, payload, now);
  }

  tickAll(now: number): void {
    for (const inst of this.instances.values()) {
      if (inst.tickHz > 0) inst.runTick(now);
    }
  }

  sweepIdle(now: number, idleMs: number): void {
    for (const [roomId, inst] of this.instances) {
      if (inst.isEmpty() && now - inst.idleSince() > idleMs) {
        this.instances.delete(roomId);
        this.onInstanceCountChange?.(inst.gameKey, -1);
      }
    }
  }

  get size(): number {
    return this.instances.size;
  }
}
