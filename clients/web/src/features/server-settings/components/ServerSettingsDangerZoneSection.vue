<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import EchoDropdown from '@/components/EchoDropdown.vue';

const props = defineProps<{
  serverName: string;
  transferEnabled: boolean;
  transferCandidates: { id: string; name: string; pfp: string }[];
  transferLoading: boolean;
  transferError: string;
  deleteServerEnabled: boolean;
  deleteLoading: boolean;
  deleteError: string;
}>();

const emit = defineEmits<{
  'transfer-ownership': [newOwnerId: string];
  'confirm-delete-server': [];
}>();

const transferModalOpen = ref(false);
const selectedNewOwnerId = ref('');

const deleteModalOpen = ref(false);
const deleteNameConfirm = ref('');

const deleteNameMatches = computed(
  () =>
    deleteNameConfirm.value.trim() === props.serverName.trim() &&
    props.serverName.trim().length > 0,
);

watch(deleteModalOpen, (open) => {
  if (!open) deleteNameConfirm.value = '';
});

watch(
  () => props.deleteLoading,
  (loading, prev) => {
    if (prev && !loading && !props.deleteError) {
      deleteModalOpen.value = false;
      deleteNameConfirm.value = '';
    }
  },
);

watch(transferModalOpen, (open) => {
  if (open) {
    const first = props.transferCandidates[0];
    selectedNewOwnerId.value = first ? first.id : '';
  } else {
    selectedNewOwnerId.value = '';
  }
});

watch(
  () => props.transferLoading,
  (loading, prev) => {
    if (prev && !loading && !props.transferError) {
      transferModalOpen.value = false;
    }
  },
);

function confirmTransfer() {
  const id = selectedNewOwnerId.value.trim();
  if (!id) return;
  emit('transfer-ownership', id);
}

function onTransferBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget && !props.transferLoading) {
    transferModalOpen.value = false;
  }
}

function onDeleteBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget && !props.deleteLoading) {
    deleteModalOpen.value = false;
  }
}

function confirmDeleteServer() {
  if (!deleteNameMatches.value || props.deleteLoading) return;
  emit('confirm-delete-server');
}
</script>

<template>
  <div class="space-y-4">
    <div class="roles-panel rounded-2xl p-5">
      <div class="settings-subtitle echo-danger-subtitle">Danger Zone</div>
      <div class="mt-2 text-sm text-fg-soft">
        These actions are sensitive and may be irreversible. Proceed carefully.
      </div>
    </div>

    <div class="roles-panel rounded-2xl p-5">
      <div class="space-y-4">
        <div
          class="flex items-start justify-between gap-4 rounded-xl bg-glass-1 px-4 py-3"
        >
          <div>
            <div class="font-semibold text-fg">Transfer Ownership</div>
            <div class="mt-1 text-sm text-fg-subtle">
              Move permanent server ownership to another member. This is tied to
              the server itself, not a role—the new owner gains full control and
              you lose owner-only actions unless they transfer ownership back to
              you.
            </div>
            <div v-if="!transferEnabled" class="mt-2 text-xs text-fg-subtle">
              Available when you are the server owner (mock preview also needs a
              bearer session).
            </div>
            <div
              v-else-if="transferCandidates.length === 0"
              class="echo-warn-text mt-2 text-xs"
            >
              Invite another member before you can transfer ownership.
            </div>
          </div>
          <button
            type="button"
            class="echo-warn-action shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="
              !transferEnabled ||
              transferCandidates.length === 0 ||
              transferLoading
            "
            @click="transferModalOpen = true"
          >
            Transfer
          </button>
        </div>

        <div
          class="flex items-start justify-between gap-4 rounded-xl bg-glass-1 px-4 py-3"
        >
          <div>
            <div class="font-semibold text-fg">Archive Server</div>
            <div class="mt-1 text-sm text-fg-subtle">
              Lock all channels and put the community in read-only mode.
            </div>
          </div>
          <button
            type="button"
            class="echo-warn-action shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
          >
            Archive
          </button>
        </div>

        <div
          class="echo-danger-section flex items-start justify-between gap-4 rounded-xl px-4 py-3"
        >
          <div>
            <div class="font-semibold echo-danger-title">Delete Server</div>
            <div class="mt-1 text-sm echo-danger-body">
              Permanently delete
              <span class="font-semibold">{{ props.serverName }}</span> and all
              related messages, channels, and media.
            </div>
          </div>
          <button
            type="button"
            class="echo-destructive-fill shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="!props.deleteServerEnabled || deleteLoading"
            @click="
              () => {
                if (!deleteLoading && props.deleteServerEnabled)
                  deleteModalOpen = true;
              }
            "
          >
            Delete Server
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="transferModalOpen"
        class="fixed inset-0 z-[160] flex items-center justify-center bg-overlay-heavy px-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-ownership-title"
        @click="onTransferBackdropClick"
      >
        <div
          class="w-full max-w-md rounded-2xl border border-border bg-[var(--echo-server-dialog-bg)] p-5 shadow-xl"
          @click.stop
        >
          <h2
            id="transfer-ownership-title"
            class="text-lg font-semibold text-fg"
          >
            Transfer ownership
          </h2>
          <p class="mt-2 text-sm text-fg-soft">
            Choose a member to become the new fundamental owner of
            <span class="font-medium text-fg-soft">{{ props.serverName }}</span
            >. This cannot be undone from here except by the new owner
            transferring back.
          </p>
          <label
            class="mt-4 block text-xs font-medium uppercase tracking-wide text-fg-subtle"
            >New owner</label
          >
          <EchoDropdown
            v-model="selectedNewOwnerId"
            :options="
              transferCandidates.map((m) => ({ label: m.name, value: m.id }))
            "
            label=""
            surface="server"
            teleport-menu
            :disabled="transferLoading || transferCandidates.length === 0"
          />
          <p v-if="transferError" class="mt-3 text-sm echo-destructive-text">
            {{ transferError }}
          </p>
          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-sm font-medium text-fg-soft transition-colors hover:bg-glass-1 hover:text-fg disabled:opacity-40"
              :disabled="transferLoading"
              @click="transferModalOpen = false"
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-amber-500/90 px-3 py-1.5 text-sm font-semibold text-neutral-900 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="transferLoading || !selectedNewOwnerId"
              @click="confirmTransfer"
            >
              {{ transferLoading ? 'Transferring…' : 'Transfer ownership' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="deleteModalOpen"
        class="fixed inset-0 z-[160] flex items-center justify-center bg-overlay-heavy px-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-server-title"
        @click="onDeleteBackdropClick"
      >
        <div
          class="w-full max-w-md rounded-2xl border border-rose-500/20 bg-[var(--echo-server-dialog-bg)] p-5 shadow-xl"
          @click.stop
        >
          <h2
            id="delete-server-title"
            class="text-lg font-semibold echo-danger-title"
          >
            Delete server
          </h2>
          <p class="mt-2 text-sm text-fg-soft">
            This cannot be undone. Type
            <span class="font-semibold text-fg">{{ props.serverName }}</span>
            exactly to confirm.
          </p>
          <label
            class="mt-4 block text-xs font-medium uppercase tracking-wide text-fg-subtle"
            >Server name</label
          >
          <input
            v-model="deleteNameConfirm"
            type="text"
            class="mt-1.5 w-full rounded-lg border border-border bg-scrim-2 px-3 py-2 text-sm text-fg outline-none focus:border-rose-400/40"
            :disabled="deleteLoading"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="Enter server name"
          />
          <p v-if="deleteError" class="mt-3 text-sm echo-destructive-text">
            {{ deleteError }}
          </p>
          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-sm font-medium text-fg-soft transition-colors hover:bg-glass-1 hover:text-fg disabled:opacity-40"
              :disabled="deleteLoading"
              @click="deleteModalOpen = false"
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="deleteLoading || !deleteNameMatches"
              @click="confirmDeleteServer"
            >
              {{ deleteLoading ? 'Deleting…' : 'Delete server permanently' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
