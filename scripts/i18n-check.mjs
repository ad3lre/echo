#!/usr/bin/env node
/**
 * Validate locale catalogs: en-GB keys must exist in en-US (partial en-GB is OK).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const enUsDir = path.join(repoRoot, 'frontend/src/i18n/locales/en-US');
const enGbPath = path.join(repoRoot, 'frontend/src/i18n/locales/en-GB.json');

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

function loadEnUsMerged() {
  const merged = {};
  for (const file of fs.readdirSync(enUsDir)) {
    if (!file.endsWith('.json')) continue;
    const ns = file.replace(/\.json$/, '');
    merged[ns] = JSON.parse(fs.readFileSync(path.join(enUsDir, file), 'utf8'));
  }
  return merged;
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const enUs = loadEnUsMerged();
const enUsKeys = new Set(flattenKeys(enUs));
const enGb = loadJson(enGbPath);
const enGbKeys = [...flattenKeys(enGb)];

const unknownInGb = enGbKeys.filter((k) => !enUsKeys.has(k));

if (unknownInGb.length) {
  console.error('[i18n:check] FAILED — en-GB has keys not in en-US:');
  for (const k of unknownInGb) console.error(`  ${k}`);
  process.exit(1);
}

console.log(
  `[i18n:check] OK — ${enUsKeys.size} en-US keys; en-GB defines ${enGbKeys.length} override(s)`,
);
