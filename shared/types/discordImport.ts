/**
 * Structured issues from Discord → Echo role import (bundle `roles.json` step).
 * Persisted on `echo_discord_import_states.role_import_issues` and returned in import state.
 */
export type DiscordRoleImportIssueCode =
  | 'skipped_managed'
  | 'skipped_invalid_body'
  | 'truncated_role_limit'
  | 'permission_denied'
  | 'everyone_update_failed'
  | 'role_order_failed'
  | 'unexpected_create_result'
  | 'mapped_role_update_failed'
  | 'renamed_duplicate';

export type DiscordRoleImportIssue = {
  code: DiscordRoleImportIssueCode;
  /** Discord role snowflake when known */
  discordRoleId?: string;
  /** Role display name from the export */
  roleName?: string;
  /** Human-readable explanation for operators */
  detail: string;
};
