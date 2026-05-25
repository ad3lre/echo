<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useServerBannedWordsStore } from '@/stores/serverBannedWords';
import { isEchoGraphId } from '@/utils/echoIds';
import {
  BANNED_WORD_CATEGORIES,
  BANNED_WORD_CATEGORY_LABELS,
  BANNED_WORD_CATEGORY_DESCRIPTIONS,
  BANNED_WORD_PRESET_LEVELS,
  BANNED_WORD_PRESET_LABELS,
  BANNED_WORD_PRESET_DESCRIPTIONS,
  BANNED_WORD_PRESET_DEFAULTS,
  BANNED_WORD_ACTION_KINDS,
  BANNED_WORD_ACTION_LABELS,
  BANNED_WORDS_MAX_CUSTOM_WORDS,
  BANNED_WORDS_MAX_WORD_LENGTH,
  type BannedWordPresetLevel,
  type BannedWordCategory,
  type BannedWordActionKind,
  type BannedWordCategoryConfig,
} from '@shared/types/bannedWords';

const props = defineProps<{
  serverId: string;
  canManage: boolean;
  echoRoles: { id: string; name: string }[];
}>();

const store = useServerBannedWordsStore();

watch(
  () => props.serverId,
  async (sid) => {
    if (!sid || !isEchoGraphId(sid)) return;
    try {
      await store.load(sid, '');
    } catch {
      /* store.lastError */
    }
  },
  { immediate: true },
);

const config = computed(() => store.configFor(props.serverId));

const draftLevel = ref<BannedWordPresetLevel>('off');
const draftCategories = ref<
  Record<BannedWordCategory, BannedWordCategoryConfig>
>({
  profanity: { enabled: false, action: 'block_message' },
  slurs: { enabled: false, action: 'block_message' },
  sexual_content: { enabled: false, action: 'block_message' },
  insults: { enabled: false, action: 'block_message' },
});
const draftCustomWords = ref('');
const draftExemptRoleIds = ref<string[]>([]);

watch(
  config,
  (c) => {
    draftLevel.value = c.presetLevel;
    draftCategories.value = { ...c.categories };
    draftCustomWords.value = c.customWords.join('\n');
    draftExemptRoleIds.value = [...c.exemptRoleIds];
  },
  { immediate: true },
);

watch(draftLevel, (level) => {
  if (level === 'off') {
    for (const cat of BANNED_WORD_CATEGORIES) {
      draftCategories.value[cat] = { enabled: false, action: 'block_message' };
    }
  } else if (level !== 'custom' && level in BANNED_WORD_PRESET_DEFAULTS) {
    const defaults =
      BANNED_WORD_PRESET_DEFAULTS[
        level as keyof typeof BANNED_WORD_PRESET_DEFAULTS
      ];
    for (const cat of BANNED_WORD_CATEGORIES) {
      draftCategories.value[cat] = { ...defaults[cat] };
    }
  }
});

const hasChanges = computed(() => {
  const c = config.value;
  if (draftLevel.value !== c.presetLevel) return true;
  const wordsArr = draftCustomWords.value
    .split('\n')
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 0);
  if (JSON.stringify(wordsArr) !== JSON.stringify(c.customWords)) return true;
  if (
    JSON.stringify(draftExemptRoleIds.value) !== JSON.stringify(c.exemptRoleIds)
  )
    return true;
  for (const cat of BANNED_WORD_CATEGORIES) {
    if (
      draftCategories.value[cat].enabled !== c.categories[cat]?.enabled ||
      draftCategories.value[cat].action !== c.categories[cat]?.action
    )
      return true;
  }
  return false;
});

const customWordCount = computed(() => {
  return draftCustomWords.value.split('\n').filter((w) => w.trim().length > 0)
    .length;
});

const saveError = ref<string | null>(null);

async function onSave() {
  saveError.value = null;
  const wordsArr = draftCustomWords.value
    .split('\n')
    .map((w) => w.trim().toLowerCase().slice(0, BANNED_WORDS_MAX_WORD_LENGTH))
    .filter((w) => w.length > 0)
    .slice(0, BANNED_WORDS_MAX_CUSTOM_WORDS);
  try {
    await store.save(props.serverId, '', {
      presetLevel: draftLevel.value,
      categories: draftCategories.value,
      customWords: wordsArr,
      exemptRoleIds: draftExemptRoleIds.value,
    });
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Failed to save';
  }
}

function toggleExemptRole(roleId: string) {
  const idx = draftExemptRoleIds.value.indexOf(roleId);
  if (idx >= 0) {
    draftExemptRoleIds.value.splice(idx, 1);
  } else {
    draftExemptRoleIds.value.push(roleId);
  }
}
</script>

<template>
  <div class="space-y-6">
    <section class="settings-section-stack">
      <div
        class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
      >
        <div class="min-w-0 flex-1">
          <div class="settings-subtitle">Banned Words</div>
          <p class="mt-1.5 max-w-2xl text-sm leading-relaxed text-fg-subtle">
            Choose a preset level to automatically filter messages containing
            inappropriate language, or customize which categories to enable and
            what action each takes.
          </p>
        </div>
      </div>
    </section>

    <p v-if="!canManage" class="text-sm text-fg-subtle">
      You need Manage Server to edit the word filter.
    </p>

    <p v-if="store.lastError" class="text-sm text-red-400">
      {{ store.lastError }}
    </p>

    <div v-if="store.loadingServerId === serverId" class="text-sm text-fg-soft">
      Loading configuration…
    </div>

    <template v-else>
      <!-- Preset level picker -->
      <section class="server-settings-panel rounded-2xl p-5">
        <div class="settings-subtitle mb-4">Filter Level</div>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <button
            v-for="level in BANNED_WORD_PRESET_LEVELS"
            :key="level"
            type="button"
            class="rounded-xl px-4 py-3 text-left transition"
            :class="[
              draftLevel === level
                ? 'border-2 border-accent bg-accent/10'
                : 'border border-glass-2 bg-glass-1 hover:bg-glass-2',
            ]"
            :disabled="!canManage"
            @click="draftLevel = level"
          >
            <div class="text-sm font-semibold text-fg">
              {{ BANNED_WORD_PRESET_LABELS[level] }}
            </div>
            <div class="mt-1 text-xs text-fg-subtle">
              {{ BANNED_WORD_PRESET_DESCRIPTIONS[level] }}
            </div>
          </button>
        </div>
      </section>

      <!-- Per-category config (visible when not "off") -->
      <section
        v-if="draftLevel !== 'off'"
        class="server-settings-panel rounded-2xl p-5"
      >
        <div class="settings-subtitle mb-4">Categories</div>
        <div class="space-y-3">
          <div
            v-for="cat in BANNED_WORD_CATEGORIES"
            :key="cat"
            class="flex flex-col gap-3 rounded-xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            :class="draftCategories[cat].enabled ? 'bg-glass-1' : 'opacity-60'"
          >
            <div class="min-w-0 flex-1">
              <label class="flex items-center gap-3">
                <input
                  type="checkbox"
                  class="server-toggle shrink-0"
                  :checked="draftCategories[cat].enabled"
                  :disabled="!canManage || draftLevel !== 'custom'"
                  @change="
                    draftCategories[cat] = {
                      ...draftCategories[cat],
                      enabled: ($event.target as HTMLInputElement).checked,
                    }
                  "
                />
                <div>
                  <div class="text-sm font-semibold text-fg">
                    {{ BANNED_WORD_CATEGORY_LABELS[cat as BannedWordCategory] }}
                  </div>
                  <div class="text-xs text-fg-subtle">
                    {{
                      BANNED_WORD_CATEGORY_DESCRIPTIONS[
                        cat as BannedWordCategory
                      ]
                    }}
                  </div>
                </div>
              </label>
            </div>
            <select
              class="echo-settings-field w-full rounded-lg px-3 py-2 text-sm outline-none sm:w-48"
              :disabled="
                !canManage ||
                !draftCategories[cat].enabled ||
                draftLevel !== 'custom'
              "
              :value="draftCategories[cat].action"
              @change="
                draftCategories[cat] = {
                  ...draftCategories[cat],
                  action: ($event.target as HTMLSelectElement)
                    .value as BannedWordActionKind,
                }
              "
            >
              <option
                v-for="ak in BANNED_WORD_ACTION_KINDS"
                :key="ak"
                :value="ak"
              >
                {{ BANNED_WORD_ACTION_LABELS[ak] }}
              </option>
            </select>
          </div>
        </div>
        <p v-if="draftLevel !== 'custom'" class="mt-3 text-xs text-fg-soft">
          Switch to <strong>Custom</strong> to change individual categories and
          actions.
        </p>
      </section>

      <!-- Custom words -->
      <section
        v-if="draftLevel !== 'off'"
        class="server-settings-panel rounded-2xl p-5"
      >
        <div class="settings-subtitle mb-2">Custom Words</div>
        <p class="mb-3 text-xs text-fg-subtle">
          Add extra words or phrases to filter (one per line). These are always
          blocked regardless of category settings.
        </p>
        <textarea
          class="echo-settings-field min-h-[100px] w-full rounded-lg px-3 py-2 text-sm outline-none"
          :disabled="!canManage"
          :value="draftCustomWords"
          placeholder="badword&#10;another phrase"
          @input="
            draftCustomWords = ($event.target as HTMLTextAreaElement).value
          "
        />
        <p class="mt-1 text-xs text-fg-soft">
          {{ customWordCount }} / {{ BANNED_WORDS_MAX_CUSTOM_WORDS }} words
        </p>
      </section>

      <!-- Exempt roles -->
      <section
        v-if="draftLevel !== 'off'"
        class="server-settings-panel rounded-2xl p-5"
      >
        <div class="settings-subtitle mb-2">Exempt Roles</div>
        <p class="mb-3 text-xs text-fg-subtle">
          Members with any of these roles bypass the word filter entirely.
          Admins and Manage Server/Messages holders are always exempt.
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="role in echoRoles"
            :key="role.id"
            type="button"
            class="rounded-lg px-3 py-1.5 text-xs font-medium transition"
            :class="
              draftExemptRoleIds.includes(role.id)
                ? 'bg-accent text-white'
                : 'bg-glass-1 text-fg-subtle hover:bg-glass-2'
            "
            :disabled="!canManage"
            @click="toggleExemptRole(role.id)"
          >
            {{ role.name }}
          </button>
        </div>
        <p v-if="echoRoles.length === 0" class="text-xs text-fg-soft">
          No roles available.
        </p>
      </section>

      <!-- Save button -->
      <div class="flex items-center gap-4">
        <button
          type="button"
          class="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
          :disabled="!canManage || store.saving || !hasChanges"
          @click="onSave"
        >
          {{ store.saving ? 'Saving…' : 'Save Changes' }}
        </button>
        <p v-if="saveError" class="text-sm text-red-400">
          {{ saveError }}
        </p>
        <p
          v-else-if="!hasChanges && draftLevel !== 'off'"
          class="text-xs text-fg-soft"
        >
          No unsaved changes.
        </p>
      </div>
    </template>
  </div>
</template>
