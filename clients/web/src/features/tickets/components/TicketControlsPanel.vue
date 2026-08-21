<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useServerTicketsStore } from '@/features/tickets/serverTickets';
import type { EchoTicket, EchoTicketStatus } from '@shared/types/ticket';

const props = defineProps<{
  serverId: string;
  channelId: string;
  accessToken: string;
  isHandler: boolean;
}>();

const ticketStore = useServerTicketsStore();
const updating = ref(false);

const ticket = computed((): EchoTicket | null | undefined =>
  ticketStore.ticketForChannel(props.channelId),
);

onMounted(async () => {
  if (ticket.value === undefined) {
    await ticketStore.loadTicketForChannel(
      props.serverId,
      props.channelId,
      props.accessToken,
    );
  }
});

const statusOptions: {
  value: EchoTicketStatus;
  label: string;
  color: string;
}[] = [
  { value: 'open', label: 'Open', color: '#3ba55d' },
  { value: 'in_progress', label: 'In Progress', color: '#faa61a' },
  { value: 'resolved', label: 'Resolved', color: '#5865f2' },
  { value: 'closed', label: 'Closed', color: '#747f8d' },
];

function statusLabel(status: string): string {
  return statusOptions.find((s) => s.value === status)?.label ?? status;
}

function statusColor(status: string): string {
  return statusOptions.find((s) => s.value === status)?.color ?? '#747f8d';
}

async function changeStatus(newStatus: EchoTicketStatus) {
  if (!ticket.value) return;
  updating.value = true;
  await ticketStore.updateTicket(
    props.serverId,
    ticket.value.id,
    props.accessToken,
    { status: newStatus },
  );
  updating.value = false;
}

async function closeTicket() {
  await changeStatus('closed');
}
</script>

<template>
  <div v-if="ticket" class="ticket-controls">
    <div class="ticket-controls__header">
      <div class="ticket-controls__badge">
        <span
          class="ticket-controls__status-dot"
          :style="{ background: statusColor(ticket.status) }"
        />
        {{ statusLabel(ticket.status) }}
      </div>
      <span class="ticket-controls__subject">{{ ticket.subject }}</span>
    </div>

    <div v-if="ticket.category" class="ticket-controls__category">
      Category: {{ ticket.category }}
    </div>

    <div
      v-if="isHandler && ticket.status !== 'closed'"
      class="ticket-controls__actions"
    >
      <button
        v-if="ticket.status === 'open'"
        class="ticket-controls__btn ticket-controls__btn--progress"
        :disabled="updating"
        @click="changeStatus('in_progress')"
      >
        Mark In Progress
      </button>
      <button
        v-if="ticket.status !== 'resolved'"
        class="ticket-controls__btn ticket-controls__btn--resolve"
        :disabled="updating"
        @click="changeStatus('resolved')"
      >
        Resolve
      </button>
      <button
        class="ticket-controls__btn ticket-controls__btn--close"
        :disabled="updating"
        @click="closeTicket"
      >
        Close Ticket
      </button>
    </div>

    <div
      v-else-if="!isHandler && ticket.status !== 'closed'"
      class="ticket-controls__actions"
    >
      <button
        class="ticket-controls__btn ticket-controls__btn--close"
        :disabled="updating"
        @click="closeTicket"
      >
        Close Ticket
      </button>
    </div>

    <div v-if="ticket.status === 'closed'" class="ticket-controls__closed-msg">
      This ticket has been closed.
    </div>
  </div>
</template>

<style scoped lang="scss">
.ticket-controls {
  padding: 0.75rem 1rem;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);

  &__header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.35rem;
  }

  &__badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8rem;
    font-weight: 500;
    padding: 0.2rem 0.6rem;
    border-radius: 1rem;
    background: var(--color-bg-tertiary, var(--color-bg));
    border: 1px solid var(--color-border);
  }

  &__status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }

  &__subject {
    font-weight: 500;
    font-size: 0.9rem;
  }

  &__category {
    font-size: 0.8rem;
    color: var(--color-fg-muted);
    margin-bottom: 0.5rem;
  }

  &__actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  &__btn {
    padding: 0.35rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.8rem;
    cursor: pointer;
    border: none;
    font-weight: 500;
    transition: opacity 0.15s ease;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    &:hover:not(:disabled) {
      opacity: 0.85;
    }

    &--progress {
      background: #faa61a;
      color: #1a1a1a;
    }

    &--resolve {
      background: #5865f2;
      color: white;
    }

    &--close {
      background: #747f8d;
      color: white;
    }
  }

  &__closed-msg {
    font-size: 0.8rem;
    color: var(--color-fg-muted);
    font-style: italic;
    margin-top: 0.25rem;
  }
}
</style>
