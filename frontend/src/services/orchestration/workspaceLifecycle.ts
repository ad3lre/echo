import * as api from '@/services/api/echoApi';

export type WorkspaceLifecycleDeps = {
  apiBase: string;
  getToken?: () => string | null;
};

export function createWorkspaceLifecycleService({
  apiBase,
  getToken,
}: WorkspaceLifecycleDeps) {
  return {
    async hydrate() {
      const token = getToken?.() ?? undefined;
      return await api.hydrateWorkspace(apiBase, token);
    },
    async joinWithInvite(inviteCode: string) {
      const token = getToken?.();
      if (!token) throw new Error('Not authenticated');
      return await api.joinServerWithInvite(apiBase, token, inviteCode);
    },
  };
}
