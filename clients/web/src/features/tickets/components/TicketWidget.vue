<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useServerTicketsStore } from '@/features/tickets/serverTickets';
import TicketCreateModal from './TicketCreateModal.vue';

const props = defineProps<{
  serverId: string;
  channelId: string;
  accessToken: string;
}>();

const ticketStore = useServerTicketsStore();
const showModal = ref(false);

const config = computed(() => ticketStore.configFor(props.serverId));

const isTicketPanel = computed(
  () => config.value?.panelChannelId === props.channelId,
);

onMounted(async () => {
  if (!config.value) {
    await ticketStore.loadConfig(props.serverId, props.accessToken);
  }
});

function handleTicketCreated(ticket: { id: string; channelId: string }) {
  showModal.value = false;
  // Navigate to the new ticket channel - emit for parent to handle
  window.dispatchEvent(
    new CustomEvent('echo:navigate-channel', {
      detail: { serverId: props.serverId, channelId: ticket.channelId },
    }),
  );
}
</script>

<template>
  <div v-if="isTicketPanel && config?.enabled" class="ticket-widget">
    <div class="ticket-widget__card">
      <div class="ticket-widget__icon">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path
            d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
          />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 12h6" />
          <path d="M9 16h3" />
        </svg>
      </div>
      <div class="ticket-widget__content">
        <h3 class="ticket-widget__title">Support Tickets</h3>
        <p class="ticket-widget__desc">
          Need help or want to report something? Create a private ticket and a
          staff member will assist you.
        </p>
        <div
          v-if="config.ticketCategories?.length"
          class="ticket-widget__categories"
        >
          <span
            v-for="cat in config.ticketCategories"
            :key="cat.id"
            class="ticket-widget__category-tag"
          >
            {{ cat.emoji ?? '' }} {{ cat.name }}
          </span>
        </div>
      </div>
      <button class="ticket-widget__btn" @click="showModal = true">
        Create Ticket
      </button>
    </div>

    <TicketCreateModal
      v-model="showModal"
      :server-id="props.serverId"
      :access-token="props.accessToken"
      @ticket-created="handleTicketCreated"
    />
  </div>
</template>

<style scoped lang="scss">
.ticket-widget {
  padding: 1rem;

  &__card {
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 0.75rem;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.75rem;
  }

  &__icon {
    color: var(--color-accent);
    margin-bottom: 0.25rem;
  }

  &__content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
  }

  &__title {
    font-size: 1.1rem;
    font-weight: 600;
  }

  &__desc {
    font-size: 0.875rem;
    color: var(--color-fg-muted);
    max-width: 360px;
    line-height: 1.4;
  }

  &__categories {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.4rem;
    margin-top: 0.5rem;
  }

  &__category-tag {
    font-size: 0.75rem;
    padding: 0.2rem 0.55rem;
    border-radius: 1rem;
    background: var(--color-bg-tertiary, var(--color-bg));
    border: 1px solid var(--color-border);
    color: var(--color-fg-muted);
  }

  &__btn {
    margin-top: 0.75rem;
    padding: 0.65rem 1.75rem;
    border-radius: 0.5rem;
    background: var(--color-accent);
    color: var(--color-accent-fg);
    border: none;
    cursor: pointer;
    font-weight: 500;
    font-size: 0.9rem;
    transition: opacity 0.15s ease;

    &:hover {
      opacity: 0.9;
    }
  }
}
</style>
