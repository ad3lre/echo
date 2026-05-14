#!/usr/bin/env node
/**
 * Prints a safe rollout and migration plan for the RBAC full-matrix migration.
 * This script is informational only and performs no destructive actions.
 *
 * Run: node scripts/print-rollout-plan.mjs
 */
console.log('RBAC Full-Matrix Rollout Plan');
console.log(
  '1) Deploy backend changes (POST /roles, extended ECHO_PERMISSIONS, capability flags).',
);
console.log('   - Ensure backend has been smoke-tested in staging.');
console.log(
  '2) Run optional migration (convert mock role permission keys to real ECHO permissions).',
);
console.log(
  '   - Migration should be idempotent and tested on staging DB backups.',
);
console.log('   - Example migration steps:');
console.log(
  '     a) SELECT id, permissions FROM echo_roles WHERE server_id = $1;',
);
console.log(
  '     b) Map old mock keys to new formal keys (using shared/rolePermissionBridge.ts mapping).',
);
console.log(
  '     c) UPDATE echo_roles SET permissions = $1::jsonb WHERE id = $2;',
);
console.log(
  '3) Deploy frontend changes that call POST /roles and persist full permission matrix.',
);
console.log(
  '4) Feature rollout: server-by-server gating where desired, or enable globally.',
);
console.log('');
console.log('Notes:');
console.log(
  '- Prefer backend-first deployment to avoid frontend creating roles that backend cannot persist.',
);
console.log(
  '- Keep PATCH /roles backward-compatible (existing clients still able to PATCH arrays of known strings).',
);
console.log(
  '- Run a migration on staging and verify role editor displays expected permission states.',
);
console.log('');
console.log(
  'This script is informational and intentionally makes no DB/network requests.',
);
