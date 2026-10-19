<script setup lang="ts">
import { echoT } from '@/i18n';
import { computed, ref, watch } from 'vue';
import QRCode from 'qrcode';
import { useAuthSessionStore } from '@/features/auth/authSession';
import {
  getEchoE2eeDevices,
  postEchoRevokeE2eeDevice,
  type EchoE2eeDeviceListRow,
} from '@/api/echo/e2ee';
import {
  buildE2eePairingQrPayload,
  completeDevicePairingAsNewDevice,
  parsePairingPayloadFromQr,
  parsePairingIdFromQrPayload,
  respondDevicePairingFromQr,
  startDevicePairingSession,
} from '@/services/e2ee/e2eePairing';
import { reportPrimaryFlowFailure } from '@/features/layout/failures/primaryFlowFailure';
import { getLocalE2eeSafetyNumber } from '@/services/e2ee/e2eeSafetyNumber';

const props = defineProps<{
  modelValue: boolean;
  /** After successful import on the new device: register keys + optional local system rows. */
  onPairingImportSuccess?: () => void | Promise<void>;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const authSession = useAuthSessionStore();

const loading = ref(false);
const error = ref<string | null>(null);
const devices = ref<EchoE2eeDeviceListRow[]>([]);
const safetyNumberLocal = ref<string | null>(null);

const pairingBusy = ref(false);
const pairingQrDataUrl = ref<string | null>(null);
const activePairingId = ref<string | null>(null);
const activePairingSecret = ref<string | null>(null);
const pairingLinkField = ref('');
const pairingTrustedField = ref('');

const open = computed(() => props.modelValue);

async function refresh(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const res = await getEchoE2eeDevices(authSession.accessToken);
    devices.value = res.devices ?? [];
    const uid = authSession.backendUser?.id?.trim();
    safetyNumberLocal.value = uid ? await getLocalE2eeSafetyNumber(uid) : null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    reportPrimaryFlowFailure('e2ee.devices_list_failed', e, {});
  } finally {
    loading.value = false;
  }
}

async function revoke(deviceId: string): Promise<void> {
  if (
    !confirm(
      'Revoke this device? It will lose access to future encrypted messages.',
    )
  )
    return;
  try {
    await postEchoRevokeE2eeDevice(authSession.accessToken, deviceId);
    await refresh();
  } catch (e) {
    reportPrimaryFlowFailure('e2ee.device_revoke_failed', e, { deviceId });
    error.value = e instanceof Error ? e.message : String(e);
  }
}

watch(
  () => open.value,
  (v) => {
    if (v) void refresh();
  },
  { immediate: true },
);

function close() {
  emit('update:modelValue', false);
}

async function startLinkNewDevice(): Promise<void> {
  pairingBusy.value = true;
  error.value = null;
  pairingQrDataUrl.value = null;
  activePairingId.value = null;
  try {
    const tok = authSession.accessToken;
    if (!tok?.trim()) throw new Error(echoT('b20.e2ee.errSignedInPairing'));
    const { pairingId, pairingSecret } = await startDevicePairingSession(tok);
    activePairingId.value = pairingId;
    activePairingSecret.value = pairingSecret;
    const payload = buildE2eePairingQrPayload({ pairingId, pairingSecret });
    pairingQrDataUrl.value = await QRCode.toDataURL(payload, {
      margin: 1,
      width: 220,
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    reportPrimaryFlowFailure('e2ee.pairing_start_failed', e, {});
  } finally {
    pairingBusy.value = false;
  }
}

async function completeLinkFromTrustedDevice(): Promise<void> {
  pairingBusy.value = true;
  error.value = null;
  try {
    const tok = authSession.accessToken;
    const uid = authSession.backendUser?.id?.trim();
    if (!tok?.trim() || !uid)
      throw new Error(echoT('b20.e2ee.errSignedInTrusted'));
    const raw = pairingTrustedField.value.trim();
    const parsed =
      parsePairingPayloadFromQr(raw) ??
      parsePairingPayloadFromQr(`echo://e2ee-pair/${raw}`) ??
      (() => {
        const id = parsePairingIdFromQrPayload(raw);
        if (!id) return null;
        return { pairingId: id, pairingSecret: '' };
      })();
    if (!parsed?.pairingId || !parsed.pairingSecret) {
      throw new Error(echoT('b20.e2ee.errPasteFullSecret'));
    }
    await respondDevicePairingFromQr(tok, parsed, uid);
    pairingTrustedField.value = '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    reportPrimaryFlowFailure('e2ee.pairing_respond_failed', e, {});
  } finally {
    pairingBusy.value = false;
  }
}

async function finishNewDeviceImport(): Promise<void> {
  pairingBusy.value = true;
  error.value = null;
  try {
    const tok = authSession.accessToken;
    const uid = authSession.backendUser?.id?.trim();
    if (!tok?.trim() || !uid) throw new Error(echoT('b20.e2ee.errSignedInNew'));
    const raw = pairingLinkField.value.trim();
    const parsed =
      parsePairingPayloadFromQr(raw) ??
      parsePairingPayloadFromQr(`echo://e2ee-pair/${raw}`) ??
      null;
    if (!parsed) {
      throw new Error(echoT('b20.e2ee.errPasteFullTrusted'));
    }
    await completeDevicePairingAsNewDevice({
      token: tok,
      pairing: parsed,
      authUserId: uid,
    });
    pairingLinkField.value = '';
    pairingQrDataUrl.value = null;
    activePairingId.value = null;
    activePairingSecret.value = null;
    try {
      await props.onPairingImportSuccess?.();
    } catch (e) {
      reportPrimaryFlowFailure('e2ee.pairing_post_import_hook_failed', e, {});
      error.value =
        e instanceof Error ? e.message : echoT('b20.e2ee.errImportedFollowUp');
    }
    await refresh();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    reportPrimaryFlowFailure('e2ee.pairing_complete_failed', e, {});
  } finally {
    pairingBusy.value = false;
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[200] flex items-center justify-center"
  >
    <div class="absolute inset-0 bg-overlay-dim" @click="close" />
    <div
      class="relative w-[min(560px,92vw)] rounded-xl border border-border bg-[var(--echo-modal-bg)] p-4 text-foreground shadow-2xl"
    >
      <div class="flex items-center justify-between gap-3">
        <div class="text-sm font-semibold">{{ echoT('b20.e2ee.title') }}</div>
        <button
          class="rounded-md px-2 py-1 text-sm text-fg-soft hover:bg-glass-hover"
          @click="close"
        >
          {{ echoT('b20.e2ee.close') }}
        </button>
      </div>

      <div class="mt-2 text-xs text-fg-soft">
        {{ echoT('b20.e2ee.approvalNote') }}
      </div>

      <div
        v-if="safetyNumberLocal"
        class="mt-3 rounded-lg border border-border bg-glass-1 p-3 text-[11px] leading-relaxed text-fg-soft"
      >
        <div class="font-semibold text-fg">
          {{ echoT('b20.e2ee.fingerprintTitle') }}
        </div>
        <p class="mt-1">
          {{ echoT('b20.e2ee.tofu') }}
        </p>
        <p class="mt-2 break-all font-mono text-[10px] text-fg">
          {{ safetyNumberLocal }}
        </p>
        <p class="mt-2 text-fg-subtle">
          {{ echoT('b20.e2ee.fingerprintChange') }}
        </p>
      </div>

      <div
        class="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-100/90"
      >
        <div class="font-semibold text-amber-50">
          {{ echoT('b20.e2ee.linkBrowser') }}
        </div>
        <p class="mt-1 text-[11px] leading-snug text-amber-100/80">
          {{ echoT('b20.e2ee.linkWarning') }}
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-md border border-border bg-glass-1 px-2 py-1 text-[11px] font-semibold text-fg hover:bg-glass-hover disabled:opacity-50"
            :disabled="pairingBusy"
            @click="void startLinkNewDevice()"
          >
            {{ echoT('b20.e2ee.showQr') }}
          </button>
        </div>
        <div v-if="pairingQrDataUrl" class="mt-2 flex items-start gap-3">
          <img
            :src="pairingQrDataUrl"
            :alt="echoT('b20.e2ee.pairingQrAlt')"
            class="rounded bg-white p-1"
            width="220"
            height="220"
          />
          <div class="min-w-0 flex-1 space-y-2 text-[11px] text-amber-100/85">
            <div
              v-if="activePairingId"
              class="break-all font-mono text-[10px] text-fg-soft"
            >
              {{
                buildE2eePairingQrPayload({
                  pairingId: activePairingId,
                  pairingSecret: activePairingSecret || '',
                })
              }}
            </div>
            <label class="block">
              <span class="text-fg-soft">{{
                echoT('b20.e2ee.trustedPaste')
              }}</span>
              <textarea
                v-model="pairingTrustedField"
                rows="2"
                class="mt-1 w-full rounded border border-border bg-scrim-2 px-2 py-1 font-mono text-[10px] text-fg"
                placeholder="echo://e2ee-pair/…"
              />
            </label>
            <button
              type="button"
              class="rounded-md border border-emerald-500/40 bg-emerald-600/20 px-2 py-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-600/30 disabled:opacity-50"
              :disabled="pairingBusy"
              @click="void completeLinkFromTrustedDevice()"
            >
              {{ echoT('b20.e2ee.uploadTransfer') }}
            </button>
            <label class="block pt-2">
              <span class="text-fg-soft">{{
                echoT('b20.e2ee.newDevicePaste')
              }}</span>
              <textarea
                v-model="pairingLinkField"
                rows="2"
                class="mt-1 w-full rounded border border-border bg-scrim-2 px-2 py-1 font-mono text-[10px] text-fg"
                placeholder="echo://e2ee-pair/…"
              />
            </label>
            <button
              type="button"
              class="rounded-md border border-sky-500/40 bg-sky-600/20 px-2 py-1 text-[11px] font-semibold text-sky-100 hover:bg-sky-600/30 disabled:opacity-50"
              :disabled="pairingBusy"
              @click="void finishNewDeviceImport()"
            >
              {{ echoT('b20.e2ee.importSession') }}
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="error"
        class="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200"
      >
        {{ error }}
      </div>

      <div class="mt-3">
        <div v-if="loading" class="text-xs text-fg-soft">
          {{ echoT('settingsUi.loading') }}
        </div>
        <div v-else-if="devices.length === 0" class="text-xs text-fg-soft">
          {{ echoT('b20.e2ee.noDevices') }}
        </div>
        <ul v-else class="space-y-2">
          <li
            v-for="d in devices"
            :key="d.deviceId"
            class="flex items-center justify-between gap-3 rounded-lg border border-border bg-glass-1 p-2"
          >
            <div class="min-w-0">
              <div class="truncate text-xs font-mono text-fg-soft">
                {{ d.deviceId }}
              </div>
              <div class="mt-0.5 text-[11px] text-fg-subtle">
                {{
                  echoT('b20.e2ee.deviceMeta', {
                    id: d.protocolDeviceId ?? 1,
                    date: new Date(d.createdAt).toLocaleString(),
                  })
                }}
                <span v-if="d.revokedAt">
                  ·
                  {{
                    echoT('b20.e2ee.revokedAt', {
                      date: new Date(d.revokedAt).toLocaleString(),
                    })
                  }}</span
                >
              </div>
            </div>
            <button
              class="shrink-0 rounded-md border border-border bg-glass-1 px-2 py-1 text-xs text-fg-soft hover:bg-glass-hover disabled:opacity-50"
              :disabled="!!d.revokedAt"
              @click="revoke(d.deviceId)"
            >
              {{ echoT('b20.e2ee.revoke') }}
            </button>
          </li>
        </ul>
      </div>

      <div class="mt-3 flex justify-end">
        <button
          class="rounded-md border border-border bg-glass-1 px-2.5 py-1.5 text-xs text-fg-soft hover:bg-glass-hover"
          @click="refresh"
        >
          {{ echoT('b20.e2ee.refresh') }}
        </button>
      </div>
    </div>
  </div>
</template>
