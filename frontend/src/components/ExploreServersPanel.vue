<script setup lang="ts">
import { computed, ref, unref } from 'vue';
import { PUBLIC_INVITE_BASE } from '@/config';
import { icons } from '@/assets/icons';
import { safeImageUrl } from '@/utils/safeImageUrl';
import { serverGuildIconDisplayUrl } from '@/utils/serverGuildIconDisplayUrl';
import PausedGifAvatar from '@/components/PausedGifAvatar.vue';
import { exploreDirectoryBlurb } from '@/utils/exploreDirectory';

type DiscoverableServer = {
  id?: string;
  name: string;
  pfp: string;
  banner?: string;
  description?: string;
  memberCount?: number;
  createdAt?: string;
};

const props = defineProps<{
  open: boolean;
  discoverableServers:
    | DiscoverableServer[]
    | import('vue').Ref<DiscoverableServer[]>;
}>();

const emit = defineEmits<{
  close: [];
  'create-server': [];
  'join-server': [inviteLink?: string];
  'join-suggested': [serverName: string];
}>();

const discoverableList = computed(() => unref(props.discoverableServers));

const inviteLink = ref('');

const inviteLinkPlaceholder = computed(
  () => `${PUBLIC_INVITE_BASE.replace(/\/$/, '')}/your-server`,
);

function bannerFor(server: DiscoverableServer): string {
  const b = server.banner?.trim();
  if (b) return b;
  return server.pfp;
}

const serverCards = computed(() =>
  discoverableList.value.map((server, index) => {
    const descriptionRaw = server.description?.trim() ?? '';
    return {
      ...server,
      id: `suggested-${index}`,
      banner: bannerFor(server),
      descriptionRaw,
      blurb: exploreDirectoryBlurb(server.description),
    };
  }),
);

function joinViaInvite() {
  emit('join-server', inviteLink.value.trim() || undefined);
}
</script>

<template>
  <aside
    class="explore-panel relative h-full min-w-0 overflow-hidden"
    :class="open ? 'pointer-events-auto' : 'pointer-events-none'"
  >
    <div
      class="explore-panel__inner flex h-full min-w-0 flex-col overflow-hidden"
      :class="
        open ? 'explore-panel__inner--open' : 'explore-panel__inner--closed'
      "
    >
      <div class="flex items-center justify-between gap-3 px-4 py-2.5">
        <div class="min-w-0">
          <div
            class="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle"
          >
            Discover
          </div>
          <h2 class="mt-0.5 truncate text-base font-bold text-foreground">
            Explore Servers
          </h2>
        </div>
      </div>

      <div class="custom-scrollbar flex-1 overflow-y-auto px-3 py-2.5">
        <section class="explore-widget rounded-xl p-3">
          <div class="flex items-start gap-2.5">
            <div class="explore-widget__icon bg-sky-500/18">
              <img :src="icons.plus" alt="" class="h-4 w-4 filter invert" />
            </div>
            <div class="min-w-0 flex-1">
              <h3 class="text-xs font-semibold text-foreground">
                Create your own server
              </h3>
              <p class="mt-0.5 text-[11px] leading-snug text-fg-soft">
                Start fresh with channels, roles, and a space that feels like
                yours.
              </p>
            </div>
          </div>
          <button
            type="button"
            class="explore-cta mt-2.5 w-full rounded-lg px-3 py-2 text-xs font-semibold text-white"
            @click="emit('create-server')"
          >
            Create Server
          </button>
        </section>

        <section class="explore-widget mt-2.5 rounded-xl p-3">
          <div class="flex items-start gap-2.5">
            <div class="explore-widget__icon bg-cyan-500/18">
              <img :src="icons.logIn" alt="" class="h-4 w-4 filter invert" />
            </div>
            <div class="min-w-0 flex-1">
              <h3 class="text-xs font-semibold text-foreground">
                Join with an invite
              </h3>
              <p class="mt-0.5 text-[11px] leading-snug text-fg-soft">
                Paste an invite link to jump into a server right away.
              </p>
            </div>
          </div>
          <label
            class="mt-2.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-fg-subtle"
          >
            Invite Link
          </label>
          <div class="mt-1.5 flex items-center gap-2">
            <input
              v-model="inviteLink"
              type="text"
              :placeholder="inviteLinkPlaceholder"
              class="explore-input min-w-0 flex-1 rounded-lg px-2.5 py-2 text-xs text-foreground outline-none"
            />
            <button
              type="button"
              class="explore-cta shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-white"
              @click="joinViaInvite"
            >
              Join
            </button>
          </div>
        </section>

        <section class="explore-widget mt-2.5 rounded-xl p-3">
          <div class="flex items-center justify-between gap-2">
            <div>
              <div
                class="text-[10px] font-bold uppercase tracking-[0.2em] text-fg-subtle"
              >
                Suggested
              </div>
              <h3 class="mt-0.5 text-xs font-semibold text-foreground">
                Communities to browse
              </h3>
            </div>
            <img
              :src="icons.exploreFilled"
              alt=""
              class="h-4 w-4 filter invert opacity-60"
            />
          </div>

          <div class="mt-2.5 flex flex-col gap-3">
            <article
              v-for="server in serverCards"
              :key="server.id"
              class="suggested-server group overflow-hidden rounded-xl"
            >
              <div
                class="suggested-server__banner relative h-[4.25rem] w-full shrink-0 overflow-hidden bg-[var(--echo-explore-banner-bg)]"
              >
                <div
                  class="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.03]"
                  :style="{
                    backgroundImage: `url(${safeImageUrl(server.banner)})`,
                  }"
                />
                <div
                  class="suggested-server__banner-scrim pointer-events-none absolute inset-0"
                />
                <div
                  class="pointer-events-none absolute left-2 top-2 rounded-full border border-border bg-scrim-2 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-fg-soft"
                >
                  Public
                </div>
              </div>
              <div
                class="suggested-server__body flex items-start gap-3 px-3 pb-3 pt-2"
              >
                <div
                  class="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl"
                >
                  <PausedGifAvatar
                    :src="serverGuildIconDisplayUrl(server.pfp)"
                    :alt="server.name"
                    :session-key="server.id ?? server.name"
                    img-class="rounded-xl object-cover"
                  />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-semibold text-foreground">
                    {{ server.name }}
                  </div>
                  <p
                    class="mt-1 line-clamp-2 text-[11px] leading-snug"
                    :class="
                      server.descriptionRaw
                        ? 'text-fg-soft'
                        : 'text-fg-subtle italic'
                    "
                  >
                    {{ server.blurb }}
                  </p>
                  <button
                    type="button"
                    class="suggested-server__join mt-2.5 w-full rounded-lg px-3 py-2 text-xs font-semibold text-white transition-colors"
                    @click="emit('join-suggested', server.name)"
                  >
                    Join server
                  </button>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.explore-panel {
  background:
    radial-gradient(circle at top left, var(--vue-auto-022), transparent 26%),
    radial-gradient(
      circle at bottom right,
      var(--vue-auto-027),
      transparent 30%
    ),
    linear-gradient(180deg, var(--vue-auto-023), var(--vue-auto-024));
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
}

:global([data-theme='light'] .explore-panel) {
  background: linear-gradient(180deg, var(--vue-auto-023), var(--vue-auto-024));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.explore-panel__inner {
  transition:
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 200ms ease-out;
}

.explore-panel__inner--open {
  opacity: 1;
  transform: translateX(0);
}

.explore-panel__inner--closed {
  opacity: 0;
  transform: translateX(-18px);
}

.explore-widget {
  background: linear-gradient(180deg, var(--vue-auto-138), var(--vue-auto-139));
  box-shadow:
    0 14px 36px var(--vue-auto-140),
    inset 0 1px 0 var(--vue-auto-010);
}

.explore-widget__icon {
  display: flex;
  height: 1.75rem;
  width: 1.75rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  box-shadow: inset 0 1px 0 var(--vue-auto-001);
}

.explore-cta {
  background: linear-gradient(180deg, var(--vue-auto-141), var(--vue-auto-142));
  box-shadow:
    inset 0 1px 0 var(--vue-auto-001),
    0 8px 18px var(--vue-auto-143);
  transition:
    background-color 0.18s ease-out,
    transform 0.18s ease-out;
}

.explore-cta:hover {
  background: linear-gradient(180deg, var(--vue-auto-144), var(--vue-auto-145));
  transform: translateY(-1px);
}

.explore-input {
  background: var(--vue-auto-146);
  box-shadow:
    inset 0 1px 0 var(--vue-auto-010),
    0 8px 18px var(--vue-auto-140);
}

.explore-input::placeholder {
  color: var(--vue-auto-073);
}

.suggested-server {
  background: linear-gradient(180deg, var(--vue-auto-074), var(--vue-auto-075));
  box-shadow:
    inset 0 1px 0 var(--vue-auto-010),
    0 8px 22px var(--vue-auto-076);
}

.suggested-server__banner-scrim {
  background: linear-gradient(
    180deg,
    var(--vue-auto-070) 0%,
    var(--vue-auto-148) 100%
  );
}

.suggested-server__body {
  margin-top: -1.25rem;
  position: relative;
  z-index: 1;
}

.suggested-server__join {
  background: linear-gradient(135deg, var(--vue-auto-149), var(--vue-auto-150));
  box-shadow: 0 6px 16px var(--vue-auto-151);
}

.suggested-server__join:hover {
  filter: brightness(1.08);
}
</style>
