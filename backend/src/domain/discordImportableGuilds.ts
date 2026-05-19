import { config } from '../config';

export function discordUserCanImportFromGuild(g: {
  owner: boolean;
  permissions: string;
}): boolean {
  if (g.owner) return true;
  try {
    const p = BigInt(g.permissions);
    const administrator = 1n << 3n;
    const manageGuild = 1n << 5n;
    if ((p & administrator) === administrator) return true;
    if ((p & manageGuild) === manageGuild) return true;
  } catch {
    return false;
  }
  return false;
}

export function buildDiscordBotInstallUrl(
  discordGuildId: string,
): string | null {
  const clientId = config.discordOauthClientId?.trim();
  if (!clientId) return null;
  const u = new URL('https://discord.com/oauth2/authorize');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('scope', 'bot applications.commands');
  u.searchParams.set(
    'permissions',
    (config.discordBotInvitePermissionBits || '8').trim(),
  );
  u.searchParams.set('guild_id', discordGuildId);
  u.searchParams.set('disable_guild_select', 'true');
  // Do not attach redirect_uri: Discord often opens the native app, so browser redirects back to Echo are unreliable.
  // The export bot notifies Echo when the bundle is ready; the web UI polls for that signal.
  return u.toString();
}

export function discordGuildIconUrl(
  guildId: string,
  iconHash: string | null,
): string | null {
  if (!iconHash) return null;
  const ext = iconHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.${ext}`;
}
