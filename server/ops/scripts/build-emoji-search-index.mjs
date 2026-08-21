/**
 * Builds emoji search index at build time.
 * Output: clients/web/public/emoji-search-index.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveEmojiDataByGroupPath } from './lib/resolve-emoji-data-path.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const emojiDataPath = resolveEmojiDataByGroupPath();
const outputPath = path.resolve(
  __dirname,
  '../../../clients/web/public/emoji-search-index.json',
);
const secondaryAliasesPath = path.resolve(
  __dirname,
  '../../../clients/web/src/features/chat/emoji/emoji-secondary-aliases.json',
);

function tokenize(text) {
  const lower = text.toLowerCase();
  const words = lower.split(/[\s_-]+/).filter(Boolean);
  const slugs = lower.split('_').filter((s) => s.length > 1);
  const combined = new Set();
  for (const w of words) {
    if (w.length >= 2) combined.add(w);
  }
  for (const s of slugs) {
    if (s.length >= 2) combined.add(s);
  }
  return [...combined];
}

const raw = JSON.parse(fs.readFileSync(emojiDataPath, 'utf-8'));
/** @type {Record<string, string[]>} */
let secondaryBySlug = {};
if (fs.existsSync(secondaryAliasesPath)) {
  secondaryBySlug = JSON.parse(fs.readFileSync(secondaryAliasesPath, 'utf-8'));
}

/** @type {Record<string, string[]>} */
const byToken = {};

for (const cat of raw) {
  for (const e of cat.emojis || []) {
    const emoji = e.emoji;
    if (!emoji) continue;
    for (const token of tokenize(e.name || '')) {
      if (!byToken[token]) byToken[token] = [];
      if (!byToken[token].includes(emoji)) byToken[token].push(emoji);
    }
    for (const token of tokenize(e.slug || '')) {
      if (!byToken[token]) byToken[token] = [];
      if (!byToken[token].includes(emoji)) byToken[token].push(emoji);
    }
    const slug = e.slug || '';
    const extra = secondaryBySlug[slug];
    if (Array.isArray(extra)) {
      for (const phrase of extra) {
        for (const token of tokenize(String(phrase))) {
          if (!byToken[token]) byToken[token] = [];
          if (!byToken[token].includes(emoji)) byToken[token].push(emoji);
        }
      }
    }
  }
}

const dir = path.dirname(outputPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({ byToken }), 'utf-8');
console.log('Built emoji-search-index.json');
