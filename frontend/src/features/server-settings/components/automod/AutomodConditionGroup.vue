<script setup lang="ts">
import { computed } from 'vue';
import type {
  AutomodConditionNode,
  AutomodGroupNode,
  AutomodNode,
} from '@shared/types/automod';
import { AUTOMOD_MAX_TREE_DEPTH } from '@shared/types/automod';
import { newAutomodUiId } from './automodDefaults';
import AutomodConditionLeaf from './AutomodConditionLeaf.vue';
import AutomodConditionGroup from './AutomodConditionGroup.vue';

const props = withDefaults(
  defineProps<{
    modelValue: AutomodGroupNode;
    depth?: number;
    /** When true, nested groups show combinator controls (depth &gt; 1). */
    showNestedControls?: boolean;
    ruleOptions: { id: string; name: string }[];
    channelOptions: { id: string; name: string }[];
    roleOptions: { id: string; name: string }[];
    re2Available: boolean;
  }>(),
  { depth: 1, showNestedControls: false },
);

const emit = defineEmits<{
  'update:modelValue': [v: AutomodGroupNode];
}>();

const showCombinator = computed(
  () => props.depth <= 1 || props.showNestedControls,
);

function patchGroup(patch: Partial<AutomodGroupNode>) {
  emit('update:modelValue', { ...props.modelValue, ...patch });
}

function setChild(i: number, node: AutomodNode) {
  const children = [...props.modelValue.children];
  children[i] = node;
  patchGroup({ children });
}

function removeChild(i: number) {
  const children = props.modelValue.children.filter((_, j) => j !== i);
  patchGroup({ children });
}

function addCondition() {
  const n: AutomodConditionNode = {
    kind: 'condition',
    id: newAutomodUiId(),
    field: 'message.content',
    op: 'contains',
    value: '',
  };
  patchGroup({ children: [...props.modelValue.children, n] });
}

function addSubgroup() {
  if (props.depth >= AUTOMOD_MAX_TREE_DEPTH) return;
  const g: AutomodGroupNode = {
    kind: 'group',
    id: newAutomodUiId(),
    combinator: 'AND',
    children: [
      {
        kind: 'condition',
        id: newAutomodUiId(),
        field: 'message.content',
        op: 'contains',
        value: '',
      },
    ],
  };
  patchGroup({ children: [...props.modelValue.children, g] });
}
</script>

<template>
  <div
    class="rounded-xl border border-border bg-scrim-2/40 p-3"
    :class="depth > 1 ? 'mt-2' : ''"
  >
    <div
      v-if="depth > 1 && !showNestedControls"
      class="mb-2 text-xs text-fg-subtle"
    >
      Nested group (enable “Advanced” above to edit combinator and inner
      structure).
    </div>

    <div
      v-if="showCombinator"
      class="mb-3 flex flex-wrap items-center gap-2"
    >
      <span class="text-xs text-fg-subtle">Match</span>
      <select
        class="rounded-lg border border-border bg-scrim-2 px-2 py-1 text-sm text-fg"
        :value="modelValue.combinator"
        @change="
          patchGroup({
            combinator:
              ($event.target as HTMLSelectElement).value === 'OR'
                ? 'OR'
                : 'AND',
          })
        "
      >
        <option value="AND">all of (AND)</option>
        <option value="OR">any of (OR)</option>
      </select>
    </div>

    <div class="space-y-2">
      <div
        v-for="(child, i) in modelValue.children"
        :key="child.id"
        class="flex gap-2 rounded-lg border border-border/60 bg-scrim-2/30 p-2"
      >
        <div class="min-w-0 flex-1">
          <AutomodConditionGroup
            v-if="child.kind === 'group'"
            :model-value="child"
            :depth="depth + 1"
            :show-nested-controls="showNestedControls"
            :rule-options="ruleOptions"
            :channel-options="channelOptions"
            :role-options="roleOptions"
            :re2-available="re2Available"
            @update:model-value="setChild(i, $event)"
          />
          <AutomodConditionLeaf
            v-else
            :model-value="child"
            :rule-options="ruleOptions"
            :channel-options="channelOptions"
            :role-options="roleOptions"
            :re2-available="re2Available"
            @update:model-value="setChild(i, $event)"
          />
        </div>
        <button
          type="button"
          class="shrink-0 self-start rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
          title="Remove"
          @click="removeChild(i)"
        >
          ✕
        </button>
      </div>
    </div>

    <div class="mt-3 flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-fg hover:bg-glass-1"
        @click="addCondition"
      >
        + Condition
      </button>
      <button
        v-if="depth < AUTOMOD_MAX_TREE_DEPTH"
        type="button"
        class="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-fg hover:bg-glass-1"
        @click="addSubgroup"
      >
        + Group
      </button>
    </div>
  </div>
</template>
