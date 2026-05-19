import * as fs from 'fs/promises';

function normalizeSha256Line(s: string): string | null {
  const t = s.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(t)) return null;
  return t;
}

/**
 * Newline-separated SHA-256 hex list (one per line, `#` starts comments).
 * Intended for integration tests and optional auxiliary lists — not a substitute for licensed perceptual-hash feeds.
 */
export class Sha256BlocklistStore {
  private entries = new Set<string>();
  private lastFileMtimeMs = -1;
  private lastReadWallClockMs = 0;

  constructor(
    private readonly path: string | null,
    private readonly periodicReloadMs: number,
  ) {}

  async refreshIfNeeded(): Promise<void> {
    if (!this.path) return;
    const now = Date.now();
    const periodicDue =
      this.periodicReloadMs > 0 &&
      now - this.lastReadWallClockMs >= this.periodicReloadMs;
    try {
      const st = await fs.stat(this.path);
      const mtimeChanged = st.mtimeMs !== this.lastFileMtimeMs;
      const needsRead = this.lastFileMtimeMs < 0 || mtimeChanged || periodicDue;
      if (!needsRead) return;

      const raw = await fs.readFile(this.path, 'utf8');
      const next = new Set<string>();
      for (const line of raw.split(/\r?\n/)) {
        const u = line.split('#')[0]?.trim() ?? '';
        if (!u) continue;
        const h = normalizeSha256Line(u);
        if (h) next.add(h);
      }
      this.entries = next;
      this.lastFileMtimeMs = st.mtimeMs;
      this.lastReadWallClockMs = now;
    } catch {
      /* keep previous snapshot on transient read errors */
    }
  }

  has(hexLower: string): boolean {
    return this.entries.has(hexLower.trim().toLowerCase());
  }
}
