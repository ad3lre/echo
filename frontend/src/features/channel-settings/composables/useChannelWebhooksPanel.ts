import { computed, ref, watch, type Ref } from 'vue';
import {
  createEchoChannelWebhook,
  deleteEchoChannelWebhook,
  listEchoChannelWebhooks,
  regenerateEchoChannelWebhookToken,
  type EchoChannelWebhookDto,
} from '@/api/echo/channelWebhooks';
import { requestAppConfirm } from '@/utils/appDialogs';

export type { EchoChannelWebhookDto };

export function useChannelWebhooksPanel(options: {
  serverId: Ref<string>;
  channelId: Ref<string>;
  canUse: Ref<boolean>;
  accessToken: Ref<string>;
}) {
  const loading = ref(false);
  const error = ref('');
  const webhooks = ref<EchoChannelWebhookDto[]>([]);
  const creating = ref(false);
  const newName = ref('Webhook');
  const reveal = ref<{ url: string; token: string } | null>(null);

  async function load() {
    if (!options.canUse.value) return;
    loading.value = true;
    error.value = '';
    try {
      const tok = options.accessToken.value;
      const { webhooks: list } = await listEchoChannelWebhooks(
        tok,
        options.serverId.value,
        options.channelId.value,
      );
      webhooks.value = list;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load webhooks';
      webhooks.value = [];
    } finally {
      loading.value = false;
    }
  }

  watch(
    () =>
      [
        options.serverId.value,
        options.channelId.value,
        options.canUse.value,
      ] as const,
    () => {
      void load();
    },
    { immediate: true },
  );

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      error.value = `Could not copy ${label} to clipboard`;
    }
  }

  async function onCreate() {
    if (!options.canUse.value) return;
    creating.value = true;
    error.value = '';
    try {
      const tok = options.accessToken.value;
      const res = await createEchoChannelWebhook(
        tok,
        options.serverId.value,
        options.channelId.value,
        {
          name: newName.value.trim() || 'Webhook',
        },
      );
      reveal.value = { url: res.url, token: res.token };
      newName.value = 'Webhook';
      await load();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Create failed';
    } finally {
      creating.value = false;
    }
  }

  async function onDelete(w: EchoChannelWebhookDto) {
    const ok = await requestAppConfirm({
      title: `Delete webhook “${w.name}”?`,
      message:
        'Any integrations using this webhook URL will stop working immediately.',
      confirmLabel: 'Delete webhook',
      danger: true,
    });
    if (!ok) return;
    error.value = '';
    try {
      const tok = options.accessToken.value;
      await deleteEchoChannelWebhook(
        tok,
        options.serverId.value,
        options.channelId.value,
        w.id,
      );
      if (reveal.value) reveal.value = null;
      await load();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Delete failed';
    }
  }

  async function onRegenerate(w: EchoChannelWebhookDto) {
    const ok = await requestAppConfirm({
      title: 'Regenerate webhook token?',
      message:
        'The old URL stops working immediately. Copy the new URL for your integrations.',
      confirmLabel: 'Regenerate',
      danger: true,
    });
    if (!ok) return;
    error.value = '';
    try {
      const tok = options.accessToken.value;
      const res = await regenerateEchoChannelWebhookToken(
        tok,
        options.serverId.value,
        options.channelId.value,
        w.id,
      );
      reveal.value = { url: res.url, token: res.token };
      await load();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Regenerate failed';
    }
  }

  return {
    loading,
    error,
    webhooks,
    creating,
    newName,
    reveal,
    copyText,
    onCreate,
    onDelete,
    onRegenerate,
  };
}
