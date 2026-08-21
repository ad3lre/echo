import { config } from '../../config';
import {
  discordBotCreateWebhook,
  discordBotListChannelWebhooks,
} from '../integrations/discordApiClient';
import { normalizeDiscordWebhookUrl } from '../../domain/discord/discordBridgeRepo';

/**
 * Resolve or create an incoming webhook for Echo → Discord outbound mirroring.
 */
export async function ensureDiscordOutboundWebhookUrl(opts: {
  discordChannelId: string;
  existingUrl: string | null | undefined;
}): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const botTok = config.discordBotToken?.trim();
  if (!botTok) {
    return {
      ok: false,
      message:
        'Set DISCORD_BOT_TOKEN on the Echo API so a webhook can be created automatically.',
    };
  }
  const normalizedExisting =
    typeof opts.existingUrl === 'string'
      ? normalizeDiscordWebhookUrl(opts.existingUrl)
      : null;
  if (normalizedExisting) {
    return { ok: true, url: normalizedExisting };
  }

  const hooks = await discordBotListChannelWebhooks(
    botTok,
    opts.discordChannelId,
  );
  const match = hooks.find((h) => {
    const n = (h.name ?? '').trim();
    return n === 'Echo bridge' || n.startsWith('Echo');
  });
  if (match?.url) {
    const n = normalizeDiscordWebhookUrl(match.url);
    if (n) return { ok: true, url: n };
  }

  const created = await discordBotCreateWebhook(
    botTok,
    opts.discordChannelId,
    'Echo bridge',
  );
  if (!created?.url) {
    return {
      ok: false,
      message:
        'Could not create a webhook. Invite the Echo bot and grant it Manage Webhooks on the target channel.',
    };
  }
  const fin = normalizeDiscordWebhookUrl(created.url);
  if (!fin) {
    return {
      ok: false,
      message: 'Discord returned an invalid webhook URL.',
    };
  }
  return { ok: true, url: fin };
}
