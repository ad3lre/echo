import { ref, shallowRef, type ShallowRef } from 'vue';
import type { EchoReportCategory } from '@shared/safetyReports';

export type ReportModalUserContext = {
  kind: 'user';
  targetUserId: string;
  displayName?: string;
  messageId?: string;
  channelId?: string;
};

export type ReportModalMessageContext = {
  kind: 'message';
  messageId: string;
  channelId: string;
  authorId: string;
  authorDisplayName?: string;
  preview?: string;
};

export type ReportModalGeneralContext = {
  kind: 'general';
};

export type ReportModalContext =
  | ReportModalUserContext
  | ReportModalMessageContext
  | ReportModalGeneralContext;

const isOpen = ref(false);
const context: ShallowRef<ReportModalContext | null> = shallowRef(null);

export function useReportModalState() {
  return { isOpen, context };
}

export function openReportModal(next: ReportModalContext): void {
  context.value = next;
  isOpen.value = true;
}

export function closeReportModal(): void {
  isOpen.value = false;
  context.value = null;
}

export {
  REPORT_CATEGORY_HINTS,
  REPORT_CATEGORY_LABELS,
} from '@/features/safety/reportModalCategories';
