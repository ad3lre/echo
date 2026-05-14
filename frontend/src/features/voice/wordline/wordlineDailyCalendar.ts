/**
 * Local calendar day key (YYYY-MM-DD) for Wordline daily mode and reminder timing.
 */
export function wordlineDailyCalendarKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
