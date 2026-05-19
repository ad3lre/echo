<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  AutomodConditionNode,
  AutomodGroupNode,
  AutomodNode,
  AutomodAction,
  EchoAutomodRule,
} from '@shared/types/automod';
import type { AutomodEffectiveCapabilities } from '@shared/types/automod';
import {
  AUTOMOD_MAX_NODES_PER_RULE,
  AUTOMOD_MAX_TREE_DEPTH,
} from '@shared/types/automod';
import { useServerAutomodRulesStore } from '@/stores/serverAutomodRules';
import {
  countAutomodNodes,
  defaultAutomodActions,
  defaultAutomodConditionTree,
  maxAutomodDepth,
  newAutomodUiId,
} from './automodDefaults';
import AutomodConditionGroup from './AutomodConditionGroup.vue';
import AutomodActionsEditor from './AutomodActionsEditor.vue';
import AutomodTestPanel from './AutomodTestPanel.vue';
import RoleIconPickerField from '@/features/server-settings/components/RoleIconPickerField.vue';
import type { EmojiEntry } from '@/composables/useEmojiData';
import type { AppIconEntry } from '@/composables/useAppIconSearch';
import { uploadAutomodRuleIcon } from '@/features/server-settings/composables/useAutomodRuleIconUpload';
import { getTwemojiSrc } from '@/utils/twemoji';
import {
  automodRuleIconPickerUrl,
  defaultAutomodRuleIcon,
} from './automodRuleIcon';

const props = defineProps<{
  mode: 'create' | 'edit';
  rule: EchoAutomodRule | null;
  serverId: string;
  /** When false, icon picker is read-only. */
  canManage?: boolean;
  token: string;
  capabilities: AutomodEffectiveCapabilities | undefined;
  allRules: EchoAutomodRule[];
  channelOptions: { id: string; name: string }[];
  roleOptions: { id: string; name: string }[];
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const store = useServerAutomodRulesStore();

const advancedUi = ref(false);
const name = ref('');
const icon = ref(defaultAutomodRuleIcon());
const enabled = ref(true);
const conditionTree = ref<AutomodGroupNode>(defaultAutomodConditionTree());
const actions = ref<AutomodAction[]>(defaultAutomodActions());
const exemptRoleIds = ref<string[]>([]);
const exemptChannelIds = ref<string[]>([]);
const logChannelId = ref<string | null>(null);
const saveError = ref<string | null>(null);
const saving = ref(false);
const capBannerCollapsed = ref(false);
const exemptRoleSearch = ref('');
const exemptChannelSearch = ref('');

function ensureGroupRoot(node: AutomodNode): AutomodGroupNode {
  if (node.kind === 'group') return node;
  return {
    kind: 'group',
    id: newAutomodUiId(),
    combinator: 'AND',
    children: [node as AutomodConditionNode],
  };
}

function resetFromRule() {
  saveError.value = null;
  capBannerCollapsed.value = false;
  advancedUi.value = false;
  exemptRoleSearch.value = '';
  exemptChannelSearch.value = '';
  if (props.mode === 'create' || !props.rule) {
    name.value = 'New rule';
    icon.value = defaultAutomodRuleIcon();
    enabled.value = true;
    conditionTree.value = defaultAutomodConditionTree();
    actions.value = defaultAutomodActions();
    exemptRoleIds.value = [];
    exemptChannelIds.value = [];
    logChannelId.value = null;
    return;
  }
  const r = props.rule;
  name.value = r.name;
  icon.value = r.icon;
  enabled.value = r.enabled;
  conditionTree.value = ensureGroupRoot(
    JSON.parse(JSON.stringify(r.conditionTree)) as AutomodNode,
  );
  actions.value = JSON.parse(JSON.stringify(r.actions)) as AutomodAction[];
  exemptRoleIds.value = [...r.exemptRoleIds];
  exemptChannelIds.value = [...r.exemptChannelIds];
  logChannelId.value = r.logChannelId;
}

watch(
  () => [props.mode, props.rule?.id] as const,
  () => {
    resetFromRule();
  },
  { immediate: true },
);

const ruleOptions = computed(() =>
  props.allRules.map((r) => ({ id: r.id, name: r.name })),
);

const statsLine = computed(() => {
  const n = countAutomodNodes(conditionTree.value);
  const d = maxAutomodDepth(conditionTree.value);
  return `${n} / ${AUTOMOD_MAX_NODES_PER_RULE} nodes · depth ${d} / ${AUTOMOD_MAX_TREE_DEPTH}`;
});

const hasPunishOrRoleActions = computed(() =>
  actions.value.some((a) =>
    [
      'timeout',
      'kick',
      'ban',
      'delete_recent_messages',
      'add_role',
      'remove_role',
    ].includes(a.kind),
  ),
);

const showCapabilityBanner = computed(() => {
  const cap = props.capabilities;
  if (!cap) return false;
  if (!cap.re2RegexAvailable) return true;
  return hasPunishOrRoleActions.value;
});

const filteredExemptRoles = computed(() => {
  const q = exemptRoleSearch.value.trim().toLowerCase();
  if (!q) return props.roleOptions;
  return props.roleOptions.filter((r) => r.name.toLowerCase().includes(q));
});

const filteredExemptChannels = computed(() => {
  const q = exemptChannelSearch.value.trim().toLowerCase();
  if (!q) return props.channelOptions;
  return props.channelOptions.filter((c) => c.name.toLowerCase().includes(q));
});

const editorCanManage = computed(() => props.canManage !== false);

const automodIconPickerDisplayUrl = computed(() =>
  automodRuleIconPickerUrl(icon.value),
);

function onAutomodIconPickEntry(entry: EmojiEntry) {
  if (entry.kind === 'appIcon') return;
  if (entry.kind === 'custom' && entry.id && entry.imageUrl) {
    icon.value = entry.imageUrl.trim();
    return;
  }
  const src = getTwemojiSrc(entry.emoji);
  if (!src) return;
  icon.value = src;
}

function onAutomodIconPickAppIcon(entry: AppIconEntry) {
  const url = (entry.url ?? '').trim();
  if (!url) return;
  icon.value = url;
}

function onAutomodIconPickExternalUrl(url: string) {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return;
  icon.value = trimmed;
}

async function onAutomodIconUpload(file: File) {
  const url = await uploadAutomodRuleIcon(props.token, props.serverId, file);
  if (url) icon.value = url;
}

function onAutomodIconClear() {
  icon.value = defaultAutomodRuleIcon();
}

function close() {
  emit('close');
}

async function save() {
  saveError.value = null;
  saving.value = true;
  try {
    if (props.mode === 'create') {
      await store.createRule(props.serverId, props.token, {
        name: name.value.trim() || 'Rule',
        icon: icon.value.trim() || defaultAutomodRuleIcon(),
        enabled: enabled.value,
        triggerType: 'message.create',
        conditionTree: conditionTree.value,
        actions: actions.value,
        exemptRoleIds: exemptRoleIds.value,
        exemptChannelIds: exemptChannelIds.value,
        logChannelId: logChannelId.value,
      });
    } else if (props.rule) {
      await store.saveRule(props.serverId, props.token, props.rule.id, {
        name: name.value.trim() || 'Rule',
        icon: icon.value.trim() || defaultAutomodRuleIcon(),
        enabled: enabled.value,
        triggerType: 'message.create',
        conditionTree: conditionTree.value,
        actions: actions.value,
        exemptRoleIds: exemptRoleIds.value,
        exemptChannelIds: exemptChannelIds.value,
        logChannelId: logChannelId.value,
      });
    }
    emit('saved');
    close();
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Save failed';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div
    class="automod-rule-editor-v2 overflow-hidden rounded-2xl border border-border/90 bg-glass-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
  >
    <header
      class="sticky top-0 z-[2] flex flex-col gap-3 border-b border-border/80 bg-glass-2/95 px-4 py-3 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <div class="flex min-w-0 flex-1 items-start gap-3">
        <button
          type="button"
          class="mt-1 shrink-0 rounded-lg border border-border/80 px-2.5 py-1.5 text-xs font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-foreground"
          @click="close"
        >
          ← Rules
        </button>
        <div class="min-w-0 flex-1">
          <p
            class="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle"
          >
            {{ mode === 'create' ? 'New rule' : 'Edit rule' }}
          </p>
          <input
            v-model="name"
            type="text"
            maxlength="100"
            class="server-input mt-1.5 w-full max-w-xl font-semibold"
            placeholder="Rule name"
            autocomplete="off"
          />
          <div
            class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-fg-soft"
          >
            <label class="flex items-center gap-2">
              <span class="text-fg-subtle">Icon</span>
              <RoleIconPickerField
                class="self-center"
                :server-id="serverId"
                :disabled="!editorCanManage"
                :role-icon-url="automodIconPickerDisplayUrl || null"
                trigger-title="Rule icon"
                trigger-aria-label="Choose rule icon"
                @pick-entry="onAutomodIconPickEntry"
                @pick-app-icon="onAutomodIconPickAppIcon"
                @upload-file="onAutomodIconUpload"
                @pick-external-url="onAutomodIconPickExternalUrl"
                @clear="onAutomodIconClear"
              />
            </label>
            <label class="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                class="server-toggle"
                :checked="enabled"
                @change="enabled = ($event.target as HTMLInputElement).checked"
              />
              <span>Enabled</span>
            </label>
            <label class="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                class="server-toggle"
                :checked="advancedUi"
                @change="
                  advancedUi = ($event.target as HTMLInputElement).checked
                "
              />
              <span>Advanced tree</span>
            </label>
          </div>
        </div>
      </div>
      <div class="flex shrink-0 flex-wrap justify-end gap-2 sm:pt-1">
        <button
          type="button"
          class="rounded-xl border border-border px-4 py-2 text-sm font-medium text-fg-soft transition-colors hover:bg-glass-hover"
          :disabled="saving"
          @click="close"
        >
          Cancel
        </button>
      </div>
    </header>

    <div
      v-if="showCapabilityBanner && !capBannerCollapsed"
      class="relative space-y-1 border-b border-amber-500/25 bg-amber-500/10 px-4 py-2.5 pr-10 text-xs text-amber-100"
    >
      <button
        type="button"
        class="absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-amber-200/90 hover:bg-amber-500/20"
        aria-label="Dismiss notice"
        @click="capBannerCollapsed = true"
      >
        ×
      </button>
      <p v-if="capabilities && !capabilities.re2RegexAvailable">
        Regex conditions need the RE2 module on this server build.
      </p>
      <p v-if="capabilities && hasPunishOrRoleActions">
        Automated timeouts, kicks, bans, deletes, and role changes run as the
        server owner.
        <template v-if="capabilities.automodActorUserId">
          Actor id {{ capabilities.automodActorUserId.slice(0, 10) }}… — if the
          owner cannot act on a member, these actions may fail.
        </template>
      </p>
    </div>

    <div class="space-y-10 px-4 py-6 sm:px-6">
      <section class="scroll-mt-28">
        <div
          class="mb-4 flex flex-col gap-2 border-b border-border/60 pb-3 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <h3 class="settings-subtitle">Conditions</h3>
            <p class="mt-1 max-w-3xl text-xs leading-relaxed text-fg-soft">
              Match incoming messages against this tree. Narrow rules first;
              broad catch-alls last in the pipeline list.
            </p>
          </div>
          <p
            class="shrink-0 rounded-lg border border-border/60 bg-glass-2 px-2 py-1 font-mono text-[11px] text-fg-subtle"
          >
            {{ statsLine }}
          </p>
        </div>
        <AutomodConditionGroup
          v-model="conditionTree"
          :depth="1"
          :show-nested-controls="advancedUi"
          :rule-options="ruleOptions"
          :channel-options="channelOptions"
          :role-options="roleOptions"
          :re2-available="!!capabilities?.re2RegexAvailable"
        />
      </section>

      <section class="scroll-mt-28">
        <div class="mb-4 border-b border-border/60 pb-3">
          <h3 class="settings-subtitle">Actions</h3>
          <p class="mt-1 max-w-3xl text-xs leading-relaxed text-fg-soft">
            Executed when conditions match. Block stops the message from being
            stored; log alerts, channel notices, and DM-style warnings can still
            run for that send (best effort).
          </p>
        </div>
        <AutomodActionsEditor
          v-model="actions"
          :log-channel-id="logChannelId"
          :channel-options="channelOptions"
          :role-options="roleOptions"
        />
      </section>

      <section class="scroll-mt-28">
        <div class="mb-4 border-b border-border/60 pb-3">
          <h3 class="settings-subtitle">Exemptions &amp; logging</h3>
          <p class="mt-1 max-w-3xl text-xs leading-relaxed text-fg-soft">
            Skip trusted roles or slow channels. Set a log channel when you use
            the “Log channel alert” action (required on save). The same channel
            receives staff-visible “DM warning” text if configured; otherwise
            AutoMod tries the server owner’s DM with the member.
          </p>
        </div>
        <div class="grid gap-6 lg:grid-cols-2">
          <div>
            <label class="settings-label">Exempt roles</label>
            <input
              v-model="exemptRoleSearch"
              type="search"
              class="server-input mt-2 w-full"
              placeholder="Search roles…"
              autocomplete="off"
            />
            <div
              class="mt-2 max-h-52 overflow-y-auto rounded-xl border border-border/80 bg-glass-2/50 p-2 custom-scrollbar"
            >
              <label
                v-for="ro in filteredExemptRoles"
                :key="ro.id"
                class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-glass-hover"
              >
                <input
                  type="checkbox"
                  class="server-toggle shrink-0"
                  :checked="exemptRoleIds.includes(ro.id)"
                  @change="
                    (e) => {
                      const on = (e.target as HTMLInputElement).checked;
                      exemptRoleIds = on
                        ? [...exemptRoleIds.filter((x) => x !== ro.id), ro.id]
                        : exemptRoleIds.filter((x) => x !== ro.id);
                    }
                  "
                />
                <span class="truncate">{{ ro.name }}</span>
              </label>
              <p
                v-if="!filteredExemptRoles.length"
                class="px-2 py-4 text-center text-xs text-fg-soft"
              >
                No roles match this filter.
              </p>
            </div>
          </div>
          <div>
            <label class="settings-label">Exempt channels</label>
            <input
              v-model="exemptChannelSearch"
              type="search"
              class="server-input mt-2 w-full"
              placeholder="Search channels…"
              autocomplete="off"
            />
            <div
              class="mt-2 max-h-52 overflow-y-auto rounded-xl border border-border/80 bg-glass-2/50 p-2 custom-scrollbar"
            >
              <label
                v-for="ch in filteredExemptChannels"
                :key="ch.id"
                class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-glass-hover"
              >
                <input
                  type="checkbox"
                  class="server-toggle shrink-0"
                  :checked="exemptChannelIds.includes(ch.id)"
                  @change="
                    (e) => {
                      const on = (e.target as HTMLInputElement).checked;
                      exemptChannelIds = on
                        ? [
                            ...exemptChannelIds.filter((x) => x !== ch.id),
                            ch.id,
                          ]
                        : exemptChannelIds.filter((x) => x !== ch.id);
                    }
                  "
                />
                <span class="truncate">#{{ ch.name }}</span>
              </label>
              <p
                v-if="!filteredExemptChannels.length"
                class="px-2 py-4 text-center text-xs text-fg-soft"
              >
                No channels match this filter.
              </p>
            </div>
          </div>
        </div>
        <div class="mt-6 max-w-md">
          <label class="settings-label">Log / alert channel</label>
          <p class="mt-1 text-[11px] leading-snug text-fg-subtle">
            Required for “Log channel alert”. Optional for “DM warning” (staff
            copy); if empty, the warning is sent in the owner’s DM thread with
            the member when that thread can be opened.
          </p>
          <select
            class="server-input mt-2 w-full"
            :value="logChannelId ?? ''"
            @change="
              logChannelId = ($event.target as HTMLSelectElement).value || null
            "
          >
            <option value="">None</option>
            <option v-for="ch in channelOptions" :key="ch.id" :value="ch.id">
              #{{ ch.name }}
            </option>
          </select>
        </div>
      </section>

      <section class="scroll-mt-28">
        <div class="mb-4 border-b border-border/60 pb-3">
          <h3 class="settings-subtitle">Dry run</h3>
          <p class="mt-1 max-w-3xl text-xs leading-relaxed text-fg-soft">
            Trace how this rule evaluates sample text. New rules must be saved
            once before testing.
          </p>
        </div>
        <AutomodTestPanel
          v-if="mode === 'edit' && rule"
          :server-id="serverId"
          :token="token"
          :rule="rule"
          :channel-options="channelOptions"
        />
        <p
          v-else
          class="rounded-xl border border-dashed border-border/80 bg-glass-2/30 px-4 py-5 text-sm text-fg-soft"
        >
          Save the rule to unlock the simulator against a stable rule id.
        </p>
      </section>

      <p v-if="saveError" class="text-sm text-red-400">
        {{ saveError }}
      </p>
    </div>

    <footer
      class="sticky bottom-0 z-[2] flex flex-wrap justify-end gap-2 border-t border-border/80 bg-glass-2/95 px-4 py-3 backdrop-blur-md"
    >
      <button
        type="button"
        class="rounded-xl border border-border px-4 py-2 text-sm font-medium text-fg-soft transition-colors hover:bg-glass-hover"
        :disabled="saving"
        @click="close"
      >
        Cancel
      </button>
      <button
        type="button"
        class="rounded-xl bg-accent px-6 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        :disabled="saving"
        @click="save"
      >
        {{
          saving
            ? 'Saving…'
            : mode === 'create'
              ? 'Create rule'
              : 'Save changes'
        }}
      </button>
    </footer>
  </div>
</template>
