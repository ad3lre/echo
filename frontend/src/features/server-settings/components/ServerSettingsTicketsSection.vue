<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useServerTicketsStore } from '@/stores/serverTickets';
import type {
  EchoTicketConfig,
  EchoTicketCategory,
  EchoTicketFormField,
} from '@shared/types/ticket';
import { dispatchAppToast } from '@/utils/controllerMissingAction';

const props = defineProps<{
  serverId: string;
  accessToken: string | null | undefined;
  categories?: Array<{
    id: string;
    name: string;
    channels?: Array<{ id: string; name: string }>;
  }>;
  roles?: Array<{ id: string; name: string }>;
}>();

const ticketStore = useServerTicketsStore();

const loading = ref(true);
const loadError = ref<string | null>(null);
const saving = ref(false);

const enabled = ref(false);
const panelChannelId = ref<string | null>(null);
const ticketCategoryId = ref<string | null>(null);
const handlerRoleIds = ref<string[]>([]);
const logChannelId = ref<string | null>(null);
const maxOpenPerUser = ref(3);
const greetingMessage = ref('');
const requireCategory = ref(false);
const ticketCategories = ref<EchoTicketCategory[]>([]);
const formFields = ref<EchoTicketFormField[]>([]);

const assignableRoles = computed(() =>
  (props.roles ?? []).filter((r) => r.name !== '@everyone'),
);

const textChannels = computed(() => allChannels());

function allChannels(): Array<{ id: string; name: string }> {
  const all: Array<{ id: string; name: string }> = [];
  for (const cat of props.categories ?? []) {
    for (const ch of cat.channels ?? []) {
      all.push(ch);
    }
  }
  return all;
}

function syncFromConfig(config: EchoTicketConfig) {
  enabled.value = config.enabled;
  panelChannelId.value = config.panelChannelId;
  ticketCategoryId.value = config.ticketCategoryId;
  handlerRoleIds.value = [...config.handlerRoleIds];
  logChannelId.value = config.logChannelId;
  maxOpenPerUser.value = config.maxOpenPerUser;
  greetingMessage.value = config.greetingMessage;
  requireCategory.value = config.requireCategory;
  ticketCategories.value = [...config.ticketCategories];
  formFields.value = [...config.formFields];
}

async function loadSettings() {
  if (!props.serverId) {
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = null;
  try {
    /* Cookie session auth; bearer token is legacy only (see echoFetch). */
    await ticketStore.loadConfig(props.serverId, props.accessToken ?? '');
    const cfg = ticketStore.configFor(props.serverId);
    if (cfg) syncFromConfig(cfg);
    loadError.value = ticketStore.lastError;
  } finally {
    loading.value = false;
  }
}

onMounted(() => void loadSettings());

watch(
  () => props.serverId,
  () => void loadSettings(),
);

async function save() {
  if (!props.serverId) return;
  saving.value = true;
  const result = await ticketStore.saveConfig(
    props.serverId,
    props.accessToken ?? '',
    {
      enabled: enabled.value,
      panelChannelId: panelChannelId.value,
      ticketCategoryId: ticketCategoryId.value,
      handlerRoleIds: handlerRoleIds.value,
      logChannelId: logChannelId.value,
      maxOpenPerUser: maxOpenPerUser.value,
      greetingMessage: greetingMessage.value,
      requireCategory: requireCategory.value,
      ticketCategories: ticketCategories.value,
      formFields: formFields.value,
    },
  );
  saving.value = false;
  if (result) {
    syncFromConfig(result);
    dispatchAppToast('Ticket settings saved');
  } else if (ticketStore.lastError) {
    dispatchAppToast(ticketStore.lastError, 'warning');
  }
}

function addCategory() {
  ticketCategories.value.push({
    id: crypto.randomUUID(),
    name: '',
    emoji: '',
  });
}

function removeCategory(id: string) {
  ticketCategories.value = ticketCategories.value.filter((c) => c.id !== id);
}

function addFormField() {
  formFields.value.push({
    id: crypto.randomUUID(),
    label: '',
    type: 'textarea',
    required: false,
  });
}

function removeFormField(id: string) {
  formFields.value = formFields.value.filter((f) => f.id !== id);
}

function toggleHandlerRole(roleId: string) {
  if (handlerRoleIds.value.includes(roleId)) {
    handlerRoleIds.value = handlerRoleIds.value.filter((r) => r !== roleId);
  } else {
    handlerRoleIds.value = [...handlerRoleIds.value, roleId];
  }
}
</script>

<template>
  <div class="server-settings-tickets">
    <div v-if="loading" class="server-settings-tickets__loading">
      Loading ticket settings...
    </div>
    <template v-else>
      <div v-if="loadError" class="server-settings-tickets__error" role="alert">
        <p>{{ loadError }}</p>
        <button
          type="button"
          class="server-settings-tickets__btn"
          @click="loadSettings"
        >
          Retry
        </button>
      </div>

      <section class="server-settings-tickets__section">
        <h3 class="server-settings-tickets__heading">Ticket System</h3>
        <p class="server-settings-tickets__desc">
          Allow members to submit private reports and inquiries. Each ticket
          creates a private channel visible only to the submitter and your
          designated handler roles.
        </p>

        <label class="server-settings-tickets__toggle">
          <input v-model="enabled" type="checkbox" />
          <span>Enable ticket system</span>
        </label>
      </section>

      <template v-if="enabled">
        <section class="server-settings-tickets__section">
          <h4 class="server-settings-tickets__subheading">
            Ticket Channel Category
          </h4>
          <p class="server-settings-tickets__hint">
            New ticket channels will be created inside this category.
          </p>
          <select
            v-model="ticketCategoryId"
            class="server-settings-tickets__select"
          >
            <option :value="null">-- Select a category --</option>
            <option
              v-for="cat in props.categories ?? []"
              :key="cat.id"
              :value="cat.id"
            >
              {{ cat.name }}
            </option>
          </select>
        </section>

        <section class="server-settings-tickets__section">
          <h4 class="server-settings-tickets__subheading">Panel Channel</h4>
          <p class="server-settings-tickets__hint">
            The channel where the ticket creation widget will appear.
          </p>
          <select
            v-model="panelChannelId"
            class="server-settings-tickets__select"
          >
            <option :value="null">-- Select a channel --</option>
            <option v-for="ch in textChannels" :key="ch.id" :value="ch.id">
              #{{ ch.name }}
            </option>
          </select>
          <p
            v-if="!textChannels.length"
            class="server-settings-tickets__empty-note"
          >
            No text channels available. Create a channel under Structure first.
          </p>
        </section>

        <section class="server-settings-tickets__section">
          <h4 class="server-settings-tickets__subheading">Handler Roles</h4>
          <p class="server-settings-tickets__hint">
            Members with these roles can view and manage all tickets.
          </p>
          <div class="server-settings-tickets__role-list">
            <label
              v-for="role in assignableRoles"
              :key="role.id"
              class="server-settings-tickets__role-item"
            >
              <input
                type="checkbox"
                :checked="handlerRoleIds.includes(role.id)"
                @change="toggleHandlerRole(role.id)"
              />
              <span>{{ role.name }}</span>
            </label>
            <p
              v-if="!assignableRoles.length"
              class="server-settings-tickets__empty-note"
            >
              No roles available yet. Create roles under Server Settings →
              Roles.
            </p>
          </div>
        </section>

        <section class="server-settings-tickets__section">
          <h4 class="server-settings-tickets__subheading">Log Channel</h4>
          <p class="server-settings-tickets__hint">
            Optional channel for ticket activity logs.
          </p>
          <select
            v-model="logChannelId"
            class="server-settings-tickets__select"
          >
            <option :value="null">-- None --</option>
            <option v-for="ch in textChannels" :key="ch.id" :value="ch.id">
              #{{ ch.name }}
            </option>
          </select>
        </section>

        <section class="server-settings-tickets__section">
          <h4 class="server-settings-tickets__subheading">Limits</h4>
          <label class="server-settings-tickets__field">
            <span>Max open tickets per user</span>
            <input
              v-model.number="maxOpenPerUser"
              type="number"
              min="1"
              max="25"
              class="server-settings-tickets__input"
            />
          </label>
        </section>

        <section class="server-settings-tickets__section">
          <h4 class="server-settings-tickets__subheading">Greeting Message</h4>
          <p class="server-settings-tickets__hint">
            This message will be posted as the first message in every new ticket
            channel.
          </p>
          <textarea
            v-model="greetingMessage"
            class="server-settings-tickets__textarea"
            rows="3"
            placeholder="e.g. Thanks for reaching out! A staff member will be with you shortly."
          />
        </section>

        <section class="server-settings-tickets__section">
          <h4 class="server-settings-tickets__subheading">Ticket Categories</h4>
          <p class="server-settings-tickets__hint">
            Define types/categories users can choose from when submitting a
            ticket.
          </p>
          <label class="server-settings-tickets__toggle">
            <input v-model="requireCategory" type="checkbox" />
            <span>Require category selection</span>
          </label>
          <div class="server-settings-tickets__categories">
            <div
              v-for="cat in ticketCategories"
              :key="cat.id"
              class="server-settings-tickets__category-row"
            >
              <input
                v-model="cat.emoji"
                class="server-settings-tickets__input server-settings-tickets__input--emoji"
                placeholder="emoji"
              />
              <input
                v-model="cat.name"
                class="server-settings-tickets__input server-settings-tickets__input--grow"
                placeholder="Category name"
              />
              <button
                class="server-settings-tickets__btn-danger"
                @click="removeCategory(cat.id)"
              >
                Remove
              </button>
            </div>
            <button class="server-settings-tickets__btn" @click="addCategory">
              + Add Category
            </button>
          </div>
        </section>

        <section class="server-settings-tickets__section">
          <h4 class="server-settings-tickets__subheading">
            Custom Form Fields
          </h4>
          <p class="server-settings-tickets__hint">
            Additional fields shown in the ticket submission form (beyond
            subject).
          </p>
          <div class="server-settings-tickets__fields">
            <div
              v-for="field in formFields"
              :key="field.id"
              class="server-settings-tickets__field-row"
            >
              <input
                v-model="field.label"
                class="server-settings-tickets__input server-settings-tickets__input--grow"
                placeholder="Field label"
              />
              <select
                v-model="field.type"
                class="server-settings-tickets__select--small"
              >
                <option value="text">Short text</option>
                <option value="textarea">Long text</option>
                <option value="select">Dropdown</option>
              </select>
              <label class="server-settings-tickets__toggle--inline">
                <input v-model="field.required" type="checkbox" />
                <span>Required</span>
              </label>
              <button
                class="server-settings-tickets__btn-danger"
                @click="removeFormField(field.id)"
              >
                Remove
              </button>
            </div>
            <button class="server-settings-tickets__btn" @click="addFormField">
              + Add Field
            </button>
          </div>
        </section>
      </template>

      <div class="server-settings-tickets__actions">
        <button
          class="server-settings-tickets__save"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? 'Saving...' : 'Save Changes' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.server-settings-tickets {
  padding: 1.5rem;
  max-width: 700px;

  &__loading {
    color: var(--color-fg-muted);
    padding: 2rem 0;
  }

  &__error {
    margin-bottom: 1.25rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid var(--color-danger, #e55);
    background: color-mix(in srgb, var(--color-danger, #e55) 12%, transparent);
    color: var(--color-fg);
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  &__empty-note {
    font-size: 0.8125rem;
    color: var(--color-fg-muted);
    font-style: italic;
    margin-top: 0.35rem;
  }

  &__section {
    margin-bottom: 1.75rem;
  }

  &__heading {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  &__subheading {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 0.25rem;
  }

  &__desc,
  &__hint {
    color: var(--color-fg-muted);
    font-size: 0.875rem;
    margin-bottom: 0.75rem;
  }

  &__toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    margin-bottom: 0.5rem;
  }

  &__toggle--inline {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8rem;
  }

  &__select {
    width: 100%;
    max-width: 320px;
    padding: 0.5rem;
    border-radius: 0.5rem;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    color: var(--color-fg);
  }

  &__select--small {
    padding: 0.35rem 0.5rem;
    border-radius: 0.375rem;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    color: var(--color-fg);
    font-size: 0.8rem;
  }

  &__input {
    padding: 0.5rem;
    border-radius: 0.5rem;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    color: var(--color-fg);
    width: 80px;

    &--emoji {
      width: 50px;
      text-align: center;
    }

    &--grow {
      flex: 1;
    }
  }

  &__textarea {
    width: 100%;
    padding: 0.5rem;
    border-radius: 0.5rem;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    color: var(--color-fg);
    resize: vertical;
    font-family: inherit;
  }

  &__role-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  &__role-item {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.6rem;
    border-radius: 0.375rem;
    background: var(--color-bg-secondary);
    cursor: pointer;
    font-size: 0.85rem;
  }

  &__categories,
  &__fields {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  &__category-row,
  &__field-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  &__field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  &__btn {
    padding: 0.4rem 0.75rem;
    border-radius: 0.375rem;
    background: var(--color-accent);
    color: var(--color-accent-fg);
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
    align-self: flex-start;

    &:hover {
      opacity: 0.9;
    }
  }

  &__btn-danger {
    padding: 0.35rem 0.6rem;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--color-danger);
    border: 1px solid var(--color-danger);
    cursor: pointer;
    font-size: 0.8rem;

    &:hover {
      background: var(--color-danger);
      color: white;
    }
  }

  &__actions {
    padding-top: 1rem;
    border-top: 1px solid var(--color-border);
  }

  &__save {
    padding: 0.6rem 1.5rem;
    border-radius: 0.5rem;
    background: var(--color-accent);
    color: var(--color-accent-fg);
    border: none;
    cursor: pointer;
    font-weight: 500;
    font-size: 0.9rem;

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
