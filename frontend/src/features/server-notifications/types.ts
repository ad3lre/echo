import type { EchoServerNotificationLevel } from '@shared/types';
import {
  serverNotificationOption,
  serverNotificationSummary,
} from '@/i18n/labels';

export type ServerNotificationLevel = EchoServerNotificationLevel;

export function getServerNotificationOptions(): {
  value: ServerNotificationLevel;
  label: string;
  description: string;
}[] {
  return (
    ['all', 'mentions', 'mentions_direct', 'none'] as ServerNotificationLevel[]
  ).map((value) => ({
    value,
    ...serverNotificationOption(value),
  }));
}

export { serverNotificationSummary as getServerNotificationSummary };

/** @deprecated Use getServerNotificationOptions() for translated labels. */
export function getServerNotificationOptionsLegacy() {
  return getServerNotificationOptions();
}
