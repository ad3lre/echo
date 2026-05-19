<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { EchoAutomodRule } from '@shared/types/automod';
import type { ChannelCategory } from '@/composables/useChannels';
import { useServerAutomodRulesStore } from '@/stores/serverAutomodRules';
import { isEchoGraphId } from '@/utils/echoIds';
import AutomodRuleCard from './AutomodRuleCard.vue';
import AutomodRuleEditorPanel from './AutomodRuleEditorPanel.vue';

const props = defineProps<{
  serverId: string;
  accessToken: string | null | undefined;
  canManage: boolean;
  structureCategories: ChannelCategory[];
  echoRoles: { id: string; name: string }[];
}>();

const store = useServerAutomodRulesStore();

const channelOptions = computed(() => {
  const out: { id: string; name: string }[] = [];
  for (const cat of props.structureCategories) {
    for (const ch of cat.channels) {
      out.push({ id: ch.id, name: ch.name });
    }
  }
  return out;
});

const roleOptions = computed(() => props.echoRoles);

watch(
  () => props.serverId,
  async (sid) => {
    if (!sid || !isEchoGraphId(sid)) return;
    try {
      /* `echoFetch` uses cookie session; token arg is ignored (see `transport.ts`). */
      await store.load(sid, '');
    } catch {
      /* store.lastError */
    }
  },
  { immediate: true },
);

const rules = computed(() => store.rulesFor(props.serverId));
const capabilities = computed(() => store.capabilitiesFor(props.serverId));

const editorActive = ref(false);
const editorMode = ref<'create' | 'edit'>('create');
const editingRule = ref<EchoAutomodRule | null>(null);

const dragSourceId = ref<string | null>(null);

function openCreate() {
  editorMode.value = 'create';
  editingRule.value = null;
  editorActive.value = true;
}

function openEdit(r: EchoAutomodRule) {
  editorMode.value = 'edit';
  editingRule.value = r;
  editorActive.value = true;
}

function closeEditor() {
  editorActive.value = false;
  editingRule.value = null;
}

async function onToggle(r: EchoAutomodRule, enabled: boolean) {
  const tok = props.accessToken?.trim() ?? '';
  try {
    await store.patchRuleEnabled(props.serverId, tok, r.id, enabled);
  } catch {
    await store.load(props.serverId, tok);
  }
}

async function onDelete(r: EchoAutomodRule) {
  const tok = props.accessToken?.trim() ?? '';
  if (!confirm(`Delete rule “${r.name}”?`)) return;
  await store.removeRule(props.serverId, tok, r.id);
}

function onDragStart(id: string) {
  dragSourceId.value = id;
}

async function onSaved() {
  const tok = props.accessToken?.trim() ?? '';
  if (!props.serverId) return;
  try {
    await store.load(props.serverId, tok);
  } catch {
    /* ignore */
  }
}

async function onDropOn(targetId: string) {
  const from = dragSourceId.value;
  dragSourceId.value = null;
  const tok = props.accessToken?.trim() ?? '';
  if (!from || from === targetId || !props.canManage) return;
  const list = rules.value.map((r) => r.id);
  const fi = list.indexOf(from);
  const ti = list.indexOf(targetId);
  if (fi < 0 || ti < 0) return;
  const next = [...list];
  next.splice(fi, 1);
  next.splice(ti, 0, from);
  try {
    await store.reorder(props.serverId, tok, next);
  } catch {
    await store.load(props.serverId, tok);
  }
}
</script>

<template>
  <div class="automod-rules-v2 space-y-4">
    <AutomodRuleEditorPanel
      v-if="editorActive"
      :mode="editorMode"
      :rule="editingRule"
      :server-id="serverId"
      :can-manage="canManage"
      :token="accessToken ?? ''"
      :capabilities="capabilities"
      :all-rules="rules"
      :channel-options="channelOptions"
      :role-options="roleOptions"
      @close="closeEditor"
      @saved="onSaved"
    />

    <template v-else>
      <div class="server-settings-panel rounded-2xl p-4 sm:p-5">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0 flex-1">
            <div class="settings-subtitle">AutoMod rules</div>
            <p class="mt-1.5 max-w-2xl text-sm leading-relaxed text-fg-subtle">
              Rules run in list order after the built-in spam gate. Block stops the message from being
              stored; other actions still run afterward (moderation, notices, log alerts, DMs when possible).
            </p>
            <ul class="mt-3 grid gap-2 text-xs text-fg-soft sm:grid-cols-2 lg:max-w-3xl">
              <li class="flex gap-2">
                <span class="font-semibold text-accent">1.</span>
                <span>Drag the grip to change priority.</span>
              </li>
              <li class="flex gap-2">
                <span class="font-semibold text-accent">2.</span>
                <span>Use the toggle to enable or pause without opening the editor.</span>
              </li>
              <li class="flex gap-2 sm:col-span-2">
                <span class="font-semibold text-accent">3.</span>
                <span>Edit opens the full inline builder: conditions, actions, exemptions, dry run.</span>
              </li>
            </ul>
          </div>
          <button
            type="button"
            class="h-fit shrink-0 self-start rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
            :disabled="!canManage || store.mutating"
            @click="openCreate"
          >
            New rule
          </button>
        </div>
      </div>

      <div
        v-if="!canManage"
        class="server-settings-panel rounded-2xl border border-border/60 px-4 py-3 text-sm text-fg-subtle"
      >
        You need Manage Server to edit AutoMod rules.
      </div>

      <p
        v-if="store.lastError"
        class="text-sm text-red-400"
      >
        {{ store.lastError }}
      </p>

      <div
        v-if="store.loadingServerId === serverId"
        class="text-sm text-fg-soft"
      >
        Loading rules…
      </div>
      <div
        v-else
        class="space-y-2"
      >
        <AutomodRuleCard
          v-for="r in rules"
          :key="r.id"
          :rule="r"
          :can-manage="canManage"
          @edit="openEdit(r)"
          @delete="onDelete(r)"
          @toggle-enabled="onToggle(r, $event)"
          @drag-start="onDragStart"
          @drag-end="dragSourceId = null"
          @drop-on="onDropOn"
        />
        <div
          v-if="!rules.length"
          class="server-settings-panel rounded-2xl border border-dashed border-border/70 px-6 py-10 text-center"
        >
          <p class="text-sm font-medium text-foreground">No custom rules yet</p>
          <p class="mx-auto mt-2 max-w-md text-sm text-fg-subtle">
            Start from a narrow condition (e.g. invite links) and add actions like block + DM
            notice. You can reorder anytime.
          </p>
          <button
            type="button"
            class="mt-5 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
            :disabled="!canManage || store.mutating"
            @click="openCreate"
          >
            Create first rule
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
