/**
 * Server display names (lowercase, trimmed) excluded from the public Explore directory.
 * Used by GET /directory/servers and client-side filtering so CI/local integration fixtures
 * do not pollute the directory.
 */
export const ECHO_DIRECTORY_EXCLUDED_SERVER_NAMES_LOWER = [
  'pipeline server',
  'direct messages',
  'direct message',
  'spam filter server',
  'uploads presign server',
  'multi-node server',
] as const;

export const ECHO_DIRECTORY_EXCLUDED_SERVER_NAMES_SET = new Set<string>(
  ECHO_DIRECTORY_EXCLUDED_SERVER_NAMES_LOWER,
);
