<script setup lang="ts">
import { computed } from 'vue';
import type {
  AutomodConditionField,
  AutomodConditionNode,
  AutomodConditionOp,
  AutomodTimeWindow,
} from '@shared/types/automod';
import { AUTOMOD_FIELDS } from '@shared/types/automod';

const props = defineProps<{
  modelValue: AutomodConditionNode;
  ruleOptions: { id: string; name: string }[];
  channelOptions: { id: string; name: string }[];
  roleOptions: { id: string; name: string }[];
  re2Available: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [v: AutomodConditionNode];
}>();

const def = computed(() =>
  AUTOMOD_FIELDS.find((f) => f.field === props.modelValue.field),
);

const opChoices = computed((): AutomodConditionOp[] => def.value?.ops ?? []);

function patch(p: Partial<AutomodConditionNode>) {
  emit('update:modelValue', { ...props.modelValue, ...p });
}

function onFieldChange(field: AutomodConditionField) {
  const nextDef = AUTOMOD_FIELDS.find((f) => f.field === field);
  const firstOp = nextDef?.ops[0] ?? 'contains';
  let value: unknown = '';
  if (field === 'message.mention_count') value = 3;
  if (field === 'counter.prior_rule_hits')
    value = {
      ruleId: props.ruleOptions[0]?.id ?? '',
      window: '24h' as AutomodTimeWindow,
      min: 1,
    };
  if (
    field === 'counter.burst_messages' ||
    field === 'counter.duplicate_messages'
  )
    value = 3;
  if (field === 'channel.id') value = [];
  if (field === 'author.role_ids') value = [];
  patch({ field, op: firstOp, value });
}

function linesFromArray(v: unknown): string {
  if (!Array.isArray(v)) return '';
  return v.join('\n');
}

function setLinesValue(s: string) {
  const lines = s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  patch({ value: lines });
}

const channelLines = computed({
  get: () => linesFromArray(props.modelValue.value),
  set: setLinesValue,
});

const roleLines = computed({
  get: () => linesFromArray(props.modelValue.value),
  set: setLinesValue,
});

const priorRuleId = computed({
  get: () => {
    const v = props.modelValue.value;
    if (!v || typeof v !== 'object') return '';
    return String((v as { ruleId?: string }).ruleId ?? '');
  },
  set: (ruleId: string) => {
    const v = props.modelValue.value;
    const base =
      v && typeof v === 'object'
        ? (v as { window?: string; min?: number })
        : {};
    patch({
      value: {
        ruleId,
        window: (base.window as AutomodTimeWindow) ?? '24h',
        min: typeof base.min === 'number' ? base.min : 1,
      },
    });
  },
});

const priorWindow = computed({
  get: (): AutomodTimeWindow => {
    const v = props.modelValue.value;
    if (!v || typeof v !== 'object') return '24h';
    const w = String((v as { window?: string }).window ?? '24h');
    if (w === '1h' || w === '24h' || w === '7d' || w === '30d') return w;
    return '24h';
  },
  set: (window: AutomodTimeWindow) => {
    const v = props.modelValue.value;
    const base =
      v && typeof v === 'object'
        ? (v as { ruleId?: string; min?: number })
        : {};
    patch({
      value: {
        ruleId: String(base.ruleId ?? props.ruleOptions[0]?.id ?? ''),
        window,
        min: typeof base.min === 'number' ? base.min : 1,
      },
    });
  },
});

const priorMin = computed({
  get: (): number => {
    const v = props.modelValue.value;
    if (!v || typeof v !== 'object') return 1;
    const n = Number((v as { min?: unknown }).min);
    return Number.isFinite(n) ? n : 1;
  },
  set: (min: number) => {
    const v = props.modelValue.value;
    const base =
      v && typeof v === 'object'
        ? (v as { ruleId?: string; window?: string })
        : {};
    patch({
      value: {
        ruleId: String(base.ruleId ?? props.ruleOptions[0]?.id ?? ''),
        window:
          base.window === '1h' ||
          base.window === '24h' ||
          base.window === '7d' ||
          base.window === '30d'
            ? (base.window as AutomodTimeWindow)
            : '24h',
        min,
      },
    });
  },
});

const numValue = computed({
  get: (): number => {
    const n = Number(props.modelValue.value);
    return Number.isFinite(n) ? n : 0;
  },
  set: (n: number) => patch({ value: n }),
});

const regexBlocked = computed(
  () => props.modelValue.op === 'matches_regex_re2' && !props.re2Available,
);
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap gap-2">
      <select
        class="min-w-[10rem] rounded-lg border border-border bg-scrim-2 px-2 py-1 text-sm text-fg"
        :value="modelValue.field"
        @change="
          onFieldChange(
            ($event.target as HTMLSelectElement).value as AutomodConditionField,
          )
        "
      >
        <option v-for="f in AUTOMOD_FIELDS" :key="f.field" :value="f.field">
          {{ f.label }}
        </option>
      </select>
      <select
        class="rounded-lg border border-border bg-scrim-2 px-2 py-1 text-sm text-fg"
        :value="modelValue.op"
        @change="
          patch({
            op: ($event.target as HTMLSelectElement)
              .value as AutomodConditionOp,
          })
        "
      >
        <option v-for="op in opChoices" :key="op" :value="op">
          {{ op }}
        </option>
      </select>
      <label class="flex items-center gap-1 text-xs text-fg-soft">
        <input
          type="checkbox"
          :checked="!!modelValue.negate"
          @change="
            patch({ negate: ($event.target as HTMLInputElement).checked })
          "
        />
        Negate
      </label>
    </div>
    <p v-if="def?.help" class="text-xs text-fg-subtle">
      {{ def.help }}
    </p>
    <p v-if="regexBlocked" class="text-xs font-medium text-amber-400">
      Regex is disabled on this deployment (RE2 unavailable). Choose a different
      operator or contact hosting.
    </p>

    <template v-if="modelValue.field === 'message.content'">
      <textarea
        v-if="modelValue.op !== 'matches_regex_re2'"
        rows="2"
        class="w-full rounded-lg border border-border bg-scrim-2 px-3 py-2 text-sm text-fg"
        placeholder="Text to match"
        :value="String(modelValue.value ?? '')"
        @input="
          patch({
            value: ($event.target as HTMLTextAreaElement).value,
          })
        "
      />
      <input
        v-else
        :value="String(modelValue.value ?? '')"
        class="w-full rounded-lg border border-border bg-scrim-2 px-3 py-2 font-mono text-sm text-fg"
        :disabled="regexBlocked"
        @input="
          patch({
            value: ($event.target as HTMLInputElement).value,
          })
        "
      />
    </template>

    <input
      v-else-if="modelValue.field === 'message.mention_count'"
      v-model.number="numValue"
      type="number"
      min="0"
      max="200"
      class="w-32 rounded-lg border border-border bg-scrim-2 px-3 py-2 text-sm text-fg"
    />

    <div
      v-else-if="
        modelValue.field === 'counter.burst_messages' ||
        modelValue.field === 'counter.duplicate_messages'
      "
    >
      <input
        v-model.number="numValue"
        type="number"
        min="0"
        max="10000"
        class="w-32 rounded-lg border border-border bg-scrim-2 px-3 py-2 text-sm text-fg"
      />
    </div>

    <div
      v-else-if="modelValue.field === 'counter.prior_rule_hits'"
      class="flex flex-wrap gap-2"
    >
      <select
        v-model="priorRuleId"
        class="min-w-[8rem] max-w-[14rem] rounded-lg border border-border bg-scrim-2 px-2 py-1 text-sm text-fg"
      >
        <option disabled value="">Rule…</option>
        <option v-for="r in ruleOptions" :key="r.id" :value="r.id">
          {{ r.name }}
        </option>
      </select>
      <select
        v-model="priorWindow"
        class="rounded-lg border border-border bg-scrim-2 px-2 py-1 text-sm text-fg"
      >
        <option value="1h">1h</option>
        <option value="24h">24h</option>
        <option value="7d">7d</option>
        <option value="30d">30d</option>
      </select>
      <label class="flex items-center gap-1 text-xs text-fg-soft">
        ≥
        <input
          v-model.number="priorMin"
          type="number"
          min="0"
          max="10000"
          class="w-24 rounded-lg border border-border bg-scrim-2 px-2 py-1 text-sm text-fg"
        />
      </label>
    </div>

    <div v-else-if="modelValue.field === 'channel.id'">
      <div
        class="max-h-32 overflow-y-auto rounded-lg border border-border bg-scrim-2 p-2"
      >
        <label
          v-for="ch in channelOptions"
          :key="ch.id"
          class="flex cursor-pointer items-center gap-2 px-1 py-0.5 text-sm hover:bg-glass-1"
        >
          <input
            type="checkbox"
            :checked="
              Array.isArray(modelValue.value) &&
              modelValue.value.includes(ch.id)
            "
            @change="
              (e) => {
                const on = (e.target as HTMLInputElement).checked;
                const cur = Array.isArray(modelValue.value)
                  ? [...modelValue.value]
                  : [];
                patch({
                  value: on
                    ? [...cur.filter((id) => id !== ch.id), ch.id]
                    : cur.filter((id) => id !== ch.id),
                });
              }
            "
          />
          <span class="truncate">{{ ch.name }}</span>
          <span class="text-xs text-fg-subtle">({{ ch.id.slice(0, 8) }}…)</span>
        </label>
        <p v-if="!channelOptions.length" class="text-xs text-fg-subtle">
          No channels in structure — enter IDs in raw list.
        </p>
      </div>
      <textarea
        v-model="channelLines"
        rows="2"
        class="mt-2 w-full rounded-lg border border-border bg-scrim-2 px-3 py-2 font-mono text-xs text-fg"
        placeholder="Or one channel id per line"
      />
    </div>

    <div v-else-if="modelValue.field === 'author.role_ids'">
      <div
        class="max-h-32 overflow-y-auto rounded-lg border border-border bg-scrim-2 p-2"
      >
        <label
          v-for="ro in roleOptions"
          :key="ro.id"
          class="flex cursor-pointer items-center gap-2 px-1 py-0.5 text-sm hover:bg-glass-1"
        >
          <input
            type="checkbox"
            :checked="
              Array.isArray(modelValue.value) &&
              modelValue.value.includes(ro.id)
            "
            @change="
              (e) => {
                const on = (e.target as HTMLInputElement).checked;
                const cur = Array.isArray(modelValue.value)
                  ? [...modelValue.value]
                  : [];
                patch({
                  value: on
                    ? [...cur.filter((id) => id !== ro.id), ro.id]
                    : cur.filter((id) => id !== ro.id),
                });
              }
            "
          />
          <span class="truncate">{{ ro.name }}</span>
        </label>
      </div>
      <textarea
        v-model="roleLines"
        rows="2"
        class="mt-2 w-full rounded-lg border border-border bg-scrim-2 px-3 py-2 font-mono text-xs text-fg"
        placeholder="Or one role id per line"
      />
    </div>
  </div>
</template>
