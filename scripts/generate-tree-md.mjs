/**
 * Regenerates docs/overview/tree.md — run from repo root: node scripts/generate-tree-md.mjs
 *
 * Static asset trees are omitted entirely from the detailed tree (no line counts from those paths).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SKIP = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-ssr',
  'coverage',
  '.turbo',
]);

/** Relative POSIX paths/prefixes skipped from detailed tree and totals. */
const SKIP_REL_PREFIXES = [
  'backend/.diagnostics',
  'backend/data/echo-local-uploads',
  'bot/exports',
];

/** Generated file should not count itself in totals. */
const SKIP_REL_FILES = new Set(['docs/overview/tree.md', 'package-lock.json']);

/** Binary files are omitted from line totals for cleaner signal. */
const BINARY_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.mp4',
  '.mp3',
  '.wav',
  '.ogg',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.zip',
  '.gz',
  '.7z',
  '.pdf',
  '.bin',
  '.wasm',
]);

/** Relative POSIX path from repo root — subtree/file skipped in walk and line totals. */
function shouldSkipRel(rel) {
  if (!rel) return false;
  if (SKIP_REL_FILES.has(rel)) return true;
  if (
    SKIP_REL_PREFIXES.some(
      (prefix) => rel === prefix || rel.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }
  if (
    rel === 'frontend/public/twemoji' ||
    rel.startsWith('frontend/public/twemoji/')
  ) {
    return true;
  }
  // Any path segment named exactly `assets` (frontend/src/assets, bot export bundles, …)
  return rel.split('/').includes('assets');
}

function countLines(p) {
  try {
    const rel = relPosix(p);
    if (shouldSkipRel(rel)) return 0;
    const ext = path.extname(p).toLowerCase();
    if (BINARY_EXTS.has(ext)) return 0;
    const src = fs.readFileSync(p, 'utf8');
    const lines = src.split('\n');
    const hashCommentExts = new Set([
      '.sh',
      '.bash',
      '.zsh',
      '.py',
      '.yaml',
      '.yml',
      '.toml',
      '.ini',
      '.env',
      '.conf',
      '.properties',
      '.dockerfile',
      '.rb',
      '.pl',
      '.ps1',
      '.r',
      '.cmake',
      '.gitignore',
      '.gitattributes',
    ]);
    const slashCommentExts = new Set([
      '.js',
      '.mjs',
      '.cjs',
      '.ts',
      '.tsx',
      '.jsx',
      '.java',
      '.c',
      '.cc',
      '.cpp',
      '.cs',
      '.go',
      '.rs',
      '.swift',
      '.kt',
      '.scss',
      '.css',
      '.vue',
      '.php',
    ]);
    const htmlCommentExts = new Set(['.html', '.xml', '.svg']);
    const isDockerfile = path.basename(p).toLowerCase() === 'dockerfile';
    const useHashComments = hashCommentExts.has(ext) || isDockerfile;
    const useSlashComments = slashCommentExts.has(ext);
    const useHtmlComments = htmlCommentExts.has(ext);
    let inBlock = false;
    let inHtmlBlock = false;
    let count = 0;
    for (const line of lines) {
      const t = line.trim();
      if (!t) {
        count += 1;
        continue;
      }
      if (useHtmlComments) {
        if (inHtmlBlock) {
          if (t.includes('-->')) inHtmlBlock = false;
          continue;
        }
        if (t.startsWith('<!--')) {
          if (!t.includes('-->')) inHtmlBlock = true;
          continue;
        }
      }
      if (useSlashComments) {
        if (inBlock) {
          if (t.includes('*/')) inBlock = false;
          continue;
        }
        if (t.startsWith('/*')) {
          if (!t.includes('*/')) inBlock = true;
          continue;
        }
        if (t.startsWith('//')) continue;
      }
      if (useHashComments && t.startsWith('#')) continue;
      count += 1;
    }
    return count;
  } catch {
    return 0;
  }
}

const cache = new Map();
function subtreeLines(dir) {
  const rel = relPosix(dir);
  if (shouldSkipRel(rel)) return 0;
  let n = 0;
  let ent;
  try {
    ent = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of ent) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    const r = relPosix(p);
    if (shouldSkipRel(r)) continue;
    if (e.isDirectory()) n += subtreeLines(p);
    else n += countLines(p);
  }
  return n;
}

function linesFor(p) {
  if (cache.has(p)) return cache.get(p);
  let v;
  try {
    const st = fs.statSync(p);
    v = st.isDirectory() ? subtreeLines(p) : countLines(p);
  } catch {
    v = 0;
  }
  cache.set(p, v);
  return v;
}

function relPosix(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).join('/');
}

function listDir(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(
      (e) =>
        !SKIP.has(e.name) && !(e.name.startsWith('.') && e.name !== '.github'),
    )
    .filter((e) => {
      const p = path.join(dir, e.name);
      return !shouldSkipRel(relPosix(p));
    })
    .sort((a, b) => {
      const ad = a.isDirectory();
      const bd = b.isDirectory();
      if (ad !== bd) return ad ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
}

function collectTopFiles(limit = 6) {
  const files = [];
  function walkFiles(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      if (e.name.startsWith('.') && e.name !== '.github') continue;
      const p = path.join(dir, e.name);
      const rel = relPosix(p);
      if (shouldSkipRel(rel)) continue;
      if (e.isDirectory()) {
        walkFiles(p);
        continue;
      }
      if (!e.isFile() || e.name === '.env') continue;
      const lines = countLines(p);
      if (lines <= 0) continue;
      files.push({ rel, lines });
    }
  }
  walkFiles(ROOT);
  files.sort((a, b) => {
    if (b.lines !== a.lines) return b.lines - a.lines;
    return a.rel.localeCompare(b.rel, undefined, { sensitivity: 'base' });
  });
  return files.slice(0, limit);
}

function walk(dir, depth, maxDepth, prefix, out) {
  const entries = listDir(dir);
  const dirs = entries
    .filter((e) => e.isDirectory())
    .filter((e) => linesFor(path.join(dir, e.name)) > 0);
  const files = entries
    .filter((e) => e.isFile())
    .filter((e) => e.name !== '.env')
    .filter((e) => countLines(path.join(dir, e.name)) > 0);
  const all = [...dirs, ...files];
  all.forEach((e, i) => {
    const isLast = i === all.length - 1;
    const p = path.join(dir, e.name);
    if (shouldSkipRel(relPosix(p))) return;
    const branch = isLast ? '`-- ' : '|-- ';
    const nextPrefix = prefix + (isLast ? '    ' : '|   ');
    if (e.isDirectory()) {
      const L = linesFor(p);
      out.push(`${prefix}${branch}${e.name}/ [${L}]`);
      if (depth + 1 < maxDepth) walk(p, depth + 1, maxDepth, nextPrefix, out);
    } else {
      out.push(`${prefix}${branch}${e.name} [${countLines(p)}]`);
    }
  });
}

const maxDepth = 8;
const out = [];
const topFiles = collectTopFiles(6);

out.push('echo/ (overview generated)');
out.push('');
out.push('Top 6 biggest files (counted lines)');
for (const f of topFiles) {
  out.push(`- ${f.rel} [${f.lines}]`);
}
out.push('');
out.push('|-- backend/ (Node API + Echo domain)');
out.push('|   |-- src/');
out.push('|   |   |-- api/ (routes, Fastify plugins)');
out.push('|   |   |-- auth/');
out.push('|   |   |-- bootstrap/');
out.push('|   |   |-- db/');
out.push('|   |   |-- domain/ (Echo store, RBAC, unfurl, …)');
out.push('|   |   |-- observability/');
out.push('|   |   |-- scripts/ (migrations, one-offs)');
out.push('|   |   |-- services/');
out.push('|   |   |-- sockets/');
out.push('|   `-- tests/');
out.push('|   |-- package.json');
out.push('|   `-- tsconfig.json');
out.push('|-- bot/ (Discord export / tooling)');
out.push('|   |-- src/');
out.push('|   `-- package.json');
out.push('|-- docs/ (architecture, runbooks, rbac, adr, …)');
out.push('|-- frontend/ (Vite + Vue)');
out.push('|   |-- public/');
out.push('|   |-- src/');
out.push('|   |   |-- api/');
out.push(
  '|   |   |-- assets/ (static icons & images — omitted from detail tree below)',
);
out.push('|   |   |-- components/ (chat/, AppLayout, modals, …)');
out.push('|   |   |-- composables/');
out.push('|   |   |-- domain/');
out.push('|   |   |-- echoMode, platform, features/');
out.push('|   |   |-- stores/');
out.push('|   `-- entry (main.ts, App.vue)');
out.push('|   |-- package.json');
out.push('|   `-- tsconfig, vite.config');
out.push('|-- shared/ (types, bridges, video embed ids)');
out.push('|-- scripts/ (repo tooling)');
out.push('|-- .github/ (workflows)');
out.push('|-- package.json');
out.push('');
out.push('Notes');
out.push(
  '- Concise overview above; detailed tree below lists files with [line counts] per file and cumulative counts per directory.',
);
out.push(
  '- Excludes: node_modules, .git, dist, coverage; skips dotfiles except `.github`.',
);
out.push(
  '- **Omitted from the detailed tree (ignored assets):** any directory segment named `assets/` (e.g. `frontend/src/assets/`, `bot/exports/.../assets/`) and `frontend/public/twemoji/` — line totals exclude these paths.',
);
out.push(
  '- Line counts exclude comment-only lines for common source/config formats (`//`, `/* */`, `#`, `<!-- -->` by extension).',
);
out.push(
  '- Additional generated/runtime noise is omitted (`backend/.diagnostics/`, `backend/data/echo-local-uploads/`, `bot/exports/`), and files with 0 counted lines are hidden from the detailed tree.',
);
out.push(`- Regenerated: ${new Date().toISOString().slice(0, 10)}`);
out.push('');
out.push(`echo/ [${linesFor(ROOT)}]`);
walk(ROOT, 0, maxDepth, '', out);

const dest = path.join(ROOT, 'docs', 'overview', 'tree.md');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, `${out.join('\n')}\n`, 'utf8');
console.error('Wrote', dest, 'lines:', out.length);
