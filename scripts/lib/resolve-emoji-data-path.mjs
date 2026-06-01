import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

export function resolveEmojiDataByGroupPath() {
  for (const rel of [
    '../../node_modules/unicode-emoji-json/data-by-group.json',
    '../../frontend/node_modules/unicode-emoji-json/data-by-group.json',
  ]) {
    const candidate = path.resolve(scriptsDir, rel);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    'unicode-emoji-json/data-by-group.json not found; run npm install',
  );
}
