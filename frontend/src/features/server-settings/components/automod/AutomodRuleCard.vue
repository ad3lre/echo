<script setup lang="ts">
import { computed, ref } from 'vue';
import type { EchoAutomodRule } from '@shared/types/automod';
import { icons } from '@/assets/icons';

const props = defineProps<{
  rule: EchoAutomodRule;
  canManage: boolean;
  dragOver?: boolean;
}>();

const emit = defineEmits<{
  edit: [];
  delete: [];
  'toggle-enabled': [enabled: boolean];
  'drag-start': [id: string];
  'drop-on': [targetId: string];
  'drag-end': [];
}>();

const menuOpen = ref(false);

const summary = computed(() => {
  const acts = props.rule.actions.map((a) => a.kind).join(', ');
  return acts || 'No actions';
});

const hits = computed(() => props.rule.recentHitCount24h ?? 0);

function onDragStart(e: DragEvent) {
  if (!props.canManage) {
    e.preventDefault();
    return;
  }
  e.dataTransfer?.setData('text/plain', props.rule.id);
  e.dataTransfer!.effectAllowed = 'move';
  emit('drag-start', props.rule.id);
}

function onDragOver(e: DragEvent) {
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';
}

function onDrop() {
  emit('drop-on', props.rule.id);
}
</script>

<template>
  <div
    class="flex items-center gap-3 rounded-xl border border-border bg-scrim-2/40 px-3 py-2 transition"
    :class="[
      dragOver ? 'ring-2 ring-accent/40' : '',
      canManage ? 'cursor-grab active:cursor-grabbing' : '',
    ]"
    draggable="true"
    @dragstart="onDragStart"
    @dragend="$emit('drag-end')"
    @dragover="onDragOver"
    @drop="onDrop"
  >
    <img
      v-if="rule.icon && rule.icon.startsWith('http')"
      :src="rule.icon"
      alt=""
      class="h-9 w-9 shrink-0 rounded-lg object-cover"
    />
    <div
      v-else
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-lg"
      aria-hidden="true"
    >
      {{ rule.icon || '🛡️' }}
    </div>
    <div class="min-w-0 flex-1">
      <div class="truncate font-medium text-fg">{{ rule.name }}</div>
      <div class="truncate text-xs text-fg-subtle">{{ summary }}</div>
    </div>
    <div class="shrink-0 text-center text-xs text-fg-subtle">
      <div class="font-semibold text-fg">{{ hits }}</div>
      <div>24h</div>
    </div>
    <label
      class="shrink-0"
      @click.stop
    >
      <input
        type="checkbox"
        class="server-toggle"
        :disabled="!canManage"
        :checked="rule.enabled"
        @change="
          emit(
            'toggle-enabled',
            ($event.target as HTMLInputElement).checked,
          )
        "
      />
    </label>
    <div class="relative shrink-0">
      <button
        type="button"
        class="rounded-lg p-1.5 text-fg-subtle hover:bg-glass-1 hover:text-fg"
        :disabled="!canManage"
        aria-label="Rule menu"
        @click.stop="menuOpen = !menuOpen"
      >
        <img
          :src="icons.moreVertical"
          class="h-5 w-5 opacity-70"
          alt=""
        />
      </button>
      <div
        v-if="menuOpen"
        class="absolute right-0 top-full z-10 mt-1 min-w-[8rem] rounded-lg border border-border bg-scrim-2 py-1 shadow-lg"
      >
        <button
          type="button"
          class="block w-full px-3 py-1.5 text-left text-sm hover:bg-glass-1"
          @click="
            menuOpen = false;
            emit('edit');
          "
        >
          Edit
        </button>
        <button
          type="button"
          class="block w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-red-500/10"
          @click="
            menuOpen = false;
            emit('delete');
          "
        >
          Delete
        </button>
      </div>
    </div>
  </div>
</template>
