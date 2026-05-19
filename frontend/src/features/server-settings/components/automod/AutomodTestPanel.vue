<script setup lang="ts">
import { ref } from 'vue';
import type { EchoAutomodRule } from '@shared/types/automod';
import type { AutomodTestAnnotation } from '@/api/echo/automod';
import { testEchoAutomodRule } from '@/services/http/echoAutomodTestHttp';
import AutomodAnnotationTree from './AutomodAnnotationTree.vue';

const props = defineProps<{
  serverId: string;
  token: string;
  rule: EchoAutomodRule;
  channelOptions: { id: string; name: string }[];
}>();

const sampleContent = ref('');
const sampleChannelId = ref(props.channelOptions[0]?.id ?? '');
const mentionCount = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);
const annotation = ref<AutomodTestAnnotation | null>(null);
const wouldMatch = ref(false);

async function runTest() {
  error.value = null;
  loading.value = true;
  try {
    const res = await testEchoAutomodRule(
      props.token,
      props.serverId,
      props.rule.id,
      {
        sampleContent: sampleContent.value,
        sampleChannelId: sampleChannelId.value || undefined,
        mentionCount: mentionCount.value,
      },
    );
    annotation.value = res.annotation;
    wouldMatch.value = res.wouldMatch;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Test failed';
    annotation.value = null;
  } finally {
    loading.value = false;
  }
}

function summarizeActions(r: EchoAutomodRule): string {
  return r.actions.map((a) => a.kind).join(', ');
}
</script>

<template>
  <div class="space-y-3">
    <p class="text-xs text-fg-subtle">
      Simulation uses your account as the author and does not apply actions.
    </p>
    <label class="block text-xs text-fg-subtle">
      Sample message
      <textarea
        v-model="sampleContent"
        rows="2"
        class="mt-1 w-full rounded-lg border border-border bg-scrim-2 px-2 py-1 text-sm text-fg"
      />
    </label>
    <label class="block text-xs text-fg-subtle">
      Channel
      <select
        v-model="sampleChannelId"
        class="mt-1 w-full rounded-lg border border-border bg-scrim-2 px-2 py-1 text-sm text-fg"
      >
        <option v-for="ch in channelOptions" :key="ch.id" :value="ch.id">
          {{ ch.name }}
        </option>
      </select>
    </label>
    <label class="block text-xs text-fg-subtle">
      Mention count
      <input
        v-model.number="mentionCount"
        type="number"
        min="0"
        class="mt-1 w-32 rounded-lg border border-border bg-scrim-2 px-2 py-1 text-sm text-fg"
      />
    </label>
    <button
      type="button"
      class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
      :disabled="loading"
      @click="runTest"
    >
      {{ loading ? 'Running…' : 'Run test' }}
    </button>
    <p v-if="error" class="text-sm text-red-400">
      {{ error }}
    </p>
    <div
      v-if="annotation"
      class="rounded-xl border border-border bg-scrim-2/40 p-3 text-sm"
    >
      <div class="mb-2 font-semibold text-fg">
        Result:
        <span :class="wouldMatch ? 'text-green-400' : 'text-fg-subtle'">
          {{ wouldMatch ? 'Would match' : 'Would not match' }}
        </span>
      </div>
      <div class="mb-2 text-xs text-fg-subtle">
        Actions if matched: {{ summarizeActions(rule) }}
      </div>
      <AutomodAnnotationTree :ann="annotation" />
    </div>
  </div>
</template>
