import {
  fetchEchoMutualFriends,
  postEchoRemoveFriend,
} from '@/api/echo/social';
import { EchoApiError } from '@/api/echo/transport';
import { toUsername } from '@/utils/memberProfiles';
import { selectPresence } from '@/services/domain/presence';

export type ProfileSocialUser = {
  id: string;
  name: string;
  username?: string;
  pfp: string;
  status?: string;
};

export type MutualFriendProfile = {
  id: string;
  displayName: string;
  username: string;
  pfp: string;
  status?: string;
};

export function shouldUseEchoProfileSocialApi(opts: {
  isMockDataMode: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  token?: string | null | undefined;
}): boolean {
  return !opts.isMockDataMode && opts.isAuthenticated && !opts.isGuest;
}

export async function fetchProfileMutualFriends(opts: {
  token: string;
  peerId: string;
  users: ProfileSocialUser[];
}): Promise<MutualFriendProfile[]> {
  const { userIds } = await fetchEchoMutualFriends(opts.token, opts.peerId);
  const usersById = new Map(opts.users.map((user) => [user.id, user]));
  return userIds
    .map((id) => usersById.get(id))
    .filter((user): user is ProfileSocialUser => user != null)
    .map((user) => ({
      id: user.id,
      displayName: user.name,
      username: user.username?.trim() || toUsername(user.name),
      pfp: user.pfp,
      status: selectPresence({
        rowStatus: user.status,
        diagnosticsKey: `profile-social:${user.id}`,
      }).status,
    }));
}

function isRemoveFriendBenignError(error: unknown): boolean {
  if (error instanceof EchoApiError) {
    if (error.status === 404 && error.body.code === 'NOT_FOUND') return true;
    const raw = error.body.message?.trim() ?? '';
    if (raw.includes('No accepted friendship')) return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('No accepted friendship');
}

export async function removeEchoFriend(opts: {
  token: string;
  peerId: string;
}): Promise<{ benign: boolean; warningMessage?: string }> {
  try {
    await postEchoRemoveFriend(opts.token, opts.peerId);
    return { benign: false };
  } catch (error) {
    if (isRemoveFriendBenignError(error)) {
      return { benign: true };
    }
    const message = error instanceof Error ? error.message : String(error);
    const wrapped = new Error(message.trim() || 'Could not remove friend.');
    if (error instanceof Error) wrapped.cause = error;
    throw wrapped;
  }
}
