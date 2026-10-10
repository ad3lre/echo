import type { SkrigglesSettings } from './types';

const FIELD_TYPES: Record<keyof SkrigglesSettings, string> = {
  rounds: 'number',
  drawTimeSec: 'number',
  wordPickSec: 'number',
  minWordLen: 'number',
  hints: 'boolean',
  language: 'string',
  customWords: 'string',
};

export function isValidSkrigglesSettings(
  value: unknown,
): value is Partial<SkrigglesSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(
    ([key, field]) =>
      Object.prototype.hasOwnProperty.call(FIELD_TYPES, key) &&
      typeof field === FIELD_TYPES[key as keyof SkrigglesSettings] &&
      (typeof field !== 'number' || Number.isFinite(field)),
  );
}
