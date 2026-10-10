import { resolve } from 'node:path';
import { runFullExport as exportGuild } from './runFullExport.js';

const exportsInFlight = new Map<string, Promise<unknown>>();

/** Concurrent requests for the same output share one complete export. */
export function serializeGuildExport<T>(
  key: string,
  work: () => Promise<T>,
): Promise<T> {
  const active = exportsInFlight.get(key);
  if (active) return active as Promise<T>;
  const pending = Promise.resolve()
    .then(work)
    .finally(() => {
      if (exportsInFlight.get(key) === pending) exportsInFlight.delete(key);
    });
  exportsInFlight.set(key, pending);
  return pending;
}

export function runFullExport(...args: Parameters<typeof exportGuild>) {
  const [, guild, flags] = args;
  return serializeGuildExport(`${resolve(flags.outDir)}:${guild.id}`, () =>
    exportGuild(...args),
  );
}
