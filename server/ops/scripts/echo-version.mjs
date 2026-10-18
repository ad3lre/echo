#!/usr/bin/env bun
/**
 * Shared Echo product version helpers (MAJOR.MINOR.PATCH).
 * Scheme: major = marketing evolution; minor = self-host breaking; patch = rest.
 * See docs/operations/versioning.md.
 */

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
 * @param {'major' | 'minor' | 'patch'} level
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
 * @returns {{ ok: true, level: 'major' | 'minor' | 'patch' } | { ok: false, reason: string }}
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
