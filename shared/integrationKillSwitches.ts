/**
 * Temporary kill switches for Google / YouTube integrations and channel webhooks.
 * Set to `true` to re-enable the corresponding product surface.
 */

/** Google SSO sign-in, account linking, and Settings → Google. */
export const GOOGLE_INTEGRATION_ENABLED = false;

/** YouTube linking, watch-together VC, stage live RTMP, link embeds, and Settings → YouTube. */
export const YOUTUBE_INTEGRATION_ENABLED = false;

/** Echo incoming channel webhooks (settings UI, management API, and execute hooks). */
export const CHANNEL_WEBHOOKS_ENABLED = false;
