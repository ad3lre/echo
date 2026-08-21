// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  APP_TOAST_CLICK_EXTEND_MS,
  APP_TOAST_REPLY_EXTEND_MS,
  resolveAppToastClickExtendMs,
  resolveAppToastReplyExtendMs,
  shouldExtendAppToastOnClick,
} from './appToastDismissTimer';

describe('resolveAppToastClickExtendMs', () => {
  it('extends short toasts to the click floor', () => {
    expect(resolveAppToastClickExtendMs(3500)).toBe(APP_TOAST_CLICK_EXTEND_MS);
  });

  it('preserves longer base durations', () => {
    expect(resolveAppToastClickExtendMs(12000)).toBe(12000);
  });
});

describe('resolveAppToastReplyExtendMs', () => {
  it('super-extends short toasts to the reply floor', () => {
    expect(resolveAppToastReplyExtendMs(3500)).toBe(APP_TOAST_REPLY_EXTEND_MS);
  });

  it('super-extends long toasts to at least the reply floor', () => {
    expect(resolveAppToastReplyExtendMs(12000)).toBe(APP_TOAST_REPLY_EXTEND_MS);
  });
});

describe('shouldExtendAppToastOnClick', () => {
  it('allows clicks on non-interactive toast chrome', () => {
    const root = document.createElement('div');
    const label = document.createElement('p');
    root.appendChild(label);
    expect(shouldExtendAppToastOnClick(label)).toBe(true);
  });

  it('ignores clicks on buttons and editable fields', () => {
    const button = document.createElement('button');
    expect(shouldExtendAppToastOnClick(button)).toBe(false);

    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    expect(shouldExtendAppToastOnClick(editable)).toBe(false);
  });
});
