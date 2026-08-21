<script setup lang="ts">
const props = defineProps<{
  modelValue: string;
  editable?: boolean;
  placeholder?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

function onInput(ev: Event) {
  emit('update:modelValue', (ev.target as HTMLTextAreaElement).value);
}
</script>

<template>
  <textarea
    class="paper-raw-markdown-surface"
    :value="modelValue"
    :readonly="editable === false"
    :placeholder="placeholder ?? 'Markdown source…'"
    spellcheck="false"
    autocapitalize="off"
    autocomplete="off"
    autocorrect="off"
    @input="onInput"
  />
</template>

<style scoped>
.paper-raw-markdown-surface {
  display: block;
  width: 100%;
  min-height: 11in;
  margin: 0;
  padding: 2.5rem 2.5rem 3rem;
  border: 0;
  outline: none;
  resize: vertical;
  background: transparent;
  color: var(--paper-surface-fg);
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 0.8125rem;
  line-height: 1.65;
  tab-size: 2;
  white-space: pre-wrap;
  word-break: break-word;
}

.paper-raw-markdown-surface:focus {
  outline: none;
}

.paper-raw-markdown-surface::placeholder {
  color: var(--paper-surface-muted);
  opacity: 0.7;
}

@media (min-width: 768px) {
  .paper-raw-markdown-surface {
    padding: 3rem 2.5rem 3.5rem;
  }
}
</style>
