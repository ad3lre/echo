/** Keep in sync with `server/backend/src/domain/echoStore/safety/moderation.ts`. */

export const MAX_ECHO_TIMEOUT_MINUTES = 40320;

/** Temporary bans may last up to one year; timeouts use `MAX_ECHO_TIMEOUT_MINUTES`. */
export const MAX_ECHO_BAN_DURATION_MINUTES = 365 * 24 * 60;

export const BAN_PRESET_ONE_MONTH_MINUTES = 30 * 24 * 60;

export const BAN_PRESET_THREE_MONTHS_MINUTES = 90 * 24 * 60;
