/**
 * Echo message body v2 — wire and schema constants.
 * @see docs/contracts/ECHO_CONTRACT_V2.md
 */

export const MESSAGE_FORMAT_VERSION_LEGACY = 1;
export const MESSAGE_FORMAT_VERSION_JSON = 2;

/** Current TipTap doc schema version the server accepts for writes. */
export const ECHO_CONTENT_SCHEMA_VERSION = 2;

/** Max serialized JSON size for content_json (bytes). */
export const MAX_CONTENT_JSON_BYTES = 256_000;
