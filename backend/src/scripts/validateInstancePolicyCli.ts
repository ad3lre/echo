import * as path from 'path';
import {
  loadInstancePolicy,
  resolveDefaultInstancePolicyPath,
} from '../config/instancePolicy/loadInstancePolicy';

const filePath = resolveDefaultInstancePolicyPath();
try {
  loadInstancePolicy({ filePath });
  console.error(`Instance policy OK: ${path.resolve(filePath)}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
