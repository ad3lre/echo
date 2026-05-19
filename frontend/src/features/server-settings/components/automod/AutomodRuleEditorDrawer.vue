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
import { AUTOMOD_MAX_NODES_PER_RULE, AUTOMOD_MAX_TREE_DEPTH } from '@shared/types/automod';
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

const props = defineProps<{
  open: boolean;
  mode: 'create' | 'edit';
  rule: EchoAutomodRule | null;
  serverId: string;
  token: string;
  capabilities: AutomodEffectiveCapabilities | undefined;
  allRules: EchoAutomodRule[];
  channelOptions: { id: string; name: string }[];
  roleOptions: { id: string; name: string }[];
}>();

const emit = defineEmits<{
  'update:open': [v: boolean];
  saved: [];
}>();

const store = useServerAutomodRulesStore();

const tab = ref<'conditions' | 'actions' | 'exemptions' | 'test'>(
  'conditions',
);
const advancedUi = ref(false);
const name = ref('');
const icon = ref('shield');
const enabled = ref(true);
const conditionTree = ref<AutomodGroupNode>(defaultAutomodConditionTree());
const actions = ref<AutomodAction[]>(defaultAutomodActions());
const exemptRoleIds = ref<string[]>([]);
const exemptChannelIds = ref<string[]>([]);
const logChannelId = ref<string | null>(null);
const saveError = ref<string | null>(null);
const saving = ref(false);

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
  advancedUi.value = false;
  tab.value = 'conditions';
  if (props.mode === 'create' || !props.rule) {
    name.value = 'New rule';
    icon.value = 'shield';
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
  () => [props.open, props.mode, props.rule?.id] as const,
  () => {
    if (props.open) resetFromRule();
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

function close() {
  emit('update:open', false);
}

async function save() {
  saveError.value = null;
  saving.value = true;
  try {
    if (props.mode === 'create') {
      await store.createRule(props.serverId, props.token, {
        name: name.value.trim() || 'Rule',
        icon: icon.value.trim() || 'shield',
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
        icon: icon.value.trim() || 'shield',
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
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[165] flex justify-end bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      @click.self="close"
    >
      <div
        class="flex h-full w-full max-w-lg flex-col border-l border-border bg-scrim-2 shadow-2xl"
        @click.stop
      >
        <header class="border-b border-border px-4 py-3">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="text-xs font-medium uppercase tracking-wide text-fg-subtle">
                AutoMod rule
              </div>
              <input
                v-model="name"
                class="mt-1 w-full border-0 border-b border-transparent bg-transparent text-lg font-semibold text-fg outline-none focus:border-border"
                maxlength="100"
              />
            </div>
            <button
              type="button"
              class="rounded-lg px-2 py-1 text-sm text-fg-subtle hover:bg-glass-1"
              @click="close"
            >
              Close
            </button>
          </div>
          <div class="mt-2 flex flex-wrap gap-3 text-xs">
            <label class="flex items-center gap-1 text-fg-soft">
              Icon
              <input
                v-model="icon"
                class="w-24 rounded border border-border bg-scrim-2 px-2 py-0.5 text-fg"
                maxlength="32"
              />
            </label>
            <label class="flex items-center gap-2 text-fg-soft">
              <input
                type="checkbox"
                :checked="enabled"
                @change="
                  enabled = ($event.target as HTMLInputElement).checked
                "
              />
              Enabled
            </label>
            <label class="flex items-center gap-2 text-fg-soft">
              <input
                type="checkbox"
                :checked="advancedUi"
                @change="
                  advancedUi = ($event.target as HTMLInputElement).checked
                "
              />
              Advanced condition UI
            </label>
          </div>
        </header>

        <div
          v-if="showCapabilityBanner"
          class="space-y-1 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-100"
        >
          <p v-if="capabilities && !capabilities.re2RegexAvailable">
            Regex conditions need the RE2 module on this server build.
          </p>
          <p v-if="capabilities && hasPunishOrRoleActions">
            Automated timeouts, kicks, bans, deletes, and role changes run as
            the server owner (id
            {{ capabilities.automodActorUserId.slice(0, 10) }}…). If the owner
            cannot act on a member, these actions may fail.
          </p>
        </div>

        <div class="flex border-b border-border px-2 text-sm">
          <button
            type="button"
            class="px-3 py-2 font-medium"
            :class="
              tab === 'conditions'
                ? 'border-b-2 border-accent text-fg'
                : 'text-fg-subtle hover:text-fg'
            "
            @click="tab = 'conditions'"
          >
            Conditions
          </button>
          <button
            type="button"
            class="px-3 py-2 font-medium"
            :class="
              tab === 'actions'
                ? 'border-b-2 border-accent text-fg'
                : 'text-fg-subtle hover:text-fg'
            "
            @click="tab = 'actions'"
          >
            Actions
          </button>
          <button
            type="button"
            class="px-3 py-2 font-medium"
            :class="
              tab === 'exemptions'
                ? 'border-b-2 border-accent text-fg'
                : 'text-fg-subtle hover:text-fg'
            "
            @click="tab = 'exemptions'"
          >
            Exemptions
          </button>
          <button
            type="button"
            class="px-3 py-2 font-medium"
            :class="
              tab === 'test'
                ? 'border-b-2 border-accent text-fg'
                : 'text-fg-subtle hover:text-fg'
            "
            @click="tab = 'test'"
          >
            Test
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p class="mb-2 text-xs text-fg-subtle">{{ statsLine }}</p>

          <div v-show="tab === 'conditions'">
            <AutomodConditionGroup
              v-model="conditionTree"
              :depth="1"
              :show-nested-controls="advancedUi"
              :rule-options="ruleOptions"
              :channel-options="channelOptions"
              :role-options="roleOptions"
              :re2-available="!!capabilities?.re2RegexAvailable"
            />
          </div>

          <div v-show="tab === 'actions'">
            <AutomodActionsEditor
              v-model="actions"
              :channel-options="channelOptions"
              :role-options="roleOptions"
            />
          </div>

          <div
            v-show="tab === 'exemptions'"
            class="space-y-4"
          >
            <div>
              <div class="mb-1 text-xs font-semibold text-fg-subtle">
                Exempt roles
              </div>
              <div class="max-h-40 overflow-y-auto rounded-lg border border-border p-2">
                <label
                  v-for="ro in roleOptions"
                  :key="ro.id"
                  class="flex items-center gap-2 py-0.5 text-sm"
                >
                  <input
                    type="checkbox"
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
                  {{ ro.name }}
                </label>
              </div>
            </div>
            <div>
              <div class="mb-1 text-xs font-semibold text-fg-subtle">
                Exempt channels
              </div>
              <div class="max-h-40 overflow-y-auto rounded-lg border border-border p-2">
                <label
                  v-for="ch in channelOptions"
                  :key="ch.id"
                  class="flex items-center gap-2 py-0.5 text-sm"
                >
                  <input
                    type="checkbox"
                    :checked="exemptChannelIds.includes(ch.id)"
                    @change="
                      (e) => {
                        const on = (e.target as HTMLInputElement).checked;
                        exemptChannelIds = on
                          ? [...exemptChannelIds.filter((x) => x !== ch.id), ch.id]
                          : exemptChannelIds.filter((x) => x !== ch.id);
                      }
                    "
                  />
                  {{ ch.name }}
                </label>
              </div>
            </div>
            <label class="block text-xs text-fg-subtle">
              Log / alert channel (optional)
              <select
                class="mt-1 w-full rounded-lg border border-border bg-scrim-2 px-2 py-1 text-sm text-fg"
                :value="logChannelId ?? ''"
                @change="
                  logChannelId =
                    ($event.target as HTMLSelectElement).value || null
                "
              >
                <option value="">None</option>
                <option
                  v-for="ch in channelOptions"
                  :key="ch.id"
                  :value="ch.id"
                >
                  {{ ch.name }}
                </option>
              </select>
            </label>
          </div>

          <div v-show="tab === 'test'">
            <AutomodTestPanel
              v-if="mode === 'edit' && rule"
              :server-id="serverId"
              :token="token"
              :rule="rule"
              :channel-options="channelOptions"
            />
            <p
              v-else
              class="text-sm text-fg-subtle"
            >
              Save the rule first to run tests against a stable rule id.
            </p>
          </div>

          <p
            v-if="saveError"
            class="mt-3 text-sm text-red-400"
          >
            {{ saveError }}
          </p>
        </div>

        <footer class="border-t border-border px-4 py-3">
          <button
            type="button"
            class="w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
            :disabled="saving"
            @click="save"
          >
            {{ saving ? 'Saving…' : mode === 'create' ? 'Create rule' : 'Save changes' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>
