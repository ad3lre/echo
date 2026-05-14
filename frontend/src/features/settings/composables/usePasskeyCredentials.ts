import { ref } from 'vue';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import {
  AuthApiError,
  authFetchPasskeys,
  authRevokePasskey,
  type AuthPasskeyCredential,
} from '@/api/authClient';
import { useAuthSessionStore } from '@/stores/authSession';
import { ECHO_PASSKEYS_ENABLED } from '@/config/echoPasskeysEnabled';

export function usePasskeyCredentials() {
  const authSession = useAuthSessionStore();
  const passkeys = ref<AuthPasskeyCredential[]>([]);
  const passkeysLoading = ref(false);
  const passkeysError = ref<string | null>(null);
  const passkeyRevokingId = ref<string | null>(null);

  async function loadPasskeys() {
    passkeysError.value = null;
    if (!ECHO_PASSKEYS_ENABLED) {
      passkeys.value = [];
      return;
    }
    if (
      !authSession.isAuthenticated ||
      echoSyncCapabilities.isMockDataMode ||
      authSession.backendUser?.isGuest
    ) {
      passkeys.value = [];
      return;
    }
    passkeysLoading.value = true;
    try {
      const { passkeys: list } = await authFetchPasskeys();
      passkeys.value = list;
    } catch (e) {
      passkeysError.value =
        e instanceof AuthApiError ? e.message : 'Could not load passkeys.';
      passkeys.value = [];
    } finally {
      passkeysLoading.value = false;
    }
  }

  async function revokePasskey(id: string) {
    if (!ECHO_PASSKEYS_ENABLED) return;
    if (!authSession.isAuthenticated || echoSyncCapabilities.isMockDataMode)
      return;
    passkeyRevokingId.value = id;
    passkeysError.value = null;
    try {
      await authRevokePasskey(id);
      await loadPasskeys();
    } catch (e) {
      passkeysError.value =
        e instanceof AuthApiError ? e.message : 'Could not remove passkey.';
    } finally {
      passkeyRevokingId.value = null;
    }
  }

  return {
    passkeys,
    passkeysLoading,
    passkeysError,
    passkeyRevokingId,
    loadPasskeys,
    revokePasskey,
  };
}
