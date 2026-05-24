import bcrypt from 'bcrypt';
import { config } from '../../config';
import { maskE164 } from '../phoneE164';
import { publicBadgesFromAccount } from '../../../../shared/echoAccountBadges';
import type { AuthUser } from '../types';
import type { PasswordRecord } from './types';

export function publicUser(user: PasswordRecord): AuthUser {
  const {
    passwordHash: _pw,
    _memVerifiedE164,
    _memPendingE164,
    signupOrdinal: _signupOrdinal,
    badges: _badgesFromRecord,
    ...rest
  } = user;
  const out: AuthUser = { ...rest };
  if (_memVerifiedE164) out.phone = maskE164(_memVerifiedE164);
  if (_memPendingE164) out.pendingPhone = maskE164(_memPendingE164);
  const memBadges = publicBadgesFromAccount(
    user.signupOrdinal,
    {
      isGuest: out.isGuest,
      isDiscordShadow: out.isDiscordShadow,
    },
    out.echoPlan,
  );
  if (memBadges.length) out.badges = memBadges;
  else delete out.badges;
  return out;
}

export { normalizeUsername } from '../../../../shared/usernamePolicy';

export async function makeHash(password: string): Promise<string> {
  return bcrypt.hash(password, config.bcryptSaltRounds);
}

export function stripPasswordFields<T extends { passwordHash?: string }>(
  user: T,
): Omit<T, 'passwordHash'> {
  const { passwordHash: _pw, ...rest } = user;
  return rest;
}
