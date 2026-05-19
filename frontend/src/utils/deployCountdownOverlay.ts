import { ref } from 'vue';

export type DeployCountdownPayload = {
  endsAt: number;
  message: string;
  secondsTotal: number;
};

export const deployCountdownActive = ref<DeployCountdownPayload | null>(null);

const DEFAULT_MSG =
  'Echo is restarting for an update. Expect a short downtime; the app will reconnect automatically.';

export function applyDeployCountdownSocketPayload(raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const o = raw as Record<string, unknown>;
  const endsAt = o.endsAt;
  const message = o.message;
  const secondsTotal = o.secondsTotal;
  if (typeof endsAt !== 'number' || !Number.isFinite(endsAt)) return;
  deployCountdownActive.value = {
    endsAt,
    message:
      typeof message === 'string' && message.trim()
        ? message.trim()
        : DEFAULT_MSG,
    secondsTotal:
      typeof secondsTotal === 'number' &&
      Number.isFinite(secondsTotal) &&
      secondsTotal > 0
        ? secondsTotal
        : Math.max(1, Math.ceil((endsAt - Date.now()) / 1000)),
  };
}

export function clearDeployCountdown(): void {
  deployCountdownActive.value = null;
}
