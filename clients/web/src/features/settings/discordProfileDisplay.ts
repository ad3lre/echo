/** User-facing labels for Discord subscription tier from Discord’s `premium_type`. */
export function discordPremiumLabel(premiumType: number | null): string {
  if (premiumType === null) return 'Not shared';
  switch (premiumType) {
    case 0:
      return 'Standard';
    case 1:
      return 'Nitro Classic';
    case 2:
      return 'Nitro';
    case 3:
      return 'Nitro Basic';
    default:
      return 'Discord subscription';
  }
}

export function discordCountLabel(n: number | null): string {
  if (n === null) return '—';
  return String(n);
}
