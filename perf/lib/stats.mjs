/** @param {number[]} sorted @param {number} p */
export function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const weight = idx - lo;
  return Math.round(sorted[lo] * (1 - weight) + sorted[hi] * weight);
}

/** @param {number[]} values */
export function summarize(values) {
  const samples = values
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  if (samples.length === 0) {
    return { median: 0, p95: 0, min: 0, max: 0, stdev: 0, samples: [] };
  }
  const median = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);
  const min = samples[0];
  const max = samples[samples.length - 1];
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance =
    samples.reduce((acc, v) => acc + (v - mean) ** 2, 0) / samples.length;
  return {
    median,
    p95,
    min,
    max,
    stdev: Math.round(Math.sqrt(variance)),
    samples,
  };
}

/** @param {Array<Record<string, number>>} rows @param {string[]} keys */
export function summarizeMetricMap(rows, keys) {
  const out = {};
  for (const key of keys) {
    out[key] = summarize(rows.map((row) => row[key]).filter((v) => v != null));
  }
  return out;
}
