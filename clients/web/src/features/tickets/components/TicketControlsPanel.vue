<script setup lang="ts">
import { echoT } from '@/i18n';
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

const statusOptions = computed<
  {
    value: EchoTicketStatus;
    label: string;
    color: string;
  }[]
>(() => [
  { value: 'open', label: echoT('b40.tickets.open'), color: '#3ba55d' },
  {
    value: 'in_progress',
    label: echoT('b40.tickets.inProgress'),
    color: '#faa61a',
  },
  { value: 'resolved', label: echoT('b40.tickets.resolved'), color: '#5865f2' },
  { value: 'closed', label: echoT('b40.tickets.closed'), color: '#747f8d' },
]);

function statusLabel(status: string): string {
  return statusOptions.value.find((s) => s.value === status)?.label ?? status;
}

function statusColor(status: string): string {
  return (
    statusOptions.value.find((s) => s.value === status)?.color ?? '#747f8d'
  );
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
      {{ echoT('b40.tickets.category', { category: ticket.category }) }}
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
        {{ echoT('b40.tickets.markInProgress') }}
      </button>
      <button
        v-if="ticket.status !== 'resolved'"
        class="ticket-controls__btn ticket-controls__btn--resolve"
        :disabled="updating"
        @click="changeStatus('resolved')"
      >
        {{ echoT('b40.tickets.resolve') }}
      </button>
      <button
        class="ticket-controls__btn ticket-controls__btn--close"
        :disabled="updating"
        @click="closeTicket"
      >
        {{ echoT('b40.tickets.closeTicket') }}
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
        {{ echoT('b40.tickets.closeTicket') }}
      </button>
    </div>

    <div v-if="ticket.status === 'closed'" class="ticket-controls__closed-msg">
      {{ echoT('b40.tickets.closedMsg') }}
    </div>
  </div>
</template>

<style scoped lang="scss" src="./styles/TicketControlsPanel.scss"></style>
