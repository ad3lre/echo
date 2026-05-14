<script setup lang="ts">
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
        <div class="settings-subtitle">Verification Gate</div>
        <div class="mt-1 text-sm text-fg-soft">
          Turn on only the trust signals you want. Members must satisfy every
          enabled requirement before they can participate.
        </div>
      </div>

      <div class="mt-4 space-y-3">
        <label
          class="flex items-center justify-between gap-4 rounded-xl px-4 py-3 hover:bg-glass-1"
        >
          <div>
            <div class="font-semibold text-fg">Require verified email</div>
            <div class="text-xs text-fg-subtle">
              Account must have a confirmed email address.
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
            <div class="font-semibold text-fg">Require verified phone</div>
            <div class="text-xs text-fg-subtle">
              Account must have a confirmed phone number.
              <span
                v-if="PHONE_VERIFICATION_COMING_SOON"
                class="ml-2 font-semibold text-accent"
                >Coming soon</span
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
            <div class="font-semibold text-fg">Require 2FA</div>
            <div class="text-xs text-fg-subtle">
              Two-factor authentication must be enabled on the account.
              <span
                v-if="TWO_FACTOR_AUTH_COMING_SOON"
                class="ml-2 font-semibold text-accent"
                >Coming soon</span
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
            <div class="font-semibold text-fg">Require mature account</div>
            <div class="text-xs text-fg-subtle">
              Account must meet minimum age / standing (platform policy).
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
            <div class="font-semibold text-fg">Allow global guests</div>
            <div class="text-xs text-fg-subtle">
              When off, only signed-in members matching your gate can use the
              server. When on, guests may access allowed surfaces (e.g. public
              preview) per product rules.
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
        How verification works
      </div>
      <div class="mt-2 text-sm text-fg-soft">
        Each enabled option adds a requirement. For example, email + phone + 2FA
        means all three must be true. Enforcement in chat and joins is applied
        by the server when those features are wired to this policy.
      </div>
    </div>
  </div>
</template>
