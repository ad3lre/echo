/** Page background preset pairs for paper documents (light + dark preview). */
export const PAPER_PAGE_COLOR_PRESETS = [
  { label: 'White', light: '#ffffff', dark: '#16161c' },
  { label: 'Cream', light: '#faf7f2', dark: '#1c1917' },
  { label: 'Warm', light: '#fff8f0', dark: '#1a1410' },
  { label: 'Amber', light: '#fffbf0', dark: '#1c1810' },
  { label: 'Mint', light: '#f0faf5', dark: '#101814' },
  { label: 'Sky', light: '#f0f7ff', dark: '#101620' },
  { label: 'Lavender', light: '#f5f0ff', dark: '#16101f' },
] as const;

export function isPaperPagePresetActive(
  light: string | null | undefined,
  dark: string | null | undefined,
  preset: (typeof PAPER_PAGE_COLOR_PRESETS)[number],
): boolean {
  const l = (light ?? '').trim().toLowerCase();
  const d = (dark ?? '').trim().toLowerCase();
  return l === preset.light.toLowerCase() && d === preset.dark.toLowerCase();
}
