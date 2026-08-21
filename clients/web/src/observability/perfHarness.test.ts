// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  getPerfHarnessReport,
  initPerfHarness,
  isPerfHarnessEnabled,
  perfHarnessRecordChatSwitch,
  perfHarnessRecordVcState,
  resetPerfHarnessScenario,
} from './perfHarness';

describe('perfHarness', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    window.history.replaceState({}, '', '/?perfHarness=1');
    localStorage.setItem('echo_perf_harness', '1');
    initPerfHarness();
    resetPerfHarnessScenario();
  });

  afterEach(() => {
    localStorage.removeItem('echo_perf_harness');
    window.history.replaceState({}, '', originalLocation.pathname);
    delete (window as Window & { __echoPerf?: unknown }).__echoPerf;
  });

  it('enables when perfHarness query param is set', () => {
    expect(isPerfHarnessEnabled()).toBe(true);
  });

  it('records chat switch events with duration', () => {
    perfHarnessRecordChatSwitch({
      event: 'chat_switch_ui_rendered',
      durationMs: 42,
      context: { channelId: 'ch1' },
    });
    const report = getPerfHarnessReport();
    expect(report.milestones.chat_switch_ui_rendered).toBe(42);
    expect(
      report.events.some((e) => e.name === 'chat_switch_ui_rendered'),
    ).toBe(true);
  });

  it('records vc connect duration', () => {
    perfHarnessRecordVcState('connecting', 'idle');
    perfHarnessRecordVcState('connected', 'connecting');
    const report = getPerfHarnessReport();
    expect(report.milestones.vc_connect_start).toBeDefined();
    expect(report.milestones.vc_connected).toBeDefined();
    expect(report.milestones.vc_connect_duration).toBeDefined();
  });
});
