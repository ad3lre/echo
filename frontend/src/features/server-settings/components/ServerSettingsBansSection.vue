<script setup lang="ts">
import { computed, ref } from 'vue';
import { safeImageUrl } from '@/utils/safeImageUrl';

const MAX_UNBAN_REASON = 500;

type BanRow = {
  id: string;
  userName: string;
  userPfp: string;
  reason: string;
  moderator: string;
  expiresAt: string | null;
  createdAtLabel: string;
};

const props = defineProps<{
  banSearchQuery: string;
  banScopeFilter: 'all' | 'temporary' | 'permanent';
  banList: BanRow[];
  unbanMember: (banId: string, reason: string) => boolean | Promise<boolean>;
}>();

defineEmits<{
  'update:banSearchQuery': [value: string];
  'update:banScopeFilter': [value: 'all' | 'temporary' | 'permanent'];
}>();

const unbanTarget = ref<BanRow | null>(null);
const unbanReason = ref('');
const unbanSubmitting = ref(false);
const unbanError = ref('');

const canSubmitUnban = computed(
  () => unbanReason.value.trim().length > 0 && !unbanSubmitting.value,
);

function openUnbanModal(ban: BanRow) {
  unbanTarget.value = ban;
  unbanReason.value = '';
  unbanError.value = '';
}

function closeUnbanModal() {
  if (unbanSubmitting.value) return;
  unbanTarget.value = null;
  unbanReason.value = '';
  unbanError.value = '';
}

function onUnbanBackdropClick() {
  if (!unbanSubmitting.value) closeUnbanModal();
}

async function confirmUnban() {
  const target = unbanTarget.value;
  if (!target || !canSubmitUnban.value) return;
  unbanSubmitting.value = true;
  unbanError.value = '';
  try {
    const ok = await props.unbanMember(
      target.id,
      unbanReason.value.trim().slice(0, MAX_UNBAN_REASON),
    );
    if (ok) {
      unbanTarget.value = null;
      unbanReason.value = '';
    } else {
      unbanError.value = 'Could not unban. Please try again.';
    }
  } finally {
    unbanSubmitting.value = false;
  }
}
</script>

<template>
  <div class="roles-panel rounded-2xl p-5">
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center gap-3">
        <input
          :value="props.banSearchQuery"
          class="roles-toolbar-search min-w-0 flex-1"
          type="text"
          placeholder="Search banned members"
          @input="
            $emit(
              'update:banSearchQuery',
              ($event.target as HTMLInputElement).value,
            )
          "
        />
        <div class="inline-flex rounded-xl bg-glass-1 p-1">
          <button
            v-for="scope in ['all', 'temporary', 'permanent'] as const"
            :key="scope"
            type="button"
            class="rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors"
            :class="
              props.banScopeFilter === scope
                ? 'bg-glass-2 text-fg-strong'
                : 'text-fg-soft hover:text-fg'
            "
            @click="$emit('update:banScopeFilter', scope)"
          >
            {{
              scope === 'all'
                ? 'All'
                : scope === 'temporary'
                  ? 'Temporary'
                  : 'Permanent'
            }}
          </button>
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between gap-2">
          <div
            class="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle"
          >
            Banned Members
          </div>
          <div class="text-xs text-fg-subtle">
            {{ props.banList.length }} entries
          </div>
        </div>

        <div
          class="mt-4 max-h-[min(360px,40vh)] min-h-[12rem] overflow-y-auto custom-scrollbar"
        >
          <div class="divide-y divide-white/6">
            <div v-for="ban in props.banList" :key="ban.id" class="py-3">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0 flex items-start gap-3">
                  <img
                    :src="safeImageUrl(ban.userPfp)"
                    alt=""
                    class="h-9 w-9 shrink-0 rounded-full bg-glass-1 object-cover"
                  />
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <div class="truncate font-semibold text-fg-strong">
                        {{ ban.userName }}
                      </div>
                      <span
                        class="echo-status-pill rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                        :class="
                          ban.expiresAt
                            ? 'echo-status-pill--warn'
                            : 'echo-status-pill--danger'
                        "
                      >
                        {{ ban.expiresAt ? 'Temporary' : 'Permanent' }}
                      </span>
                    </div>
                    <div class="mt-1 text-sm text-fg-soft">
                      {{ ban.reason }}
                    </div>
                    <div class="mt-1 text-[11px] text-fg-subtle">
                      Banned by
                      <span class="font-semibold text-fg-soft">{{
                        ban.moderator
                      }}</span>
                      • {{ ban.createdAtLabel }}
                      <template v-if="ban.expiresAt">
                        • Expires {{ ban.expiresAt }}</template
                      >
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  class="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-fg-soft transition-colors hover:bg-glass-hover hover:text-fg"
                  @click="openUnbanModal(ban)"
                >
                  Unban
                </button>
              </div>
            </div>
          </div>
          <div
            v-if="!props.banList.length"
            class="py-12 text-center text-sm text-fg-subtle"
          >
            No bans match this filter.
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="unbanTarget"
        class="fixed inset-0 z-[160] flex items-center justify-center bg-overlay-heavy px-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unban-confirm-title"
        @click="onUnbanBackdropClick"
      >
        <div
          class="w-full max-w-md rounded-2xl border border-border bg-[var(--echo-server-dialog-bg)] p-5 shadow-xl"
          @click.stop
        >
          <h2 id="unban-confirm-title" class="text-lg font-semibold text-fg">
            Unban member
          </h2>
          <p class="mt-2 text-sm text-fg-soft">
            <span class="font-medium text-fg-soft">{{
              unbanTarget.userName
            }}</span>
            will be allowed to rejoin this server if they have a valid invite. A
            reason is required and is recorded in the audit log.
          </p>
          <label
            class="mt-4 block text-xs font-medium uppercase tracking-wide text-fg-subtle"
            for="unban-reason-input"
            >Reason for unban</label
          >
          <textarea
            id="unban-reason-input"
            v-model="unbanReason"
            class="mt-1.5 min-h-[88px] w-full resize-y rounded-lg border border-border bg-scrim-1 px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-indigo-400/50 focus:outline-none focus:ring-1 focus:ring-indigo-400/40"
            :maxlength="MAX_UNBAN_REASON"
            placeholder="Explain why this ban is being lifted"
            :disabled="unbanSubmitting"
            rows="3"
          />
          <div class="mt-1 text-right text-[11px] text-fg-subtle">
            {{ unbanReason.length }}/{{ MAX_UNBAN_REASON }}
          </div>
          <p v-if="unbanError" class="mt-2 text-sm echo-destructive-text">
            {{ unbanError }}
          </p>
          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-sm font-medium text-fg-soft transition-colors hover:bg-glass-1 hover:text-fg disabled:opacity-40"
              :disabled="unbanSubmitting"
              @click="closeUnbanModal"
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-emerald-600/90 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!canSubmitUnban"
              @click="confirmUnban"
            >
              {{ unbanSubmitting ? 'Unbanning…' : 'Confirm unban' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
