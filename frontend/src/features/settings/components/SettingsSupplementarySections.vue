<script setup lang="ts">
import { computed, ref } from 'vue';
import EchoDropdown from '@/components/EchoDropdown.vue';
import SettingsDiscordLinkSection from '@/features/settings/components/SettingsDiscordLinkSection.vue';
import SettingsGoogleLinkSection from '@/features/settings/components/SettingsGoogleLinkSection.vue';
import SettingsYoutubeLinkSection from '@/features/settings/components/SettingsYoutubeLinkSection.vue';
import type { SettingsSection } from '@/features/settings/types';
import {
  ECHO_PLUS_COMING_SOON,
  PLAN_TIERS,
  subscriptionInvoicesForPlan,
  subscriptionTimelineForPlan,
} from '@/features/settings/data';
import type { EchoPlanId } from '@shared/echoPlanLimits';
import {
  ECHO_PLAN_MARK_URL,
  echoPlanMarkUrl,
} from '@/assets/subscriptionTierIcons';
import { storeToRefs } from 'pinia';
import { useDevSettingsStore } from '@/stores/devSettings';
import { useBugHunterStore } from '@/stores/bugHunter';
import {
  formatDateTimeForSelection,
  formatDateTimeWithPreferences,
} from '@/features/settings/timeLanguagePreferences';
import {
  eventToBindingString,
  KEYBIND_ACTION_ORDER,
  keybindActionTitle,
  loadKeybindMap,
  resetKeybindsToDefaults,
  saveKeybindMap,
  type KeybindActionId,
} from '@/features/settings/keybindPreferences';
import { useSettingsDataRights } from '@/features/settings/composables/useSettingsDataRights';
import type { SettingsForm } from '@/features/settings/composables/useSettingsForm';

interface DropdownOption {
  label: string;
  value: string;
}

interface SubscriptionTimelineItem {
  label: string;
  value: string;
}

interface InvoiceItem {
  id: string;
  date: string;
  amount: string;
  status: string;
}

const devSettings = useDevSettingsStore();
const { devModeIdsEnabled } = storeToRefs(devSettings);
const bugHunter = useBugHunterStore();
const { bugHunterEnabled } = storeToRefs(bugHunter);

const props = defineProps<{
  activeSection: SettingsSection;
  navigateToSection?: (section: SettingsSection) => void;
  form: SettingsForm;
  languageOptions: DropdownOption[];
  timezoneOptions: DropdownOption[];
  subscriptionTimeline: SubscriptionTimelineItem[];
  invoices: InvoiceItem[];
  echoPlan?: EchoPlanId;
}>();

const planTiers = PLAN_TIERS;
const freeTier = planTiers.find((t) => t.id === 'free')!;
const plusTier = planTiers.find((t) => t.id === 'plus')!;
const blackTier = planTiers.find((t) => t.id === 'black')!;
const billingCycle = ref<'monthly' | 'yearly'>('monthly');
const echoPlusLocked = computed(() => ECHO_PLUS_COMING_SOON);
const currentPlan = computed(() => props.echoPlan ?? 'free');
const activeSubscriptionTimeline = computed(() =>
  props.subscriptionTimeline.length
    ? props.subscriptionTimeline
    : subscriptionTimelineForPlan(currentPlan.value),
);
const activeInvoices = computed(() =>
  props.invoices.length
    ? props.invoices
    : subscriptionInvoicesForPlan(currentPlan.value),
);
const plusMarkUrl = ECHO_PLAN_MARK_URL.plus;
const blackMarkUrl = ECHO_PLAN_MARK_URL.black;
const heroMarkUrl = computed(() => echoPlanMarkUrl(currentPlan.value));
const editingActionId = ref<KeybindActionId | null>(null);
const keybindError = ref('');
const keybindMap = ref(loadKeybindMap());
const {
  dataExportInFlight,
  removalInFlight,
  showRemovalModal,
  removalPassword,
  removalConfirmText,
  removalModalError,
  downloadMyDataExport,
  openAccountRemovalModal,
  closeAccountRemovalModal,
  confirmAccountRemoval,
} = useSettingsDataRights();
const keybindRows = computed(() =>
  KEYBIND_ACTION_ORDER.map((id) => ({
    id,
    action: keybindActionTitle(id),
    binding: keybindMap.value[id],
  })),
);
const formattedNowPreview = computed(() => {
  const locale = props.form.uiLanguage as 'en-US' | 'en-GB';
  if (!locale || !props.form.timezone)
    return formatDateTimeWithPreferences(new Date());
  return formatDateTimeForSelection(locale, props.form.timezone, new Date());
});

function startEditingKeybind(actionId: KeybindActionId) {
  editingActionId.value = actionId;
  keybindError.value = '';
}

function cancelEditingKeybind() {
  editingActionId.value = null;
}

function updateBinding(actionId: KeybindActionId, e: KeyboardEvent) {
  e.preventDefault();
  if (e.key === 'Escape') {
    cancelEditingKeybind();
    return;
  }
  const next = eventToBindingString(e);
  if (!next || next === 'Ctrl' || next === 'Shift' || next === 'Alt') {
    keybindError.value = 'Use at least one non-modifier key.';
    return;
  }
  const conflict = (Object.keys(keybindMap.value) as KeybindActionId[]).find(
    (id) => id !== actionId && keybindMap.value[id] === next,
  );
  if (conflict) {
    keybindError.value = 'That shortcut is already assigned to another action.';
    return;
  }
  keybindMap.value = saveKeybindMap({ [actionId]: next });
  editingActionId.value = null;
  keybindError.value = '';
}

function resetDefaults() {
  keybindMap.value = resetKeybindsToDefaults();
  editingActionId.value = null;
  keybindError.value = '';
}
</script>

<template>
  <SettingsDiscordLinkSection v-if="activeSection === 'Discord'" />
  <SettingsGoogleLinkSection v-else-if="activeSection === 'Google'" />
  <SettingsYoutubeLinkSection
    v-else-if="activeSection === 'YouTube'"
    :navigate-to-section="navigateToSection"
  />

  <div
    v-else-if="activeSection === 'Data & Privacy'"
    class="flex flex-col gap-4"
  >
    <div class="settings-card rounded-2xl p-5">
      <div class="settings-label">Data Rights</div>
      <p class="mt-2 text-sm text-fg-soft">
        Access and deletion controls for your Echo account data.
      </p>
      <div class="mt-4 flex flex-col gap-3">
        <button
          type="button"
          class="settings-toggle"
          :disabled="dataExportInFlight"
          @click="downloadMyDataExport"
        >
          <span>
            <span class="block text-sm font-semibold text-foreground"
              >Download all my data</span
            >
            <span class="block text-sm text-muted"
              >Exports your account, sessions, friends, blocks, and DM metadata
              as JSON.</span
            >
          </span>
          <span class="text-xs font-semibold text-fg-soft">
            {{ dataExportInFlight ? 'Preparing…' : 'Export' }}
          </span>
        </button>
        <button
          type="button"
          class="settings-toggle"
          :disabled="removalInFlight"
          @click="openAccountRemovalModal"
        >
          <span>
            <span class="block text-sm font-semibold text-foreground"
              >Request account and data removal</span
            >
            <span class="block text-sm text-muted"
              >Permanently deletes your account and associated personal
              data.</span
            >
          </span>
          <span class="text-xs font-semibold text-red-600">
            {{ removalInFlight ? 'Removing…' : 'Delete' }}
          </span>
        </button>
      </div>
    </div>

    <div
      v-if="showRemovalModal"
      class="fixed inset-0 z-[160] flex items-center justify-center bg-overlay-heavy px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-account-title"
      @click.self="closeAccountRemovalModal"
    >
      <div
        class="w-full max-w-md rounded-2xl border border-red-400/30 bg-surface p-5 shadow-2xl"
      >
        <h3 id="remove-account-title" class="text-lg font-bold text-red-600">
          Confirm Account & Data Removal
        </h3>
        <p class="mt-2 text-sm text-fg-soft">
          This permanently deletes your Echo account and personal data. This
          action cannot be undone.
        </p>

        <label
          class="mt-4 block text-xs font-semibold uppercase tracking-wide text-fg-soft"
        >
          Password
          <input
            v-model="removalPassword"
            type="password"
            autocomplete="current-password"
            class="settings-input mt-2"
            placeholder="Enter your password"
          />
        </label>

        <label
          class="mt-3 block text-xs font-semibold uppercase tracking-wide text-fg-soft"
        >
          Type DELETE to confirm
          <input
            v-model="removalConfirmText"
            type="text"
            class="settings-input mt-2"
            placeholder="DELETE"
          />
        </label>

        <p v-if="removalModalError" class="mt-2 text-xs text-red-600">
          {{ removalModalError }}
        </p>

        <div class="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-semibold bg-glass-2 text-fg-soft hover:bg-glass-3"
            :disabled="removalInFlight"
            @click="closeAccountRemovalModal"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm font-semibold bg-red-500/80 text-white hover:bg-red-500 disabled:opacity-60"
            :disabled="removalInFlight"
            @click="confirmAccountRemoval"
          >
            {{ removalInFlight ? 'Removing…' : 'Permanently Delete' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <div
    v-else-if="activeSection === 'Keybinds'"
    class="settings-card rounded-2xl p-5"
  >
    <div class="flex items-center justify-between gap-3">
      <div class="settings-label">Keyboard Shortcuts</div>
      <button
        type="button"
        class="rounded-lg px-3 py-1.5 text-xs font-semibold bg-glass-1 text-fg-soft hover:bg-glass-2"
        @click="resetDefaults"
      >
        Reset defaults
      </button>
    </div>
    <div class="mt-4 flex flex-col gap-3">
      <div
        v-for="bind in keybindRows"
        :key="bind.id"
        class="settings-panel flex items-center justify-between gap-4 rounded-xl p-4"
      >
        <div>
          <div class="text-sm font-semibold text-foreground">
            {{ bind.action }}
          </div>
        </div>
        <button
          type="button"
          class="keycap min-w-[10rem] text-center"
          :class="
            editingActionId === bind.id ? 'ring-2 ring-indigo-400/70' : ''
          "
          @click="startEditingKeybind(bind.id)"
          @keydown="updateBinding(bind.id, $event)"
          @blur="cancelEditingKeybind"
        >
          {{
            editingActionId === bind.id
              ? 'Press new shortcut…'
              : bind.binding || '—'
          }}
        </button>
      </div>
      <p v-if="keybindError" class="text-xs text-red-600">{{ keybindError }}</p>
      <p class="text-xs text-muted">
        Click a shortcut and press a new key combo to change it.
      </p>
    </div>
  </div>

  <div
    v-else-if="activeSection === 'Time & Language'"
    class="grid gap-6 lg:grid-cols-2"
  >
    <div class="settings-card rounded-2xl p-6">
      <EchoDropdown
        v-model="form.uiLanguage"
        label="App Language"
        :options="languageOptions"
      />
      <div class="mt-6">
        <EchoDropdown
          v-model="form.timezone"
          label="Timezone"
          :options="timezoneOptions"
          :searchable="true"
        />
      </div>
    </div>
    <div class="settings-card rounded-2xl p-6 flex flex-col gap-3">
      <div class="settings-label">Current Preview</div>
      <div class="text-2xl font-bold text-foreground">
        {{ formattedNowPreview }}
      </div>
      <p class="text-sm text-muted">
        Message timestamps and date labels now follow these preferences across
        Echo.
      </p>
      <div class="settings-panel rounded-xl p-4 text-sm text-fg-soft">
        <div><span class="text-muted">Locale:</span> {{ form.uiLanguage }}</div>
        <div class="mt-1">
          <span class="text-muted">Timezone:</span> {{ form.timezone }}
        </div>
      </div>
    </div>
  </div>

  <div v-else-if="activeSection === 'Echo+'" class="flex flex-col gap-6 -mt-2">
    <div
      v-if="echoPlusLocked"
      class="rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-4 py-3 text-sm text-foreground"
    >
      Echo+ upgrades are
      <span class="font-semibold text-[color:var(--vc-settings-accent-fg)]"
        >coming soon</span
      >
      for everyone.
    </div>

    <!-- Hero -->
    <div
      class="premium-hero relative overflow-hidden rounded-2xl px-8 py-10 text-center"
      :class="{ 'opacity-80': echoPlusLocked }"
    >
      <div class="premium-hero__bg" aria-hidden="true" />
      <div class="relative z-10">
        <div class="premium-hero__mark-row mx-auto mb-4 flex justify-center">
          <img
            v-if="heroMarkUrl"
            :src="heroMarkUrl"
            class="premium-hero__mark premium-hero__mark--active h-14 w-14 sm:h-16 sm:w-16"
            :alt="currentPlan === 'black' ? 'Echo Black' : 'Echo+'"
            width="64"
            height="64"
            decoding="async"
            draggable="false"
          />
          <div
            v-else
            class="premium-hero__mark-duo flex items-center gap-3"
            aria-hidden="true"
          >
            <img
              :src="plusMarkUrl"
              class="premium-hero__mark h-12 w-12 sm:h-14 sm:w-14"
              alt=""
              width="56"
              height="56"
              decoding="async"
              draggable="false"
            />
            <img
              :src="blackMarkUrl"
              class="premium-hero__mark h-12 w-12 sm:h-14 sm:w-14"
              alt=""
              width="56"
              height="56"
              decoding="async"
              draggable="false"
            />
          </div>
        </div>
        <h2
          class="premium-hero__title text-3xl font-extrabold tracking-tight sm:text-4xl"
        >
          Upgrade your Echo
        </h2>
        <p
          class="premium-hero__lede mx-auto mt-3 max-w-lg text-sm leading-relaxed"
        >
          Unlock higher quality, bigger uploads, more customization, and premium
          perks. Pick the plan that fits you.
        </p>

        <div
          class="mt-5 inline-flex items-center gap-1 rounded-full bg-glass-1 p-1 backdrop-blur-sm"
        >
          <button
            type="button"
            :disabled="echoPlusLocked"
            class="rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all"
            :class="
              echoPlusLocked
                ? 'cursor-not-allowed text-fg-subtle'
                : billingCycle === 'monthly'
                  ? 'bg-indigo-500/80 text-white shadow-lg shadow-indigo-500/20'
                  : 'text-fg-subtle hover:text-fg-soft'
            "
            @click="!echoPlusLocked && (billingCycle = 'monthly')"
          >
            Monthly
          </button>
          <button
            type="button"
            :disabled="echoPlusLocked"
            class="rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all"
            :class="
              echoPlusLocked
                ? 'cursor-not-allowed text-fg-subtle'
                : billingCycle === 'yearly'
                  ? 'bg-indigo-500/80 text-white shadow-lg shadow-indigo-500/20'
                  : 'text-fg-subtle hover:text-fg-soft'
            "
            @click="!echoPlusLocked && (billingCycle = 'yearly')"
          >
            Yearly
            <span
              class="ml-1 font-extrabold text-[color:var(--set-positive-label-fg)]"
              >-20%</span
            >
          </button>
        </div>
      </div>
    </div>

    <!-- Pricing Cards -->
    <div class="grid gap-5 lg:grid-cols-3">
      <!-- Free -->
      <div
        class="premium-card premium-card--free relative flex flex-col rounded-2xl p-6"
        :class="{ 'premium-card--current': currentPlan === 'free' }"
      >
        <div class="premium-card__head">
          <div class="text-xs font-bold uppercase tracking-[0.2em] text-muted">
            {{ freeTier.name }}
          </div>
          <div class="mt-3 flex items-baseline gap-1">
            <span class="text-3xl font-extrabold text-foreground">{{
              freeTier.price
            }}</span>
          </div>
          <p class="mt-2 text-sm text-fg-subtle">{{ freeTier.tagline }}</p>
        </div>

        <div class="mt-6 flex flex-1 flex-col gap-2.5">
          <div
            v-for="(feat, i) in freeTier.features"
            :key="i"
            class="flex items-start gap-2.5 text-sm"
          >
            <svg
              class="mt-0.5 h-4 w-4 shrink-0 text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2.5"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span class="text-fg-soft">{{ feat.text }}</span>
          </div>
        </div>

        <button
          type="button"
          disabled
          class="mt-8 w-full rounded-xl py-3 text-sm font-bold uppercase tracking-wider"
          :class="
            currentPlan === 'free'
              ? 'cursor-default bg-glass-1 text-fg-subtle'
              : 'cursor-default bg-glass-1 text-fg-subtle opacity-60'
          "
        >
          {{ currentPlan === 'free' ? 'Current Plan' : 'Included' }}
        </button>
      </div>

      <!-- Echo+ -->
      <div
        class="premium-card premium-card--plus relative flex flex-col rounded-2xl p-6"
        :class="{ 'premium-card--current': currentPlan === 'plus' }"
      >
        <div
          v-if="plusTier.badge && currentPlan !== 'plus'"
          class="premium-badge premium-badge--plus"
        >
          {{ plusTier.badge }}
        </div>
        <div class="premium-card__head">
          <div class="flex items-center gap-3">
            <img
              :src="plusMarkUrl"
              class="premium-card__mark h-10 w-10 shrink-0"
              alt=""
              width="40"
              height="40"
              decoding="async"
              draggable="false"
              aria-hidden="true"
            />
            <div
              class="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--vc-settings-accent-fg)]"
            >
              {{ plusTier.name }}
            </div>
          </div>
          <div class="mt-3 flex items-baseline gap-1">
            <span class="text-3xl font-extrabold text-foreground">
              {{ billingCycle === 'yearly' ? '$7.99' : plusTier.price }}
            </span>
            <span class="text-sm text-fg-subtle">{{
              plusTier.period || '/mo'
            }}</span>
          </div>
          <p
            v-if="billingCycle === 'yearly'"
            class="mt-1 text-xs text-[color:var(--set-positive-label-fg)] opacity-90"
          >
            $95.88 billed annually
          </p>
          <p class="mt-2 text-sm text-fg-subtle">{{ plusTier.tagline }}</p>
        </div>

        <div class="mt-6 flex flex-1 flex-col gap-2.5">
          <div
            v-for="(feat, i) in plusTier.features"
            :key="i"
            class="flex items-start gap-2.5 text-sm"
          >
            <svg
              class="mt-0.5 h-4 w-4 shrink-0"
              :class="feat.highlight ? 'text-indigo-400' : 'text-indigo-400/50'"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2.5"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span
              :class="feat.highlight ? 'font-medium text-fg' : 'text-fg-soft'"
              >{{ feat.text }}</span
            >
          </div>
        </div>

        <button
          type="button"
          :disabled="echoPlusLocked || currentPlan === 'plus'"
          class="mt-8 w-full rounded-xl py-3 text-sm font-bold uppercase tracking-wider"
          :class="
            currentPlan === 'plus'
              ? 'cursor-default bg-glass-1 text-fg-subtle'
              : echoPlusLocked
                ? 'premium-cta premium-cta--plus cursor-not-allowed text-white opacity-55'
                : 'premium-cta premium-cta--plus text-white'
          "
        >
          {{
            currentPlan === 'plus'
              ? 'Current Plan'
              : echoPlusLocked
                ? 'Coming soon'
                : 'Upgrade to Echo+'
          }}
        </button>
      </div>

      <!-- Echo Black -->
      <div
        class="premium-card premium-card--black relative flex flex-col rounded-2xl p-6"
        :class="{ 'premium-card--current': currentPlan === 'black' }"
      >
        <div class="premium-card__head">
          <div class="flex items-center gap-3">
            <img
              :src="blackMarkUrl"
              class="premium-card__mark h-10 w-10 shrink-0"
              alt=""
              width="40"
              height="40"
              decoding="async"
              draggable="false"
              aria-hidden="true"
            />
            <div
              class="text-xs font-bold uppercase tracking-[0.2em] text-fg-soft"
            >
              {{ blackTier.name }}
            </div>
          </div>
          <div class="mt-3 flex items-baseline gap-1">
            <span class="text-3xl font-extrabold text-foreground">
              {{ billingCycle === 'yearly' ? '$15.99' : blackTier.price }}
            </span>
            <span class="text-sm text-fg-subtle">{{
              blackTier.period || '/mo'
            }}</span>
          </div>
          <p
            v-if="billingCycle === 'yearly'"
            class="mt-1 text-xs text-[color:var(--set-positive-label-fg)] opacity-90"
          >
            $191.88 billed annually
          </p>
          <p class="mt-2 text-sm text-fg-subtle">{{ blackTier.tagline }}</p>
        </div>

        <div class="mt-6 flex flex-1 flex-col gap-2.5">
          <div
            v-for="(feat, i) in blackTier.features"
            :key="i"
            class="flex items-start gap-2.5 text-sm"
          >
            <svg
              class="mt-0.5 h-4 w-4 shrink-0"
              :class="feat.highlight ? 'text-foreground' : 'text-muted'"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2.5"
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span
              :class="
                feat.highlight ? 'font-medium text-foreground' : 'text-fg-soft'
              "
              >{{ feat.text }}</span
            >
          </div>
        </div>

        <button
          type="button"
          :disabled="echoPlusLocked || currentPlan === 'black'"
          class="mt-8 w-full rounded-xl py-3 text-sm font-bold uppercase tracking-wider"
          :class="
            currentPlan === 'black'
              ? 'cursor-default bg-glass-1 text-fg-subtle'
              : echoPlusLocked
                ? 'premium-cta premium-cta--black cursor-not-allowed text-black opacity-55'
                : 'premium-cta premium-cta--black text-black'
          "
        >
          {{
            currentPlan === 'black'
              ? 'Current Plan'
              : echoPlusLocked
                ? 'Coming soon'
                : 'Go Black'
          }}
        </button>
      </div>
    </div>

    <!-- Comparison highlights -->
    <div class="settings-card rounded-2xl p-6">
      <div class="settings-label mb-5">Why upgrade?</div>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div class="premium-why-card rounded-xl p-5">
          <div class="mb-3 flex items-center gap-3">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/15"
            >
              <svg
                class="h-4.5 w-4.5 text-indigo-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <div class="text-sm font-bold text-foreground">Bigger uploads</div>
          </div>
          <p class="text-xs leading-relaxed text-muted">
            Share files up to 8 GB. No more compressing before sending.
          </p>
        </div>

        <div class="premium-why-card rounded-xl p-5">
          <div class="mb-3 flex items-center gap-3">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/15"
            >
              <svg
                class="h-4.5 w-4.5 text-indigo-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div class="text-sm font-bold text-foreground">
              Crystal-clear streaming
            </div>
          </div>
          <p class="text-xs leading-relaxed text-muted">
            Stream at up to 4K @ 60 FPS with studio-grade audio quality.
          </p>
        </div>

        <div class="premium-why-card rounded-xl p-5">
          <div class="mb-3 flex items-center gap-3">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/15"
            >
              <svg
                class="h-4.5 w-4.5 text-indigo-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                />
              </svg>
            </div>
            <div class="text-sm font-bold text-foreground">
              Full customization
            </div>
          </div>
          <p class="text-xs leading-relaxed text-muted">
            Unlock premium themes, profile effects, and true custom mode on
            Black.
          </p>
        </div>

        <div class="premium-why-card rounded-xl p-5">
          <div class="mb-3 flex items-center gap-3">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/15"
            >
              <svg
                class="h-4.5 w-4.5 text-indigo-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <div class="text-sm font-bold text-foreground">Larger groups</div>
          </div>
          <p class="text-xs leading-relaxed text-muted">
            Bring up to 250 people into a single group conversation.
          </p>
        </div>

        <div class="premium-why-card rounded-xl p-5">
          <div class="mb-3 flex items-center gap-3">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/15"
            >
              <svg
                class="h-4.5 w-4.5 text-indigo-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </div>
            <div class="text-sm font-bold text-foreground">
              Studio-grade audio
            </div>
          </div>
          <p class="text-xs leading-relaxed text-muted">
            256 kHz sample rate and raw compression mode for audiophiles.
          </p>
        </div>

        <div class="premium-why-card rounded-xl p-5">
          <div class="mb-3 flex items-center gap-3">
            <div
              class="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/15"
            >
              <svg
                class="h-4.5 w-4.5 text-indigo-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <div class="text-sm font-bold text-foreground">Early access</div>
          </div>
          <p class="text-xs leading-relaxed text-muted">
            Echo Black members get first look at new features before everyone
            else.
          </p>
        </div>
      </div>
    </div>
  </div>

  <div
    v-else-if="activeSection === 'Subscriptions'"
    class="flex flex-col gap-4"
  >
    <div
      v-if="heroMarkUrl"
      class="settings-card flex items-center gap-4 rounded-2xl p-5"
    >
      <img
        :src="heroMarkUrl"
        class="premium-hero__mark premium-hero__mark--active h-12 w-12 shrink-0"
        :alt="currentPlan === 'black' ? 'Echo Black' : 'Echo+'"
        width="48"
        height="48"
        decoding="async"
        draggable="false"
      />
      <div>
        <div class="settings-label">
          {{ currentPlan === 'black' ? 'Echo Black' : 'Echo+' }}
        </div>
        <p class="mt-1 text-sm text-fg-soft">
          Your subscription perks are active on this account.
        </p>
      </div>
    </div>
    <div class="grid gap-4 lg:grid-cols-2">
      <div class="settings-card rounded-2xl p-5">
        <div class="settings-label">Subscription Timeline</div>
        <div class="mt-4 flex flex-col gap-3">
          <div
            v-for="item in activeSubscriptionTimeline"
            :key="item.label"
            class="settings-panel rounded-xl p-4"
          >
            <div
              class="text-xs font-semibold uppercase tracking-[0.18em] text-muted"
            >
              {{ item.label }}
            </div>
            <div class="mt-2 text-sm text-fg">{{ item.value }}</div>
          </div>
        </div>
      </div>
    </div>
    <div v-if="activeInvoices.length" class="settings-card rounded-2xl p-5">
      <div class="settings-label">Invoices</div>
      <div class="mt-4 overflow-hidden rounded-xl border border-border">
        <div
          v-for="invoice in activeInvoices"
          :key="invoice.id"
          class="invoice-row grid grid-cols-[1.1fr_1fr_0.8fr_0.7fr] items-center gap-4 px-4 py-3 text-sm"
        >
          <div class="font-medium text-foreground">{{ invoice.id }}</div>
          <div class="text-fg-soft">{{ invoice.date }}</div>
          <div class="text-fg-soft">{{ invoice.amount }}</div>
          <div class="text-[color:var(--set-positive-label-fg)]">
            {{ invoice.status }}
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-else-if="activeSection === 'Advanced'" class="flex flex-col gap-6">
    <div class="settings-card rounded-2xl p-5">
      <div class="settings-label">Developer</div>
      <p class="mt-2 text-sm text-fg-soft">
        Shows internal IDs and diagnostics on this device only.
      </p>
      <button
        type="button"
        class="settings-toggle mt-4"
        @click="devSettings.setDevModeIdsEnabled(!devModeIdsEnabled)"
      >
        <span class="text-sm font-semibold text-foreground"
          >Developer Mode — this device only</span
        >
        <span
          :class="
            devModeIdsEnabled ? 'toggle-pill toggle-pill--on' : 'toggle-pill'
          "
        />
      </button>
    </div>
    <div class="settings-card rounded-2xl p-5">
      <div class="settings-label">Bug Hunter</div>
      <p class="mt-2 text-sm text-fg-soft">
        When enabled, Echo records detailed technical activity on this device
        only (socket traffic, API calls, and where you are in the app). Use the
        bug report button on the rail to send a report; the last few minutes of
        traces are included. Turning this off clears the buffer.
      </p>
      <button
        type="button"
        class="settings-toggle mt-4"
        @click="bugHunter.setBugHunterEnabled(!bugHunterEnabled)"
      >
        <span class="text-sm font-semibold text-foreground"
          >Bug Hunter mode (this device only)</span
        >
        <span
          :class="
            bugHunterEnabled ? 'toggle-pill toggle-pill--on' : 'toggle-pill'
          "
        />
      </button>
    </div>
  </div>
</template>
