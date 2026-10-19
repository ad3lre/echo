#!/usr/bin/env bun
/**
 * Shared Echo product version helpers (MAJOR.MINOR.PATCH).
 * Scheme: major = marketing evolution; minor = self-host breaking; patch = rest.
 * See docs/operations/versioning.md.
 */

/** @typedef {'major' | 'minor' | 'patch'} BumpLevel */
/** @typedef {'compatible' | 'breaking' | 'evolution'} AttestKind */

/** @type {Record<AttestKind, BumpLevel>} */
export const ATTEST_TO_LEVEL = {
  compatible: 'patch',
  breaking: 'minor',
  evolution: 'major',
};

/** @type {Record<BumpLevel, AttestKind>} */
export const LEVEL_TO_ATTEST = {
  patch: 'compatible',
  minor: 'breaking',
  major: 'evolution',
};

export const ATTEST_KINDS = /** @type {const} */ ([
  'compatible',
  'breaking',
  'evolution',
]);

/** Paths that often imply self-host upgrade friction when changed. */
export const VERSION_RISK_PATH_REGEXES = [
  /^server\/backend\/src\/api\/routes\//,
  /^server\/backend\/src\/auth\//,
  /^server\/backend\/src\/db\//,
  /^server\/backend\/src\/config\.ts$/,
  /^server\/backend\/src\/services\/auth\//,
  /^contracts\//,
  /(^|\/)migrations?\//,
  /\.sql$/i,
];

/** Whole-string placeholders only — do not ban real subjects like "Fix …". */
const LAZY_SUMMARY_EXACT =
  /^(bump(\s+version)?|chore(\(version\))?|version(\s+bump)?|release|update|wip|n\/?a|none|test|asdf|fix|ok)$/i;
const LAZY_WHY_EXACT =
  /^(because|needed|required|patch|minor|major|compatible|breaking|evolution|n\/?a|none|ok|fine|lgtm|ship it)$/i;
const VERSIONISH_ONLY = /^v?\d+\.\d+\.\d+$/i;

/**
 * @param {string} raw
 * @returns {{ major: number, minor: number, patch: number }}
 */
export function parseVersion(raw) {
  const s = String(raw ?? '')
    .trim()
    .replace(/^v/i, '');
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (!m) {
    throw new Error(
      `invalid version "${String(raw).trim()}" (expected MAJOR.MINOR.PATCH)`,
    );
  }
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
  };
}

/**
 * @param {{ major: number, minor: number, patch: number }} v
 * @returns {string}
 */
export function formatVersion(v) {
  return `${v.major}.${v.minor}.${v.patch}`;
}

/**
 * @param {{ major: number, minor: number, patch: number }} v
 * @param {BumpLevel} level
 */
export function bumpVersion(v, level) {
  if (level === 'major') {
    return { major: v.major + 1, minor: 0, patch: 0 };
  }
  if (level === 'minor') {
    return { major: v.major, minor: v.minor + 1, patch: 0 };
  }
  if (level === 'patch') {
    return { major: v.major, minor: v.minor, patch: v.patch + 1 };
  }
  throw new Error(`invalid bump level "${level}" (expected major|minor|patch)`);
}

/**
 * True when `to` is exactly one allowed step from `from`.
 * @param {string} fromRaw
 * @param {string} toRaw
 * @returns {{ ok: true, level: BumpLevel } | { ok: false, reason: string }}
 */
export function classifyExactBump(fromRaw, toRaw) {
  let from;
  let to;
  try {
    from = parseVersion(fromRaw);
    to = parseVersion(toRaw);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  if (formatVersion(from) === formatVersion(to)) {
    return { ok: false, reason: 'VERSION unchanged' };
  }

  for (const level of /** @type {const} */ (['patch', 'minor', 'major'])) {
    if (formatVersion(bumpVersion(from, level)) === formatVersion(to)) {
      return { ok: true, level };
    }
  }

  return {
    ok: false,
    reason: `VERSION ${formatVersion(from)} → ${formatVersion(to)} is not exactly one step (patch, minor, or major)`,
  };
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isVersionRiskPath(path) {
  const p = String(path || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
  return VERSION_RISK_PATH_REGEXES.some((re) => re.test(p));
}

/**
 * @param {iterable<string> | string[]} paths
 * @returns {string[]}
 */
export function collectVersionRiskPaths(paths) {
  const hit = [];
  for (const p of paths) {
    if (isVersionRiskPath(p)) hit.push(p);
  }
  return [...new Set(hit)].sort();
}

/**
 * @param {string} text
 * @param {'summary' | 'why' | 'risk-ok'} kind
 * @returns {string | null} error message, or null if ok
 */
export function validateJudgmentText(text, kind) {
  const s = String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!s) return `${kind} is required`;

  const min = kind === 'summary' ? 16 : 48;
  if (s.length < min) {
    return `${kind} must be at least ${min} characters (got ${s.length}) — explain the real change / judgment`;
  }
  if (VERSIONISH_ONLY.test(s)) {
    return `${kind} must not be only a version number`;
  }
  if (kind === 'summary' && LAZY_SUMMARY_EXACT.test(s)) {
    return `${kind} looks like a lazy placeholder ("${s.slice(0, 40)}") — describe what operators get`;
  }
  if (kind === 'why' && LAZY_WHY_EXACT.test(s)) {
    return `${kind} looks like a lazy placeholder — answer the self-host upgrade question explicitly`;
  }
  if (
    kind === 'why' &&
    !/\b(self-?host|upgrade|compat|break|operator|login|api|schema|behavior)\b/i.test(
      s,
    )
  ) {
    return `${kind} must mention the self-host / upgrade / compatibility judgment (e.g. why this is still compatible, or what breaks)`;
  }
  if (
    kind === 'risk-ok' &&
    !/\b(still compatible|not breaking|no (api|schema|auth|login|upgrade) break|operators? (can|still)|in-place)\b/i.test(
      s,
    )
  ) {
    return `${kind} must explicitly justify why risk-path changes remain self-host compatible`;
  }
  return null;
}

/**
 * @param {object} input
 * @param {BumpLevel} input.level
 * @param {AttestKind} input.attest
 * @param {string} input.summary
 * @param {string} input.why
 * @param {string[]} [input.riskPaths]
 * @param {string} [input.riskOk]
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateBumpAttestation(input) {
  const { level, attest, summary, why, riskPaths = [], riskOk = '' } = input;

  if (!['patch', 'minor', 'major'].includes(level)) {
    return { ok: false, reason: `invalid level "${level}"` };
  }
  if (!ATTEST_KINDS.includes(/** @type {AttestKind} */ (attest))) {
    return {
      ok: false,
      reason: `invalid --attest "${attest}" (expected compatible|breaking|evolution)`,
    };
  }

  const expected = LEVEL_TO_ATTEST[level];
  if (attest !== expected) {
    return {
      ok: false,
      reason: `level "${level}" requires --attest ${expected} (got ${attest}). Do not pick the easiest number — match the self-host impact.`,
    };
  }

  const summaryErr = validateJudgmentText(summary, 'summary');
  if (summaryErr) return { ok: false, reason: summaryErr };

  const whyErr = validateJudgmentText(why, 'why');
  if (whyErr) return { ok: false, reason: whyErr };

  const summaryNorm = summary.trim().replace(/\s+/g, ' ').toLowerCase();
  const whyNorm = why.trim().replace(/\s+/g, ' ').toLowerCase();
  if (summaryNorm === whyNorm) {
    return {
      ok: false,
      reason:
        '--summary and --why must differ: summary = what changed; why = self-host compatibility judgment',
    };
  }

  if (riskPaths.length > 0 && attest === 'compatible') {
    if (!riskOk.trim()) {
      return {
        ok: false,
        reason:
          `push touches self-host risk paths (${riskPaths.slice(0, 5).join(', ')}${riskPaths.length > 5 ? ', …' : ''}) but --attest compatible. ` +
          `Either bump with --attest breaking (minor), or pass --risk-ok "…" explaining why operators can still in-place upgrade.`,
      };
    }
    const riskErr = validateJudgmentText(riskOk, 'risk-ok');
    if (riskErr) return { ok: false, reason: riskErr };
  }

  if (attest === 'breaking' && level !== 'minor') {
    return { ok: false, reason: 'internal: breaking must be minor' };
  }

  return { ok: true };
}

/**
 * @param {object} input
 * @param {string} input.version
 * @param {string} input.summary
 * @param {AttestKind} input.attest
 * @param {string} input.why
 * @param {string} [input.riskOk]
 * @param {string[]} [input.includedSubjects]
 * @returns {string}
 */
export function formatReleaseCommitMessage(input) {
  const {
    version,
    summary,
    attest,
    why,
    riskOk = '',
    includedSubjects = [],
  } = input;
  const subject = `release: ${version} — ${summary.trim().replace(/\s+/g, ' ')}`;
  const lines = [
    subject,
    '',
    `Echo-Version-Attest: ${attest}`,
    `Echo-Version-Why: ${why.trim().replace(/\s+/g, ' ')}`,
  ];
  if (riskOk.trim()) {
    lines.push(`Echo-Version-Risk-Ok: ${riskOk.trim().replace(/\s+/g, ' ')}`);
  }
  if (includedSubjects.length) {
    lines.push('', 'Included changes:');
    for (const s of includedSubjects.slice(0, 40)) {
      lines.push(`- ${s}`);
    }
    if (includedSubjects.length > 40) {
      lines.push(`- …and ${includedSubjects.length - 40} more`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * @param {string} message
 * @returns {{
 *   ok: true,
 *   version: string,
 *   summary: string,
 *   attest: AttestKind,
 *   why: string,
 *   riskOk: string,
 * } | { ok: false, reason: string }}
 */
export function parseReleaseCommitMessage(message) {
  const raw = String(message ?? '').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');
  const subject = (lines[0] || '').trim();
  const m = /^release:\s*(\d+\.\d+\.\d+)\s+[—–-]\s+(.+)$/.exec(subject);
  if (!m) {
    return {
      ok: false,
      reason:
        'VERSION bump commit subject must be: release: X.Y.Z — <summary of what changed> (not chore(version))',
    };
  }

  /** @type {Record<string, string>} */
  const trailers = {};
  for (const line of lines.slice(1)) {
    const tm = /^(Echo-Version-[A-Za-z0-9-]+):\s*(.*)$/.exec(line.trim());
    if (tm) trailers[tm[1]] = tm[2].trim();
  }

  const attest = trailers['Echo-Version-Attest'];
  const why = trailers['Echo-Version-Why'];
  const riskOk = trailers['Echo-Version-Risk-Ok'] || '';

  if (!attest || !ATTEST_KINDS.includes(/** @type {AttestKind} */ (attest))) {
    return {
      ok: false,
      reason:
        'VERSION bump commit must include trailer Echo-Version-Attest: compatible|breaking|evolution',
    };
  }
  if (!why) {
    return {
      ok: false,
      reason:
        'VERSION bump commit must include trailer Echo-Version-Why: <self-host judgment>',
    };
  }

  return {
    ok: true,
    version: m[1],
    summary: m[2].trim(),
    attest: /** @type {AttestKind} */ (attest),
    why,
    riskOk,
  };
}

/**
 * @param {object} input
 * @param {string} input.version
 * @param {BumpLevel} input.level
 * @param {string} input.message
 * @param {string[]} [input.riskPaths]
 * @returns {{ ok: true, attest: AttestKind } | { ok: false, reason: string }}
 */
export function validateReleaseCommitForBump(input) {
  const parsed = parseReleaseCommitMessage(input.message);
  if (!parsed.ok) return parsed;

  if (parsed.version !== input.version) {
    return {
      ok: false,
      reason: `release subject version ${parsed.version} does not match VERSION ${input.version}`,
    };
  }

  const judgment = validateBumpAttestation({
    level: input.level,
    attest: parsed.attest,
    summary: parsed.summary,
    why: parsed.why,
    riskPaths: input.riskPaths || [],
    riskOk: parsed.riskOk,
  });
  if (!judgment.ok) return judgment;

  return { ok: true, attest: parsed.attest };
}
