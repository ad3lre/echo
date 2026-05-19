import { computed, type ComputedRef } from 'vue';
import type { Server } from '@shared/types';
import { canDeleteCurrentEchoServer } from '@/features/layout/canDeleteCurrentEchoServer';

export function useCanDeleteCurrentEchoServerComputed(deps: {
  selectedServer: ComputedRef<Server | undefined>;
  currentUserId: { readonly value: string | undefined };
}) {
  return computed(() =>
    canDeleteCurrentEchoServer({
      selectedServer: deps.selectedServer.value,
      currentUserId: deps.currentUserId.value,
    }),
  );
}
