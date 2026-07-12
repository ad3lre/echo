/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { resetMessageListScrollExperimentFlagsForTests } from '@/features/chat/domain/messageListScrollExperiments';
import {
  installMessageListScrollMetrics,
  messageListScrollMetricsApi,
  resetMessageListScrollMetrics,
} from './messageListScrollMetrics';

describe('messageListScrollMetrics', () => {
  beforeEach(() => {
    resetMessageListScrollExperimentFlagsForTests();
    resetMessageListScrollMetrics();
    delete (window as unknown as { __echoMessageListScrollMetrics?: unknown })
      .__echoMessageListScrollMetrics;
    localStorage.setItem('echo_message_list_scroll_metrics', '1');
    installMessageListScrollMetrics(true);
  });

  it('records scroll handler samples and builds report', () => {
    const api = messageListScrollMetricsApi();
    expect(api).toBeTruthy();
    api!.noteScrollHandlerDuration(2);
    api!.noteScrollHandlerDuration(8);
    api!.noteLongFrame(20);
    api!.noteMeasureEvent();
    const report = api!.getReport();
    expect(report.scrollHandlerMs.samples).toBe(2);
    expect(report.longFrameCount).toBe(1);
    expect(report.measureEventCount).toBe(1);
  });
});
