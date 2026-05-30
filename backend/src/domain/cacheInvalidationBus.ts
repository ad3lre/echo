/**
 * Cross-instance cache invalidation bus.
 *
 * In-process caches (permission merges, channel→server map, …) live in a per-process
 * `Map`. On a multi-instance deployment that means an invalidation triggered on node A
 * leaves node B serving stale data until its TTL lapses. This bus closes that gap: when a
 * cache is invalidated locally, the originating node also publishes a small message over
 * Redis pub/sub; every other node receives it and applies the *same* invalidation to its
 * own local cache.
 *
 * **Topology:** one dedicated subscriber connection + one publisher connection (ioredis
 * forbids regular commands on a connection in subscribe mode). When no `redisUrl` is
 * configured (local dev / single instance) the bus degrades to a no-op for remote
 * delivery — local invalidation at the call site still happens, so correctness on a single
 * node is unaffected.
 *
 * **Loop safety:** each process stamps messages with a random `origin` id and ignores its
 * own. Remote handlers must apply *local-only* invalidation (never re-publish), or two
 * nodes would ping-pong forever.
 */
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { echoIoredisClientOptions } from '../constants/ioredisEchoClient';
import { config } from '../config';

const CHANNEL = 'echo:cache:invalidate';
const ORIGIN = randomUUID();

export type CacheInvalidationMessage = {
  /** Namespace of the cache to invalidate, e.g. `perm:server`, `channel:delete`. */
  kind: string;
  serverId?: string;
  userId?: string;
  channelId?: string;
};

type Handler = (msg: CacheInvalidationMessage) => void;

const handlers = new Map<string, Handler>();

let publisher: Redis | null = null;
let subscriber: Redis | null = null;
let subscribed = false;

function getPublisher(): Redis | null {
  if (!config.redisUrl?.trim()) return null;
  if (!publisher) {
    publisher = new Redis(config.redisUrl.trim(), echoIoredisClientOptions);
    publisher.on('error', () => {});
  }
  return publisher;
}

/**
 * Register the local-only handler for a cache namespace. Invoked when *another* node
 * broadcasts an invalidation. The handler MUST NOT re-publish (it should call the cache's
 * local-only invalidator), otherwise nodes would echo messages indefinitely.
 */
export function registerCacheInvalidationHandler(
  kind: string,
  handler: Handler,
): void {
  handlers.set(kind, handler);
}

function dispatchLocal(msg: CacheInvalidationMessage): void {
  const handler = handlers.get(msg.kind);
  if (handler) handler(msg);
}

/**
 * Broadcast an invalidation to all *other* nodes. The caller is expected to have already
 * applied the invalidation to its own local cache (local-first keeps the originating node
 * correct even when Redis is down or absent).
 */
export function publishCacheInvalidation(msg: CacheInvalidationMessage): void {
  const redis = getPublisher();
  if (!redis) return;
  try {
    void redis.publish(CHANNEL, JSON.stringify({ ...msg, origin: ORIGIN }));
  } catch {
    // Best effort: a dropped invalidation degrades to TTL-bounded staleness, not corruption.
  }
}

/**
 * Start listening for invalidation broadcasts. Idempotent. Call once during bootstrap.
 * Safe to call when no Redis is configured (no-op).
 */
export function initCacheInvalidationBus(): void {
  if (subscribed) return;
  if (!config.redisUrl?.trim()) return;
  subscribed = true;
  subscriber = new Redis(config.redisUrl.trim(), echoIoredisClientOptions);
  subscriber.on('error', () => {});
  subscriber.on('message', (channel, raw) => {
    if (channel !== CHANNEL) return;
    let msg: (CacheInvalidationMessage & { origin?: string }) | null = null;
    try {
      msg = JSON.parse(raw) as CacheInvalidationMessage & { origin?: string };
    } catch {
      return;
    }
    if (!msg || msg.origin === ORIGIN || typeof msg.kind !== 'string') return;
    dispatchLocal(msg);
  });
  void subscriber.subscribe(CHANNEL).catch(() => {});
}
