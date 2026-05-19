import { isEchoGraphId } from '@/utils/echoIds';

/**
 * Server-scoped display label: server nickname when set, otherwise the global roster name
 * (from messages, typing, etc.).
 */
export function resolveGuildMemberDisplayName(opts: {
  serverId: string | null | undefined;
  userId: string | null | undefined;
  fallbackName: string;
  serverMemberNicknames: Readonly<Record<string, Record<string, string>>>;
}): string {
  const sid = opts.serverId?.trim() ?? '';
  const uid = opts.userId?.trim() ?? '';
  if (!sid || !uid || !isEchoGraphId(sid)) {
    return opts.fallbackName;
  }
  const nick = opts.serverMemberNicknames[sid]?.[uid]?.trim();
  return nick || opts.fallbackName;
}
