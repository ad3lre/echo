/** Serialize each guild's deliveries and retry failures without losing pending events. */
export function createVoiceSnapshotScheduler<T>(
  flush: (client: T, guildId: string) => Promise<void>,
  isWatched: (guildId: string) => boolean,
) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const active = new Set<string>();
  function schedule(client: T, guildId: string, delayMs = 450): void {
    const existing = timers.get(guildId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      timers.delete(guildId);
      if (!isWatched(guildId)) return;
      if (active.has(guildId)) return schedule(client, guildId);
      active.add(guildId);
      try {
        await flush(client, guildId);
      } catch (error) {
        console.warn('[voice-mirror] snapshot failed', error);
        if (!timers.has(guildId)) schedule(client, guildId, 5_000);
      } finally {
        active.delete(guildId);
      }
    }, delayMs);
    timers.set(guildId, timer);
  }
  return schedule;
}
