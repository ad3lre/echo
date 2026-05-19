import {
  AUTOMOD_MAX_RE2_PATTERN_LEN,
} from '../../../../../shared/types/automod';

type Re2Ctor = new (pattern: string, flags?: string) => { test(s: string): boolean };

let Re2Class: Re2Ctor | null = null;
let re2ProbeDone = false;

function loadRe2(): Re2Ctor | null {
  if (re2ProbeDone) return Re2Class;
  re2ProbeDone = true;
  try {
    // optional native module — may be absent on some installs
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('re2') as Re2Ctor | { default: Re2Ctor };
    Re2Class = (mod as { default?: Re2Ctor }).default ?? (mod as Re2Ctor);
  } catch {
    Re2Class = null;
  }
  return Re2Class;
}

export function isRe2AutomodAvailable(): boolean {
  return loadRe2() != null;
}

export function automodRe2Test(pattern: string, text: string): boolean {
  const R = loadRe2();
  if (!R) throw new Error('RE2_UNAVAILABLE');
  const p = pattern.slice(0, AUTOMOD_MAX_RE2_PATTERN_LEN);
  try {
    const r = new R(p);
    return r.test(text);
  } catch {
    return false;
  }
}
