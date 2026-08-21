import type { RedisOptions } from 'ioredis';

/** Shared ioredis settings — bounded so HTTP handlers outlive proxy timeouts (e.g. CF 524). */
export const echoIoredisClientOptions: RedisOptions = {
  maxRetriesPerRequest: 20,
  connectTimeout: 10_000,
  enableReadyCheck: true,
  lazyConnect: false,
};
