import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
for (const rel of [
  '.env.lan',
  path.join('server', 'ops', 'infra', 'livekit', 'livekit.runtime.yaml'),
]) {
  const p = path.join(root, rel);
  try {
    fs.unlinkSync(p);
    console.log('Removed', rel);
  } catch (e) {
    if (e && e.code === 'ENOENT') continue;
    throw e;
  }
}
console.log(
  'LAN overrides cleared. Run `npm run db:up` to point LiveKit at default livekit.yaml again.',
);
