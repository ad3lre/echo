/** Placeholders for AutoMod notice / alert / warn message bodies (plain text). */
const AUTOMOD_BODY_MAX = 3800;

export type AutomodTemplateVars = {
  ruleName: string;
  ruleId: string;
  userId: string;
  channelId: string;
  messageId: string;
  correlationId: string;
};

export function buildAutomodMessageBody(
  template: string,
  vars: AutomodTemplateVars,
): string {
  const t = (template ?? '').trim();
  const base =
    t.length > 0
      ? t
      : `AutoMod rule “${vars.ruleName}” triggered for user ${vars.userId}.`;
  const out = base
    .replaceAll('{ruleName}', vars.ruleName)
    .replaceAll('{ruleId}', vars.ruleId)
    .replaceAll('{userId}', vars.userId)
    .replaceAll('{channelId}', vars.channelId)
    .replaceAll('{messageId}', vars.messageId)
    .replaceAll('{correlationId}', vars.correlationId);
  return out.slice(0, AUTOMOD_BODY_MAX);
}
