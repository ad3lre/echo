/**
 * Role chips — surface colors from themes.scss (--member-role-chip-*).
 * Chips are borderless; separation comes from background + hover.
 */
export function memberPopoutRoleChipStyle(
  _color: string | null | undefined,
): Record<string, string> {
  return {
    border: 'none',
    borderWidth: '0',
    backgroundColor: 'var(--member-role-chip-bg)',
    color: 'var(--member-role-chip-fg)',
  };
}

/** Accent for role dot / inline swatch: honors Echo split dark/light vs app theme. */
export function memberPopoutRoleAccentColor(
  role: {
    color: string;
    separateThemeColors?: boolean;
    darkColor?: string;
    lightColor?: string;
  },
  preferLightTheme: boolean,
): string {
  if (role.separateThemeColors) {
    const branch = preferLightTheme ? role.lightColor : role.darkColor;
    return (branch ?? '').trim() || (role.color ?? '').trim();
  }
  return (role.color ?? '').trim();
}
