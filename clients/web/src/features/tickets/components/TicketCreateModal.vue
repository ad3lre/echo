<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useServerTicketsStore } from '@/features/tickets/serverTickets';
import type { EchoTicketConfig } from '@shared/types/ticket';

const props = defineProps<{
  modelValue: boolean;
  serverId: string;
  accessToken: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'ticket-created': [ticket: { id: string; channelId: string }];
}>();

const ticketStore = useServerTicketsStore();

const subject = ref('');
const selectedCategory = ref<string | null>(null);
const answers = ref<Record<string, string>>({});
const submitting = ref(false);
const error = ref<string | null>(null);

const config = computed((): EchoTicketConfig | undefined =>
  ticketStore.configFor(props.serverId),
);

onMounted(async () => {
  if (!ticketStore.configFor(props.serverId)) {
    await ticketStore.loadConfig(props.serverId, props.accessToken);
  }
});

function close() {
  emit('update:modelValue', false);
}

async function submit() {
  error.value = null;

  if (!subject.value.trim()) {
    error.value = 'Subject is required';
    return;
  }
  if (config.value?.requireCategory && !selectedCategory.value) {
    error.value = 'Please select a category';
    return;
  }

  submitting.value = true;
  const ticket = await ticketStore.submitTicket(
    props.serverId,
    props.accessToken,
    {
      subject: subject.value.trim(),
      category: selectedCategory.value,
      answers: Object.keys(answers.value).length ? answers.value : undefined,
    },
  );

  if (ticket) {
    emit('ticket-created', { id: ticket.id, channelId: ticket.channelId });
    close();
  } else {
    error.value = ticketStore.lastError || 'Failed to create ticket';
  }
  submitting.value = false;
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="modelValue" class="ticket-modal-overlay" @click.self="close">
      <div class="ticket-modal">
        <div class="ticket-modal__header">
          <h2 class="ticket-modal__title">Create a Ticket</h2>
          <button class="ticket-modal__close" @click="close">&times;</button>
        </div>

        <div class="ticket-modal__body">
          <p class="ticket-modal__intro">
            Submit a report or inquiry. A private channel will be created where
            you can communicate with the server team.
          </p>

          <div v-if="error" class="ticket-modal__error">{{ error }}</div>

          <div class="ticket-modal__field">
            <label class="ticket-modal__label">Subject *</label>
            <input
              v-model="subject"
              class="ticket-modal__input"
              placeholder="Brief description of your issue"
              maxlength="200"
            />
          </div>

          <div
            v-if="config?.ticketCategories?.length"
            class="ticket-modal__field"
          >
            <label class="ticket-modal__label">
              Category {{ config.requireCategory ? '*' : '' }}
            </label>
            <div class="ticket-modal__categories">
              <button
                v-for="cat in config.ticketCategories"
                :key="cat.id"
                class="ticket-modal__category-btn"
                :class="{
                  'ticket-modal__category-btn--active':
                    selectedCategory === cat.id,
                }"
                @click="selectedCategory = cat.id"
              >
                <span v-if="cat.emoji" class="ticket-modal__category-emoji">
                  {{ cat.emoji }}
                </span>
                {{ cat.name }}
              </button>
            </div>
          </div>

          <div
            v-for="field in config?.formFields ?? []"
            :key="field.id"
            class="ticket-modal__field"
          >
            <label class="ticket-modal__label">
              {{ field.label }}{{ field.required ? ' *' : '' }}
            </label>
            <input
              v-if="field.type === 'text'"
              v-model="answers[field.id]"
              class="ticket-modal__input"
              :placeholder="field.placeholder"
            />
            <textarea
              v-else-if="field.type === 'textarea'"
              v-model="answers[field.id]"
              class="ticket-modal__textarea"
              :placeholder="field.placeholder"
              rows="3"
            />
            <select
              v-else-if="field.type === 'select'"
              v-model="answers[field.id]"
              class="ticket-modal__select"
            >
              <option value="">Select...</option>
              <option
                v-for="opt in field.options ?? []"
                :key="opt"
                :value="opt"
              >
                {{ opt }}
              </option>
            </select>
          </div>
        </div>

        <div class="ticket-modal__footer">
          <button class="ticket-modal__cancel" @click="close">Cancel</button>
          <button
            class="ticket-modal__submit"
            :disabled="submitting"
            @click="submit"
          >
            {{ submitting ? 'Creating...' : 'Create Ticket' }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.15s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.ticket-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
}

.ticket-modal {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 1rem;
  width: 90%;
  max-width: 520px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem 0.75rem;
    border-bottom: 1px solid var(--color-border);
  }

  &__title {
    font-size: 1.15rem;
    font-weight: 600;
  }

  &__close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--color-fg-muted);
    line-height: 1;

    &:hover {
      color: var(--color-fg);
    }
  }

  &__body {
    padding: 1.25rem 1.5rem;
    overflow-y: auto;
    flex: 1;
  }

  &__intro {
    color: var(--color-fg-muted);
    font-size: 0.875rem;
    margin-bottom: 1.25rem;
  }

  &__error {
    background: rgba(237, 66, 69, 0.1);
    border: 1px solid var(--color-danger);
    color: var(--color-danger);
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.85rem;
    margin-bottom: 1rem;
  }

  &__field {
    margin-bottom: 1rem;
  }

  &__label {
    display: block;
    font-weight: 500;
    font-size: 0.85rem;
    margin-bottom: 0.35rem;
    color: var(--color-fg-secondary);
  }

  &__input {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    color: var(--color-fg);
    font-size: 0.9rem;

    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
  }

  &__textarea {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    color: var(--color-fg);
    font-size: 0.9rem;
    font-family: inherit;
    resize: vertical;

    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
  }

  &__select {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    color: var(--color-fg);
    font-size: 0.9rem;
  }

  &__categories {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  &__category-btn {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.5rem 0.85rem;
    border-radius: 0.5rem;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    color: var(--color-fg);
    cursor: pointer;
    font-size: 0.85rem;
    transition: all 0.15s ease;

    &:hover {
      border-color: var(--color-accent);
    }

    &--active {
      background: var(--color-accent);
      color: var(--color-accent-fg);
      border-color: var(--color-accent);
    }
  }

  &__category-emoji {
    font-size: 1.1rem;
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 0.75rem 1.5rem 1.25rem;
    border-top: 1px solid var(--color-border);
  }

  &__cancel {
    padding: 0.55rem 1.25rem;
    border-radius: 0.5rem;
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-fg);
    cursor: pointer;
    font-size: 0.875rem;

    &:hover {
      background: var(--color-bg-secondary);
    }
  }

  &__submit {
    padding: 0.55rem 1.5rem;
    border-radius: 0.5rem;
    background: var(--color-accent);
    color: var(--color-accent-fg);
    border: none;
    cursor: pointer;
    font-weight: 500;
    font-size: 0.875rem;

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    &:hover:not(:disabled) {
      opacity: 0.9;
    }
  }
}
</style>
