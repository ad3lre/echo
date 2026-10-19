#!/usr/bin/env bun
/**
 * Validate locale catalogs:
 * - en-GB keys must exist in en-US (partial en-GB is OK)
 * - pt-BR and de must have full key parity with en-US
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const enUsDir = path.join(repoRoot, 'clients/web/src/i18n/locales/en-US');
const ptBrDir = path.join(repoRoot, 'clients/web/src/i18n/locales/pt-BR');
const deDir = path.join(repoRoot, 'clients/web/src/i18n/locales/de');
const enGbPath = path.join(repoRoot, 'clients/web/src/i18n/locales/en-GB.json');

function flattenKeys(obj, prefix = '') {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, next));
    } else {
      keys.push(next);
    }
  }
  return keys;
}

function loadMergedLocaleDir(dir) {
  const merged = {};
  if (!fs.existsSync(dir)) return merged;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const ns = file.replace(/\.json$/, '');
    merged[ns] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  return merged;
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const enUs = loadMergedLocaleDir(enUsDir);
const enUsKeys = new Set(flattenKeys(enUs));
const enGb = loadJson(enGbPath);
const enGbKeys = [...flattenKeys(enGb)];

const unknownInGb = enGbKeys.filter((k) => !enUsKeys.has(k));

if (unknownInGb.length) {
  console.error('[i18n:check] FAILED — en-GB has keys not in en-US:');
  for (const k of unknownInGb) console.error(`  ${k}`);
  process.exit(1);
}

for (const [label, dir] of [
  ['pt-BR', ptBrDir],
  ['de', deDir],
]) {
  const keys = new Set(flattenKeys(loadMergedLocaleDir(dir)));
  const missing = [...enUsKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !enUsKeys.has(k));
  if (missing.length || extra.length) {
    console.error(`[i18n:check] FAILED — ${label} must match en-US key set:`);
    for (const k of missing) console.error(`  missing: ${k}`);
    for (const k of extra) console.error(`  extra: ${k}`);
    process.exit(1);
  }
}

console.log(
  `[i18n:check] OK — ${enUsKeys.size} en-US keys; en-GB defines ${enGbKeys.length} override(s); pt-BR and de parity ok`,
);
