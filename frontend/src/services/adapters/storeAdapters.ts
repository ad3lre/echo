import type { Store } from 'pinia';

type AuthSessionShape = {
  accessToken?: string | null;
  isAuthenticated?: boolean;
};

// Minimal store adapters — expose only small, testable functions that services need.
export function createAuthSessionAdapter(authSessionStore: Store) {
  const s = authSessionStore as AuthSessionShape;
  return {
    getAccessToken(): string | null {
      return s.accessToken ?? null;
    },
    isAuthenticated(): boolean {
      return !!s.isAuthenticated;
    },
  };
}
