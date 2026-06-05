#!/usr/bin/env node
/**
 * Guard: SQL in backend must not reference unknown table columns.
 *
 * Parses CREATE TABLE / ADD COLUMN from backend/src/db/*Tables.ts, scans SQL template
 * literals in backend/src, and fails on alias.column (or table.column) refs that are
 * not present in the parsed schema. Catches mistakes like auth_users.avatar_url (use pfp).
 *
 * Usage:
 *   node scripts/check-sql-schema-columns.mjs           # static (CI + preverify)
 *   node scripts/check-sql-schema-columns.mjs --live    # also EXPLAIN against DATABASE_URL
 *
 * Env:
 *   VPS_SKIP_SQL_SCHEMA_CHECK=1 — skip entirely (emergency only)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const backendSrc = path.join(repoRoot, 'backend', 'src');
const schemaDir = path.join(backendSrc, 'db');

const SQL_HINT = /\b(SELECT|INSERT|UPDATE|DELETE|FROM|JOIN|RETURNING|WITH)\b/i;
const SKIP_ALIASES = new Set([
  'on',
  'where',
  'set',
  'and',
  'or',
  'left',
  'right',
  'inner',
  'outer',
  'join',
  'lateral',
  'natural',
  'cross',
  'full',
  'select',
  'from',
  'into',
  'values',
  'returning',
  'group',
  'order',
  'having',
  'limit',
  'offset',
  'union',
  'case',
  'when',
  'then',
  'else',
  'end',
  'not',
  'null',
  'true',
  'false',
  'as',
  'by',
  'distinct',
  'all',
  'exists',
  'between',
  'like',
  'in',
  'is',
  'with',
  'do',
  'jsonb',
  'json',
  'array',
  'text',
  'int',
  'bigint',
  'timestamptz',
  'boolean',
  'real',
  'double',
  'precision',
  'varchar',
  'char',
  'serial',
  'uuid',
  'public',
  'pg',
  'information_schema',
  'now',
  'coalesce',
  'nullif',
  'trim',
  'lower',
  'upper',
  'count',
  'sum',
  'min',
  'max',
  'avg',
  'any',
  'every',
  'extract',
  'date',
  'interval',
  'to_timestamp',
  'greatest',
  'least',
  'row_number',
  'rank',
  'dense_rank',
  'over',
  'partition',
  'window',
  'filter',
  'within',
  'lateral',
]);

function mergeTableColumns(tables, table, cols) {
  const key = table.toLowerCase();
  const prev = tables.get(key) ?? new Set();
  for (const c of cols) prev.add(c.toLowerCase());
  tables.set(key, prev);
}

function parseSchemasFromFile(filePath) {
  const tables = new Map();
  const content = fs.readFileSync(filePath, 'utf8');

  const createRe =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\);/gi;
  let m;
  while ((m = createRe.exec(content))) {
    const table = m[1];
    const body = m[2];
    const cols = new Set();
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('--')) continue;
      if (
        /^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|REFERENCES|EXCLUDE)\b/i.test(
          trimmed,
        )
      ) {
        continue;
      }
      const col = trimmed.match(/^(\w+)\s+/);
      if (col) cols.add(col[1]);
    }
    mergeTableColumns(tables, table, cols);
  }

  const alterRe =
    /ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+(\w+)/gi;
  while ((m = alterRe.exec(content))) {
    mergeTableColumns(tables, m[1], [m[2]]);
  }

  return tables;
}

function loadAllSchemas() {
  const tables = new Map();
  if (!fs.existsSync(schemaDir)) return tables;
  for (const ent of fs.readdirSync(schemaDir, { withFileTypes: true })) {
    if (!ent.isFile() || !ent.name.endsWith('Tables.ts')) continue;
    const fileTables = parseSchemasFromFile(path.join(schemaDir, ent.name));
    for (const [table, cols] of fileTables) {
      mergeTableColumns(tables, table, cols);
    }
  }
  return tables;
}

function walkTsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules') continue;
      out.push(...walkTsFiles(p));
    } else if (ent.isFile() && ent.name.endsWith('.ts')) {
      out.push(p);
    }
  }
  return out;
}

function extractBacktickStrings(content) {
  const out = [];
  let i = 0;
  while (i < content.length) {
    if (content[i] !== '`') {
      i++;
      continue;
    }
    i++;
    let s = '';
    while (i < content.length) {
      const ch = content[i];
      if (ch === '\\') {
        if (i + 1 < content.length) s += content[i + 1];
        i += 2;
        continue;
      }
      if (ch === '$' && content[i + 1] === '{') {
        let depth = 0;
        i += 2;
        while (i < content.length) {
          if (content[i] === '{') depth++;
          else if (content[i] === '}') {
            if (depth === 0) {
              i++;
              break;
            }
            depth--;
          }
          i++;
        }
        s += '$?';
        continue;
      }
      if (ch === '`') {
        i++;
        out.push(s);
        break;
      }
      s += ch;
      i++;
    }
  }
  return out;
}

function buildAliasMap(sql) {
  const map = new Map();
  const re =
    /\b(?:FROM|(?:LEFT|RIGHT|INNER|FULL|CROSS)?\s*JOIN)\s+([a-z_][a-z0-9_]*)\s*(?:AS\s+)?([a-z_][a-z0-9_]*)?/gi;
  let m;
  while ((m = re.exec(sql))) {
    const table = m[1].toLowerCase();
    let alias = (m[2] ?? '').toLowerCase();
    if (!alias || SKIP_ALIASES.has(alias)) {
      alias = table;
    }
    map.set(alias, table);
  }
  return map;
}

function qualifiedColumnRefs(sql) {
  const refs = [];
  const re = /\b([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)\b/gi;
  let m;
  while ((m = re.exec(sql))) {
    refs.push({
      alias: m[1].toLowerCase(),
      column: m[2].toLowerCase(),
      index: m.index,
    });
  }
  return refs;
}

function resolveTableName(alias, aliasMap, schemas) {
  if (aliasMap.has(alias)) return aliasMap.get(alias);
  if (schemas.has(alias)) return alias;
  return null;
}

function dummyParamForPlaceholder(sql, index) {
  const re = new RegExp(`\\$${index}(?:::(\\w+))?`, 'g');
  let cast = '';
  for (const m of sql.matchAll(re)) {
    if (m[1]) cast = m[1].toLowerCase();
  }
  if (
    cast.includes('int') ||
    cast === 'numeric' ||
    cast === 'float' ||
    cast === 'real' ||
    cast === 'double'
  ) {
    return 1;
  }
  if (cast === 'bool' || cast === 'boolean') return false;
  if (cast === 'json' || cast === 'jsonb') return '{}';
  if (cast === 'uuid') return '00000000-0000-0000-0000-000000000000';
  if (cast === 'inet') return '127.0.0.1';
  if (cast.includes('timestamp') || cast === 'date') {
    return '1970-01-01T00:00:00.000Z';
  }
  return '0';
}

function dummyParamsForSql(sql) {
  const nums = (sql.match(/\$\d+/g) ?? []).map((p) => Number(p.slice(1)));
  const max = nums.length ? Math.max(...nums) : 0;
  const params = [];
  for (let i = 1; i <= max; i++) params.push(dummyParamForPlaceholder(sql, i));
  return params;
}

function isSchemaMismatchPgError(err) {
  const code =
    err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
  return code === '42703' || code === '42P01';
}

function isExplainableSql(sql) {
  const t = sql.trim();
  if (!SQL_HINT.test(t)) return false;
  if (/^\s*CREATE\s+/i.test(t)) return false;
  if (/^\s*ALTER\s+/i.test(t)) return false;
  if (/^\s*DROP\s+/i.test(t)) return false;
  if (/\$\?/.test(sql)) return false;
  return true;
}

function scanFile(filePath, schemas) {
  const rel = path.relative(repoRoot, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const violations = [];
  const liveQueries = [];

  for (const sql of extractBacktickStrings(content)) {
    if (!SQL_HINT.test(sql)) continue;
    if (isExplainableSql(sql)) liveQueries.push(sql);

    const aliasMap = buildAliasMap(sql);
    for (const { alias, column } of qualifiedColumnRefs(sql)) {
      if (SKIP_ALIASES.has(alias)) continue;
      const table = resolveTableName(alias, aliasMap, schemas);
      if (!table) continue;
      const cols = schemas.get(table);
      if (!cols) continue;
      if (!cols.has(column)) {
        violations.push({
          file: rel,
          table,
          alias,
          column,
        });
      }
    }
  }

  return { violations, liveQueries };
}

async function runLiveExplain(liveQueries) {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.warn(
      '[check:sql-schema-columns] --live skipped (DATABASE_URL not set)',
    );
    return [];
  }

  let pg;
  try {
    pg = await import('pg');
  } catch {
    console.warn(
      '[check:sql-schema-columns] --live skipped (pg module unavailable)',
    );
    return [];
  }

  const pool = new pg.default.Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 10_000,
  });

  const failures = [];
  const seen = new Set();

  try {
    for (const sql of liveQueries) {
      const key = sql.trim();
      if (seen.has(key)) continue;
      seen.add(key);

      const params = dummyParamsForSql(sql);
      try {
        await pool.query(`EXPLAIN ${sql}`, params);
      } catch (e) {
        if (!isSchemaMismatchPgError(e)) continue;
        const msg = e instanceof Error ? e.message : String(e);
        failures.push({ sql: key.slice(0, 240), error: msg });
      }
    }
  } finally {
    await pool.end().catch(() => {});
  }

  return failures;
}

async function main() {
  if (process.env.VPS_SKIP_SQL_SCHEMA_CHECK === '1') {
    console.warn(
      '[check:sql-schema-columns] skipped (VPS_SKIP_SQL_SCHEMA_CHECK=1)',
    );
    return;
  }

  const live = process.argv.includes('--live');
  const schemas = loadAllSchemas();
  if (!schemas.size) {
    console.error(
      '[check:sql-schema-columns] no schemas parsed from db/*Tables.ts',
    );
    process.exit(1);
  }

  const scanRoots = [
    path.join(backendSrc, 'domain'),
    path.join(backendSrc, 'auth'),
    path.join(backendSrc, 'services'),
    path.join(backendSrc, 'api'),
    path.join(backendSrc, 'scripts'),
  ];

  const violations = [];
  const liveQueries = [];

  for (const root of scanRoots) {
    for (const file of walkTsFiles(root)) {
      if (file.includes(`${path.sep}tests${path.sep}`)) continue;
      const result = scanFile(file, schemas);
      violations.push(...result.violations);
      liveQueries.push(...result.liveQueries);
    }
  }

  if (violations.length) {
    console.error(
      '[check:sql-schema-columns] unknown column references (static schema check):\n',
    );
    for (const v of violations) {
      console.error(
        `  ${v.file}: ${v.alias}.${v.column} — table "${v.table}" has no column "${v.column}"`,
      );
    }
    process.exit(1);
  }

  if (live) {
    const failures = await runLiveExplain(liveQueries);
    if (failures.length) {
      console.error(
        '[check:sql-schema-columns] PostgreSQL EXPLAIN failures:\n',
      );
      for (const f of failures) {
        console.error(`  SQL: ${f.sql}${f.sql.length >= 240 ? '…' : ''}`);
        console.error(`  ${f.error}\n`);
      }
      process.exit(1);
    }
    console.log(
      `[check:sql-schema-columns] ok (static + live EXPLAIN on ${new Set(liveQueries.map((q) => q.trim())).size} queries)`,
    );
    return;
  }

  console.log(
    `[check:sql-schema-columns] ok (${schemas.size} tables, static scan)`,
  );
}

main().catch((e) => {
  console.error('[check:sql-schema-columns] fatal:', e);
  process.exit(1);
});
