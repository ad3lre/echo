/**
 * Full Echo icon set: every `.svg` under `assets/icons/` (Vite glob at build time).
 * Lazy `eager: false` keeps hashed SVG URLs out of the main chunk until `ensureIconCatalogLoaded()`.
 */

const modules = import.meta.glob('./icons/**/*.svg', {
  eager: false,
  query: '?url',
  import: 'default',
}) as Record<string, () => Promise<string>>;

let urlByFileName: Map<string, string> | null = null;
let loadPromise: Promise<void> | null = null;
const LOAD_CHUNK = 60;

/** Yield to main thread between batches so long-running loads stay cooperative. */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof MessageChannel !== 'undefined') {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = () => resolve();
      port2.postMessage(undefined);
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/** Loads all icon module URLs in cooperative chunks; safe to call multiple times. */
export async function ensureIconCatalogLoaded(): Promise<void> {
  if (urlByFileName && urlByFileName.size > 0) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const map = new Map<string, string>();
    const entries = Object.entries(modules);
    for (let i = 0; i < entries.length; i += LOAD_CHUNK) {
      const batch = entries.slice(i, i + LOAD_CHUNK);
      await Promise.all(
        batch.map(async ([path, loader]) => {
          const url = await loader();
          const name = path.split('/').pop();
          if (name) map.set(name, url);
        }),
      );
      if (i + LOAD_CHUNK < entries.length) await yieldToMain();
    }
    urlByFileName = map;
  })();
  return loadPromise;
}

/** Whether the full catalog has been loaded into memory. */
export function isCatalogLoaded(): boolean {
  return urlByFileName !== null && urlByFileName.size > 0;
}

/** Resolve by exact filename, e.g. `message.svg`, `volume up.svg` */
export function getIconUrlByFilename(filename: string): string | undefined {
  return urlByFileName?.get(filename);
}

export interface IconCatalogEntry {
  /** Stable id: exact filename under `icons/` (e.g. `volume up.svg`) */
  id: string;
  url: string;
  /** Search / display label */
  label: string;
}

let cachedEntries: IconCatalogEntry[] | null = null;

function filenameToLabel(name: string): string {
  return name.replace(/\.svg$/i, '').trim();
}

/** True for names like `chat-32.svg` or `user avatar-12.svg` (ambiguous without preview). */
export function isNumberedVariantIconFilename(filename: string): boolean {
  return /-\d+\.svg$/i.test(filename);
}

export function getAllIconCatalogEntries(): IconCatalogEntry[] {
  if (!urlByFileName?.size) return [];
  if (cachedEntries) return cachedEntries;
  const list: IconCatalogEntry[] = [];
  for (const [fileName, url] of urlByFileName.entries()) {
    const base = filenameToLabel(fileName);
    list.push({
      id: fileName,
      url,
      label: base,
    });
  }
  cachedEntries = list;
  return cachedEntries;
}
