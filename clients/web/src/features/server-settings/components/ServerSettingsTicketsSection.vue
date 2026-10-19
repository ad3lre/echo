<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, onMounted, ref, watch } from 'vue';
import { useServerTicketsStore } from '@/features/tickets/serverTickets';
import type {
  EchoTicketConfig,
  EchoTicketCategory,
  EchoTicketFormField,
} from '@shared/types/ticket';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';

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
    dispatchAppToast(echoT('b15.tickets.saved'));
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
      {{ echoT('b15.tickets.loading') }}
    </div>
    <template v-else>
      <div v-if="loadError" class="server-settings-tickets__error" role="alert">
        <p>{{ loadError }}</p>
        <button
          type="button"
          class="server-settings-tickets__btn"
          @click="loadSettings"
        >
          {{ echoT('b15.tickets.retry') }}
        </button>
      </div>

      <section class="server-settings-tickets__section">
        <h3 class="server-settings-tickets__heading">
          {{ echoT('b15.tickets.title') }}
        </h3>
        <p class="server-settings-tickets__desc">
          {{ echoT('b15.tickets.desc') }}
        </p>

        <label class="server-settings-tickets__toggle">
          <input v-model="enabled" type="checkbox" />
          <span>{{ echoT('b15.tickets.enable') }}</span>
        </label>
      </section>

      <template v-if="enabled">
        <section class="server-settings-tickets__section">
          <h4 class="server-settings-tickets__subheading">
            {{ echoT('b15.tickets.catChannel') }}
          </h4>
          <p class="server-settings-tickets__hint">
            {{ echoT('b15.tickets.catChannelHint') }}
          </p>
          <select
            v-model="ticketCategoryId"
            class="server-settings-tickets__select"
          >
            <option :value="null">
              {{ echoT('b15.tickets.selectCategory') }}
            </option>
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
          <h4 class="server-settings-tickets__subheading">
            {{ echoT('b15.tickets.panelChannel') }}
          </h4>
          <p class="server-settings-tickets__hint">
            {{ echoT('b15.tickets.panelChannelHint') }}
          </p>
          <select
            v-model="panelChannelId"
            class="server-settings-tickets__select"
          >
            <option :value="null">
              {{ echoT('b15.tickets.selectChannel') }}
            </option>
            <option v-for="ch in textChannels" :key="ch.id" :value="ch.id">
              #{{ ch.name }}
            </option>
          </select>
          <p
            v-if="!textChannels.length"
            class="server-settings-tickets__empty-note"
          >
            {{ echoT('b15.tickets.noChannels') }}
          </p>
        </section>

        <section class="server-settings-tickets__section">
          <h4 class="server-settings-tickets__subheading">
            {{ echoT('b15.tickets.handlerRoles') }}
          </h4>
          <p class="server-settings-tickets__hint">
            {{ echoT('b15.tickets.handlerRolesHint') }}
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
              {{ echoT('b15.tickets.noRoles') }}
            </p>
          </div>
        </section>

        <section class="server-settings-tickets__section">
          <h4 class="server-settings-tickets__subheading">
            {{ echoT('b15.tickets.logChannel') }}
          </h4>
          <p class="server-settings-tickets__hint">
            {{ echoT('b15.tickets.logChannelHint') }}
          </p>
          <select
            v-model="logChannelId"
            class="server-settings-tickets__select"
          >
            <option :value="null">{{ echoT('b15.tickets.none') }}</option>
            <option v-for="ch in textChannels" :key="ch.id" :value="ch.id">
              #{{ ch.name }}
            </option>
          </select>
        </section>

        <section class="server-settings-tickets__section">
          <h4 class="server-settings-tickets__subheading">
            {{ echoT('b15.tickets.limits') }}
          </h4>
          <label class="server-settings-tickets__field">
            <span>{{ echoT('b15.tickets.maxOpen') }}</span>
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
          <h4 class="server-settings-tickets__subheading">
            {{ echoT('b15.tickets.greeting') }}
          </h4>
          <p class="server-settings-tickets__hint">
            {{ echoT('b15.tickets.greetingHint') }}
          </p>
          <textarea
            v-model="greetingMessage"
            class="server-settings-tickets__textarea"
            rows="3"
            :placeholder="echoT('b15.tickets.greetingPlaceholder')"
          />
        </section>

        <section class="server-settings-tickets__section">
          <h4 class="server-settings-tickets__subheading">
            {{ echoT('b15.tickets.categories') }}
          </h4>
          <p class="server-settings-tickets__hint">
            {{ echoT('b15.tickets.categoriesHint') }}
          </p>
          <label class="server-settings-tickets__toggle">
            <input v-model="requireCategory" type="checkbox" />
            <span>{{ echoT('b15.tickets.requireCategory') }}</span>
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
                :placeholder="echoT('b15.tickets.emoji')"
              />
              <input
                v-model="cat.name"
                class="server-settings-tickets__input server-settings-tickets__input--grow"
                :placeholder="echoT('b15.tickets.categoryName')"
              />
              <button
                class="server-settings-tickets__btn-danger"
                @click="removeCategory(cat.id)"
              >
                {{ echoT('b15.tickets.remove') }}
              </button>
            </div>
            <button class="server-settings-tickets__btn" @click="addCategory">
              {{ echoT('b15.tickets.addCategory') }}
            </button>
          </div>
        </section>

        <section class="server-settings-tickets__section">
          <h4 class="server-settings-tickets__subheading">
            {{ echoT('b15.tickets.customFields') }}
          </h4>
          <p class="server-settings-tickets__hint">
            {{ echoT('b15.tickets.customFieldsHint') }}
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
                :placeholder="echoT('b15.tickets.fieldLabel')"
              />
              <select
                v-model="field.type"
                class="server-settings-tickets__select--small"
              >
                <option value="text">
                  {{ echoT('b15.tickets.shortText') }}
                </option>
                <option value="textarea">
                  {{ echoT('b15.tickets.longText') }}
                </option>
                <option value="select">
                  {{ echoT('b15.tickets.dropdown') }}
                </option>
              </select>
              <label class="server-settings-tickets__toggle--inline">
                <input v-model="field.required" type="checkbox" />
                <span>{{ echoT('b15.tickets.required') }}</span>
              </label>
              <button
                class="server-settings-tickets__btn-danger"
                @click="removeFormField(field.id)"
              >
                {{ echoT('b15.tickets.remove') }}
              </button>
            </div>
            <button class="server-settings-tickets__btn" @click="addFormField">
              {{ echoT('b15.tickets.addField') }}
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
          {{ saving ? echoT('b15.tickets.saving') : echoT('b15.tickets.save') }}
        </button>
      </div>
    </template>
  </div>
</template>

<style
  scoped
  lang="scss"
  src="./styles/ServerSettingsTicketsSection.scss"
></style>
