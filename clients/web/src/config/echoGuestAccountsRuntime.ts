import { ECHO_GUEST_ACCOUNTS_ENABLED as GUEST_BUILD_FLAG } from '@/config/echoGuestAccountsEnabled';
import { useInstancePolicyStore } from '@/features/layout/instancePolicy';

/** Guest mint when build flag or runtime instance policy enables it. */
export function isGuestAccountsEnabled(): boolean {
  if (GUEST_BUILD_FLAG) return true;
  const store = useInstancePolicyStore();
  return store.loaded && store.guestAccountsEnabled;
}

export { GUEST_BUILD_FLAG as ECHO_GUEST_ACCOUNTS_BUILD_FLAG };
