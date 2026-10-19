<script setup lang="ts">
import { echoT } from '@/i18n';
import {
  PHONE_VERIFICATION_COMING_SOON,
  TWO_FACTOR_AUTH_COMING_SOON,
} from '@/features/settings/data';

type ServerSecurityForm = {
  verificationRequireEmail: boolean;
  verificationRequirePhone: boolean;
  verificationRequire2FA: boolean;
  verificationRequireMatureAccount: boolean;
  allowGlobalGuests: boolean;
};

const props = defineProps<{
  form: ServerSecurityForm;
}>();

const emit = defineEmits<{
  'patch-form': [patch: Partial<ServerSecurityForm>];
}>();

function patchForm(patch: Partial<ServerSecurityForm>) {
  emit('patch-form', patch);
}
</script>

<template>
  <div class="space-y-6">
    <div class="server-settings-panel rounded-2xl p-5">
      <div>
        <div class="settings-subtitle">
          {{ echoT('b31.security.gateTitle') }}
        </div>
        <div class="mt-1 text-sm text-fg-soft">
          {{ echoT('b31.security.gateDesc') }}
        </div>
      </div>

      <div class="mt-4 space-y-3">
        <label
          class="flex items-center justify-between gap-4 rounded-xl px-4 py-3 hover:bg-glass-1"
        >
          <div>
            <div class="font-semibold text-fg">
              {{ echoT('b31.security.reqEmail') }}
            </div>
            <div class="text-xs text-fg-subtle">
              {{ echoT('b31.security.reqEmailDesc') }}
            </div>
          </div>
          <input
            type="checkbox"
            class="server-toggle shrink-0"
            :checked="props.form.verificationRequireEmail"
            @change="
              patchForm({
                verificationRequireEmail: ($event.target as HTMLInputElement)
                  .checked,
              })
            "
          />
        </label>

        <label
          class="flex items-center justify-between gap-4 rounded-xl px-4 py-3 hover:bg-glass-1"
        >
          <div>
            <div class="font-semibold text-fg">
              {{ echoT('b31.security.reqPhone') }}
            </div>
            <div class="text-xs text-fg-subtle">
              {{ echoT('b31.security.reqPhoneDesc') }}
              <span
                v-if="PHONE_VERIFICATION_COMING_SOON"
                class="ml-2 font-semibold text-accent"
                >{{ echoT('b31.security.comingSoon') }}</span
              >
            </div>
          </div>
          <input
            type="checkbox"
            class="server-toggle shrink-0"
            :checked="props.form.verificationRequirePhone"
            :disabled="PHONE_VERIFICATION_COMING_SOON"
            @change="
              !PHONE_VERIFICATION_COMING_SOON &&
              patchForm({
                verificationRequirePhone: ($event.target as HTMLInputElement)
                  .checked,
              })
            "
          />
        </label>

        <label
          class="flex items-center justify-between gap-4 rounded-xl px-4 py-3 hover:bg-glass-1"
        >
          <div>
            <div class="font-semibold text-fg">
              {{ echoT('b31.security.req2fa') }}
            </div>
            <div class="text-xs text-fg-subtle">
              {{ echoT('b31.security.req2faDesc') }}
              <span
                v-if="TWO_FACTOR_AUTH_COMING_SOON"
                class="ml-2 font-semibold text-accent"
                >{{ echoT('b31.security.comingSoon') }}</span
              >
            </div>
          </div>
          <input
            type="checkbox"
            class="server-toggle shrink-0"
            :checked="props.form.verificationRequire2FA"
            :disabled="TWO_FACTOR_AUTH_COMING_SOON"
            @change="
              !TWO_FACTOR_AUTH_COMING_SOON &&
              patchForm({
                verificationRequire2FA: ($event.target as HTMLInputElement)
                  .checked,
              })
            "
          />
        </label>

        <label
          class="flex items-center justify-between gap-4 rounded-xl px-4 py-3 hover:bg-glass-1"
        >
          <div>
            <div class="font-semibold text-fg">
              {{ echoT('b31.security.reqMature') }}
            </div>
            <div class="text-xs text-fg-subtle">
              {{ echoT('b31.security.reqMatureDesc') }}
            </div>
          </div>
          <input
            type="checkbox"
            class="server-toggle shrink-0"
            :checked="props.form.verificationRequireMatureAccount"
            @change="
              patchForm({
                verificationRequireMatureAccount: (
                  $event.target as HTMLInputElement
                ).checked,
              })
            "
          />
        </label>

        <label
          class="flex items-center justify-between gap-4 rounded-xl px-4 py-3 hover:bg-glass-1"
        >
          <div>
            <div class="font-semibold text-fg">
              {{ echoT('b31.security.allowGuests') }}
            </div>
            <div class="text-xs text-fg-subtle">
              {{ echoT('b31.security.allowGuestsDesc') }}
            </div>
          </div>
          <input
            type="checkbox"
            class="server-toggle shrink-0"
            :checked="props.form.allowGlobalGuests"
            @change="
              patchForm({
                allowGlobalGuests: ($event.target as HTMLInputElement).checked,
              })
            "
          />
        </label>
      </div>
    </div>

    <div class="px-1">
      <div
        class="text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-subtle"
      >
        {{ echoT('b31.security.howTitle') }}
      </div>
      <div class="mt-2 text-sm text-fg-soft">
        {{ echoT('b31.security.howDesc') }}
      </div>
    </div>
  </div>
</template>
