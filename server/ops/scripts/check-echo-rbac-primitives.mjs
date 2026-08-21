/**
 * "No bypass zone" enforcer for RBAC primitives.
 *
 * 1. sortRolesForFold / foldRolePermissions / applyLayerFromPartialObject / aggregateServerRolesToSet
 *    must only be DEFINED in echoPermissionPrimitives.ts.
 *
 * 2. Those symbols must only be IMPORTED from:
 *    - echoPermissionPrimitives.ts (definition)
 *    - echoPermissionEvaluate.ts   (the sole evaluation entry)
 *    - aggregateServerRoles.ts     (thin re-export)
 *    - permissionLayers.ts         (thin re-export of applyLayer)
 *    - test files (src/tests/**)
 *
 *    Any other domain/api file importing them directly is a bypass risk:
 *    performance, trace, and sentinel assumptions can silently break.
 *
 * Run: node server/ops/scripts/check-echo-rbac-primitives.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '../../..');
const backendSrc = path.join(root, 'server', 'backend', 'src');

const GUARDED_SYMBOLS = [
  'sortRolesForFold',
  'foldRolePermissions',
  'applyLayerFromPartialObject',
  'aggregateServerRolesToSet',
  'isWriteValue',
  'expandPermissionTokensToCanonicalSet',
];

const ALLOW_DEFINE = new Set(['echoPermissionPrimitives.ts']);

const ALLOW_IMPORT = new Set([
  'echoPermissionPrimitives.ts',
  'echoPermissionPrimitivesSparse.ts',
  'echoPermissionEvaluate.ts',
  'aggregateServerRoles.ts',
  'permissionLayers.ts',
  'echoPermissionTrace.ts',
  'mergeOverrideRows.ts',
  'permissionOverwriteMerge.ts',
]);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

function isTestFile(filePath) {
  const rel = path.relative(backendSrc, filePath).replace(/\\/g, '/');
  return rel.startsWith('tests/') || rel.startsWith('tests\\');
}

let failed = false;

for (const file of walk(backendSrc)) {
  const base = path.basename(file);
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const text = fs.readFileSync(file, 'utf8');

  for (const sym of GUARDED_SYMBOLS) {
    const defRe = new RegExp(`\\bexport\\s+function\\s+${sym}\\b`);
    if (defRe.test(text) && !ALLOW_DEFINE.has(base)) {
      console.error(`check-echo-rbac: forbidden ${sym} definition in ${rel}`);
      failed = true;
    }

    if (isTestFile(file)) continue;

    const importRe = new RegExp(`\\b${sym}\\b`);
    if (
      importRe.test(text) &&
      !ALLOW_DEFINE.has(base) &&
      !ALLOW_IMPORT.has(base)
    ) {
      console.error(
        `check-echo-rbac: forbidden direct use of ${sym} in ${rel} (must go through evaluatePermissionSet or a sanctioned re-export)`,
      );
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log('check-echo-rbac-primitives: ok');
