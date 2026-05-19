<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AutomodAction, AutomodDeleteRecentMinutes } from '@shared/types/automod';
import { AUTOMOD_DELETE_RECENT_MINUTES } from '@shared/types/automod';

const props = defineProps<{
  modelValue: AutomodAction[];
  channelOptions: { id: string; name: string }[];
  roleOptions: { id: string; name: string }[];
}>();

const emit = defineEmits<{
  'update:modelValue': [v: AutomodAction[]];
}>();

const addKind = ref<string>('');

const hasBlock = computed(() =>
  props.modelValue.some((a) => a.kind === 'block_message'),
);
const hasDeleteRecent = computed(() =>
  props.modelValue.some((a) => a.kind === 'delete_recent_messages'),
);

function patchAll(next: AutomodAction[]) {
  emit('update:modelValue', next);
}

function removeAt(i: number) {
  patchAll(props.modelValue.filter((_, j) => j !== i));
}

function patchAt(i: number, a: AutomodAction) {
  const next = [...props.modelValue];
  next[i] = a;
  patchAll(next);
}

function addSelected() {
  const k = addKind.value;
  if (!k) return;
  let a: AutomodAction | null = null;
  if (k === 'block_message') a = { kind: 'block_message', phase: 'pre_send' };
  if (k === 'delete_recent_messages')
    a = {
      kind: 'delete_recent_messages',
      phase: 'must_succeed_post',
      windowMinutes: 5,
    };
  if (k === 'timeout')
    a = { kind: 'timeout', phase: 'must_succeed_post', minutes: 10 };
  if (k === 'kick') a = { kind: 'kick', phase: 'must_succeed_post' };
  if (k === 'ban') a = { kind: 'ban', phase: 'must_succeed_post' };
  if (k === 'warn_user_dm')
    a = { kind: 'warn_user_dm', phase: 'best_effort_post', text: '' };
  if (k === 'alert_log_channel')
    a = { kind: 'alert_log_channel', phase: 'best_effort_post', text: '' };
  if (k === 'system_notice_in_channel')
    a = {
      kind: 'system_notice_in_channel',
      phase: 'best_effort_post',
      text: '',
    };
  if (k === 'add_role')
    a = {
      kind: 'add_role',
      phase: 'best_effort_post',
      roleId: props.roleOptions[0]?.id ?? '',
    };
  if (k === 'remove_role')
    a = {
      kind: 'remove_role',
      phase: 'best_effort_post',
      roleId: props.roleOptions[0]?.id ?? '',
    };
  if (!a) return;
  patchAll([...props.modelValue, a]);
  addKind.value = '';
}

function onBanHoursChange(i: number, action: AutomodAction, raw: string) {
  if (action.kind !== 'ban') return;
  const n = raw === '' ? undefined : Math.floor(Number(raw));
  patchAt(i, {
    kind: 'ban',
    phase: 'must_succeed_post',
    ...(n != null && n > 0 ? { deleteRecentMessagesHours: n } : {}),
  });
}

function onNoticeChannelChange(
  i: number,
  action: AutomodAction,
  channelId: string,
) {
  if (action.kind !== 'system_notice_in_channel') return;
  patchAt(i, {
    kind: 'system_notice_in_channel',
    phase: 'best_effort_post',
    text: action.text,
    ...(channelId ? { channelId } : {}),
  });
}

function labelFor(a: AutomodAction): string {
  switch (a.kind) {
    case 'block_message':
      return 'Block message (pre-send)';
    case 'delete_recent_messages':
      return `Delete recent messages (${a.windowMinutes} min)`;
    case 'timeout':
      return `Timeout (${a.minutes} min)`;
    case 'kick':
      return 'Kick member';
    case 'ban':
      return a.deleteRecentMessagesHours
        ? `Ban (+ purge ${a.deleteRecentMessagesHours}h)`
        : 'Ban member';
    case 'warn_user_dm':
      return 'DM warning';
    case 'alert_log_channel':
      return 'Alert log channel';
    case 'system_notice_in_channel':
      return 'System notice in channel';
    case 'add_role':
      return 'Add role';
    case 'remove_role':
      return 'Remove role';
    default:
      return 'Action';
  }
}

const addOptions: Array<{ value: string; label: string; phase: string }> = [
  { value: 'block_message', label: 'Block message', phase: 'Pre-send' },
  {
    value: 'delete_recent_messages',
    label: 'Delete recent (author, channel)',
    phase: 'Post (must succeed)',
  },
  { value: 'timeout', label: 'Timeout', phase: 'Post (must succeed)' },
  { value: 'kick', label: 'Kick', phase: 'Post (must succeed)' },
  { value: 'ban', label: 'Ban', phase: 'Post (must succeed)' },
  { value: 'warn_user_dm', label: 'DM warning', phase: 'Post (best effort)' },
  {
    value: 'alert_log_channel',
    label: 'Log channel alert',
    phase: 'Post (best effort)',
  },
  {
    value: 'system_notice_in_channel',
    label: 'Channel notice',
    phase: 'Post (best effort)',
  },
  { value: 'add_role', label: 'Add role', phase: 'Post (best effort)' },
  {
    value: 'remove_role',
    label: 'Remove role',
    phase: 'Post (best effort)',
  },
];
</script>

<template>
  <div class="space-y-3">
    <p
      v-if="hasBlock && hasDeleteRecent"
      class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
    >
      Block message cannot be combined with delete recent messages in the same
      rule. Remove one before saving.
    </p>

    <div
      v-for="(action, i) in modelValue"
      :key="i"
      class="rounded-xl border border-border bg-scrim-2/50 p-3"
    >
      <div class="mb-2 flex items-start justify-between gap-2">
        <div class="text-sm font-semibold text-fg">{{ labelFor(action) }}</div>
        <button
          type="button"
          class="text-xs text-red-400 hover:underline"
          @click="removeAt(i)"
        >
          Remove
        </button>
      </div>

      <template v-if="action.kind === 'delete_recent_messages'">
        <label class="block text-xs text-fg-subtle">
          Window (minutes)
          <select
            class="mt-1 w-full rounded-lg border border-border bg-scrim-2 px-2 py-1 text-sm text-fg"
            :value="action.windowMinutes"
            @change="
              patchAt(i, {
                kind: 'delete_recent_messages',
                phase: 'must_succeed_post',
                windowMinutes: Number(
                  ($event.target as HTMLSelectElement).value,
                ) as AutomodDeleteRecentMinutes,
              })
            "
          >
            <option
              v-for="m in AUTOMOD_DELETE_RECENT_MINUTES"
              :key="m"
              :value="m"
            >
              {{ m }}
            </option>
          </select>
        </label>
      </template>

      <template v-else-if="action.kind === 'timeout'">
        <label class="block text-xs text-fg-subtle">
          Minutes
          <input
            :value="action.minutes"
            type="number"
            min="1"
            max="40320"
            class="mt-1 w-full rounded-lg border border-border bg-scrim-2 px-2 py-1 text-sm text-fg"
            @change="
              patchAt(i, {
                kind: 'timeout',
                phase: 'must_succeed_post',
                minutes: Math.min(
                  40320,
                  Math.max(
                    1,
                    Math.floor(
                      Number(
                        ($event.target as HTMLInputElement).value || '1',
                      ),
                    ),
                  ),
                ),
              })
            "
          />
        </label>
      </template>

      <template v-else-if="action.kind === 'ban'">
        <label class="block text-xs text-fg-subtle">
          Optional purge recent messages (hours, moderation limit applies)
          <input
            :value="action.deleteRecentMessagesHours ?? ''"
            type="number"
            min="0"
            max="168"
            placeholder="none"
            class="mt-1 w-full rounded-lg border border-border bg-scrim-2 px-2 py-1 text-sm text-fg"
            @change="
              onBanHoursChange(
                i,
                action,
                ($event.target as HTMLInputElement).value,
              )
            "
          />
        </label>
      </template>

      <template
        v-else-if="
          action.kind === 'warn_user_dm' ||
          action.kind === 'alert_log_channel'
        "
      >
        <textarea
          :value="action.text"
          rows="2"
          class="w-full rounded-lg border border-border bg-scrim-2 px-2 py-1 text-sm text-fg"
          @input="
            patchAt(i, {
              ...action,
              text: ($event.target as HTMLTextAreaElement).value,
            })
          "
        />
      </template>

      <template v-else-if="action.kind === 'system_notice_in_channel'">
        <textarea
          :value="action.text"
          rows="2"
          class="mb-2 w-full rounded-lg border border-border bg-scrim-2 px-2 py-1 text-sm text-fg"
          @input="
            patchAt(i, {
              ...action,
              text: ($event.target as HTMLTextAreaElement).value,
            })
          "
        />
        <label class="block text-xs text-fg-subtle">
          Channel (empty = trigger channel)
          <select
            class="mt-1 w-full rounded-lg border border-border bg-scrim-2 px-2 py-1 text-sm text-fg"
            :value="action.channelId ?? ''"
            @change="
              onNoticeChannelChange(
                i,
                action,
                ($event.target as HTMLSelectElement).value,
              )
            "
          >
            <option value="">Trigger channel</option>
            <option
              v-for="ch in channelOptions"
              :key="ch.id"
              :value="ch.id"
            >
              {{ ch.name }}
            </option>
          </select>
        </label>
      </template>

      <template
        v-else-if="action.kind === 'add_role' || action.kind === 'remove_role'"
      >
        <select
          class="w-full rounded-lg border border-border bg-scrim-2 px-2 py-1 text-sm text-fg"
          :value="action.roleId"
          @change="
            patchAt(i, {
              kind: action.kind,
              phase: 'best_effort_post',
              roleId: ($event.target as HTMLSelectElement).value,
            })
          "
        >
          <option
            v-for="ro in roleOptions"
            :key="ro.id"
            :value="ro.id"
          >
            {{ ro.name }}
          </option>
        </select>
      </template>
    </div>

    <div class="flex flex-wrap items-end gap-2">
      <label class="text-xs text-fg-subtle">
        Add action
        <select
          v-model="addKind"
          class="mt-1 block min-w-[12rem] rounded-lg border border-border bg-scrim-2 px-2 py-1 text-sm text-fg"
        >
          <option value="">Choose…</option>
          <optgroup
            v-for="phase in ['Pre-send', 'Post (must succeed)', 'Post (best effort)']"
            :key="phase"
            :label="phase"
          >
            <option
              v-for="opt in addOptions.filter((o) => o.phase === phase)"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </optgroup>
        </select>
      </label>
      <button
        type="button"
        class="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-fg hover:bg-glass-1"
        :disabled="!addKind"
        @click="addSelected"
      >
        Add
      </button>
    </div>
  </div>
</template>
