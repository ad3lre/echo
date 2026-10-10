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

<style scoped lang="scss" src="./styles/TicketCreateModal.scss"></style>
