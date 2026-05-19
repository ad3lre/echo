<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { EchoAutomodRule } from '@shared/types/automod';
import type { ChannelCategory } from '@/composables/useChannels';
import { useServerAutomodRulesStore } from '@/stores/serverAutomodRules';
import { isEchoGraphId } from '@/utils/echoIds';
import AutomodRuleCard from './AutomodRuleCard.vue';
import AutomodRuleEditorDrawer from './AutomodRuleEditorDrawer.vue';

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
  () => [props.serverId, props.accessToken] as const,
  async ([sid, tok]) => {
    if (!sid || !isEchoGraphId(sid) || !tok) return;
    try {
      await store.load(sid, tok);
    } catch {
      /* store.lastError */
    }
  },
  { immediate: true },
);

const rules = computed(() => store.rulesFor(props.serverId));
const capabilities = computed(() => store.capabilitiesFor(props.serverId));

const drawerOpen = ref(false);
const drawerMode = ref<'create' | 'edit'>('create');
const editingRule = ref<EchoAutomodRule | null>(null);

const dragSourceId = ref<string | null>(null);

function openCreate() {
  drawerMode.value = 'create';
  editingRule.value = null;
  drawerOpen.value = true;
}

function openEdit(r: EchoAutomodRule) {
  drawerMode.value = 'edit';
  editingRule.value = r;
  drawerOpen.value = true;
}

async function onToggle(r: EchoAutomodRule, enabled: boolean) {
  const tok = props.accessToken;
  if (!tok) return;
  try {
    await store.patchRuleEnabled(props.serverId, tok, r.id, enabled);
  } catch {
    /* revert on next load */
    await store.load(props.serverId, tok);
  }
}

async function onDelete(r: EchoAutomodRule) {
  const tok = props.accessToken;
  if (!tok) return;
  if (!confirm(`Delete rule “${r.name}”?`)) return;
  await store.removeRule(props.serverId, tok, r.id);
}

function onDragStart(id: string) {
  dragSourceId.value = id;
}

async function onSaved() {
  const tok = props.accessToken;
  if (tok && props.serverId) {
    try {
      await store.load(props.serverId, tok);
    } catch {
      /* ignore */
    }
  }
}

async function onDropOn(targetId: string) {
  const from = dragSourceId.value;
  dragSourceId.value = null;
  const tok = props.accessToken;
  if (!from || from === targetId || !tok || !props.canManage) return;
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
  <div class="server-settings-panel rounded-2xl p-5 xl:col-span-2">
    <div class="settings-subtitle mb-1">Custom AutoMod rules</div>
    <p class="mb-4 text-sm text-fg-subtle">
      Rules run in order after the built-in spam filter. Block actions stop the
      message before it is stored; other actions run after send.
    </p>

    <div
      v-if="!canManage"
      class="mb-4 rounded-xl border border-border bg-scrim-2/40 px-4 py-3 text-sm text-fg-subtle"
    >
      You need Manage Server to edit AutoMod rules.
    </div>

    <p
      v-if="store.lastError"
      class="mb-3 text-sm text-red-400"
    >
      {{ store.lastError }}
    </p>

    <div class="mb-3 flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-40"
        :disabled="!canManage || store.mutating"
        @click="openCreate"
      >
        New rule
      </button>
    </div>

    <div
      v-if="store.loadingServerId === serverId"
      class="text-sm text-fg-subtle"
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
      <p
        v-if="!rules.length"
        class="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-fg-subtle"
      >
        No custom rules yet. Add one to extend moderation beyond the spam
        toggle.
      </p>
    </div>

    <AutomodRuleEditorDrawer
      :open="drawerOpen"
      :mode="drawerMode"
      :rule="editingRule"
      :server-id="serverId"
      :token="accessToken ?? ''"
      :capabilities="capabilities"
      :all-rules="rules"
      :channel-options="channelOptions"
      :role-options="roleOptions"
      @update:open="drawerOpen = $event"
      @saved="onSaved"
    />
  </div>
</template>
