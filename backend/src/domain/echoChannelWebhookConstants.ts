/** `auth_users.id` for messages delivered via channel incoming webhooks. */
export const ECHO_INTERNAL_WEBHOOK_ACTOR_USER_ID =
  'echo_internal_webhook_actor_v1' as const;

/** `echo_messages.bridge_source` when the row was created by a channel webhook execute. */
export const ECHO_WEBHOOK_BRIDGE_SOURCE = 'echo_webhook' as const;
