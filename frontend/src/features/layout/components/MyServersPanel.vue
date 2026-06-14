<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { watch, onMounted } from 'vue';
import { useServerStore } from '@/stores/server';
import { echoDevTrace } from '@/observability/echoDevTrace';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';

const props = defineProps<{
  open: boolean;
}>();
const emit = defineEmits<{
  'select-server': [serverId: string];
}>();

const serverStore = useServerStore();
const { servers: serverList, selectedServerId } = storeToRefs(serverStore);

onMounted(() => {
  echoDevTrace('my_servers_panel.mounted', {
    open: props.open,
    serverCount: serverList.value.length,
    serverIds: serverList.value.map((s) => s.id),
    selectedServerId: selectedServerId.value,
  });
});

watch(
  () => props.open,
  (open) => {
    echoDevTrace('my_servers_panel.open_changed', {
      open,
      serverCount: serverList.value.length,
      serverIds: serverList.value.map((s) => s.id),
      selectedServerId: selectedServerId.value,
    });
  },
);

watch(
  serverList,
  (value) => {
    echoDevTrace('my_servers_panel.server_list_changed', {
      serverCount: value.length,
      serverIds: value.map((s) => s.id),
    });
  },
  { deep: true },
);

watch(selectedServerId, (id) => {
  echoDevTrace('my_servers_panel.selected_server_changed', {
    selectedServerId: id,
  });
});
</script>

<template>
  <aside
    class="my-servers-panel relative z-[5] h-full min-w-0 overflow-hidden"
    :class="open ? 'pointer-events-auto' : 'pointer-events-none'"
  >
    <div
      class="my-servers-panel__inner flex h-full min-w-0 flex-col items-center justify-center overflow-hidden"
      :class="
        open
          ? 'my-servers-panel__inner--open'
          : 'my-servers-panel__inner--closed'
      "
    >
      <ul
        v-if="serverList.length > 0"
        class="custom-scrollbar flex max-h-[80vh] flex-col items-center gap-3 overflow-y-auto px-3 py-4"
      >
        <li v-for="server in serverList" :key="server.id">
          <button
            type="button"
            class="server-circle group flex h-12 w-12 items-center justify-center rounded-full transition-all"
            :class="
              server.id === selectedServerId
                ? 'server-circle--active'
                : 'server-circle--idle'
            "
            @click="emit('select-server', server.id)"
          >
            <PausedGifAvatar
              :src="serverGuildIconDisplayUrl(server.imageUrl)"
              :alt="server.name"
              img-class="h-10 w-10 rounded-full object-cover"
            />
          </button>
        </li>
      </ul>
      <div v-else class="px-3 text-center text-xs font-medium text-fg-soft">
        No servers found
      </div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.my-servers-panel {
  background:
    radial-gradient(circle at top left, var(--vue-auto-022), transparent 26%),
    radial-gradient(
      circle at bottom right,
      var(--vue-auto-217),
      transparent 34%
    ),
    linear-gradient(180deg, var(--vue-auto-023), var(--vue-auto-024));
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
}

.my-servers-panel__inner {
  transition:
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 200ms ease-out;
}

.my-servers-panel__inner--open {
  opacity: 1;
  transform: translateX(0);
}

.my-servers-panel__inner--closed {
  opacity: 0;
  transform: translateX(-18px);
}

.close-button {
  z-index: 2;
}

.server-circle {
  background: var(--vue-auto-090);
  box-shadow:
    0 0 0 1px var(--vue-auto-218),
    0 8px 18px var(--vue-auto-219);
}

.server-circle--idle:hover {
  transform: translateY(-1px);
  box-shadow:
    0 0 0 1px var(--vue-auto-220),
    0 10px 22px var(--vue-auto-221);
}

.server-circle--active {
  background: var(--vue-auto-222);
  box-shadow:
    0 0 0 2px var(--vue-auto-223),
    0 12px 26px var(--vue-auto-090);
}

.server-circle--active img {
  filter: saturate(1.1);
}

.server-circle__initials {
  font-size: 0.9rem;
  font-weight: 700;
  color: white;
}

.server-pill__avatar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.server-pill__avatar-inner {
  position: relative;
  height: 40px;
  width: 40px;
  border-radius: 999px;
  background:
    radial-gradient(circle at top left, var(--vue-auto-224), transparent 42%),
    var(--vue-auto-225);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 0 0 1px var(--vue-auto-226),
    0 10px 22px var(--vue-auto-227);
  overflow: hidden;
}

.server-pill__initials {
  font-size: 0.95rem;
  font-weight: 700;
  color: white;
}
</style>
