<script setup lang="ts">
import type { AutomodGroupNode } from '@shared/types/automod';
import type { AutomodTestAnnotation } from '@/api/echo/automod';

const props = withDefaults(
  defineProps<{
    ann: AutomodTestAnnotation;
    depth?: number;
  }>(),
  { depth: 0 },
);

function padStyle() {
  return { paddingLeft: `${8 + props.depth * 12}px` };
}
</script>

<template>
  <div>
    <template v-if="ann.node.kind === 'condition'">
      <div
        :class="
          ann.matched
            ? 'text-green-400'
            : 'text-fg-subtle line-through decoration-fg-subtle/50'
        "
        :style="padStyle()"
      >
        [{{ ann.node.field }} {{ ann.node.op }}]
      </div>
    </template>
    <template v-else>
      <div
        :class="ann.matched ? 'text-fg' : 'text-fg-subtle'"
        :style="padStyle()"
      >
        Group {{ (ann.node as AutomodGroupNode).combinator }}
      </div>
      <AutomodAnnotationTree
        v-for="(c, idx) in ann.children ?? []"
        :key="idx"
        :ann="c"
        :depth="depth + 1"
      />
    </template>
  </div>
</template>

<script lang="ts">
export default {
  name: 'AutomodAnnotationTree',
};
</script>
