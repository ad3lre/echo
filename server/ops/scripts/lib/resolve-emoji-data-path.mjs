import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const libDir = path.dirname(fileURLToPath(import.meta.url));

export function resolveEmojiDataByGroupPath() {
  // server/ops/scripts/lib → repo root is ../../../../
  for (const rel of [
    '../../../../node_modules/unicode-emoji-json/data-by-group.json',
    '../../../../clients/web/node_modules/unicode-emoji-json/data-by-group.json',
  ]) {
    const candidate = path.resolve(libDir, rel);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    'unicode-emoji-json/data-by-group.json not found; run npm install',
  );
}
