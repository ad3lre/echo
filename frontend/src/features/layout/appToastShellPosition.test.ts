import { describe, expect, it } from 'vitest';
import {
  appToastBottomInsetCss,
  APP_TOAST_BAR_TIMED_LEFT,
  APP_TOAST_BAR_TIMED_TOP,
  APP_TOAST_BAR_TIMED_BOTTOM_FLOOR,
  buildAppToastBarTimedPositionStyle,
  buildAppToastShellPositionStyle,
  computeVisualViewportToastInsets,
  shouldAppToastClearBottomChrome,
} from './appToastShellPosition';

describe('shouldAppToastClearBottomChrome', () => {
  const base = {
    chatComposerFocused: false,
    measuredChromeInsetPx: 0,
    useCompactTriPaneShell: false,
    useCompactDmShell: false,
    hasGuildChannelChrome: false,
    isDmThreadSurface: false,
  };

  it('lifts when the composer is focused or measured chrome exists', () => {
    expect(
      shouldAppToastClearBottomChrome({
        ...base,
        chatComposerFocused: true,
      }),
    ).toBe(true);
    expect(
      shouldAppToastClearBottomChrome({
        ...base,
        measuredChromeInsetPx: 72,
      }),
    ).toBe(true);
  });

  it('uses a modest inset on surfaces without bottom chrome', () => {
    expect(shouldAppToastClearBottomChrome(base)).toBe(false);
  });

  it('lifts on compact shells and active DM thread surfaces', () => {
    expect(
      shouldAppToastClearBottomChrome({
        ...base,
        useCompactDmShell: true,
      }),
    ).toBe(true);
    expect(
      shouldAppToastClearBottomChrome({
        ...base,
        isDmThreadSurface: true,
      }),
    ).toBe(true);
  });
});

describe('appToastBottomInsetCss', () => {
  it('uses a modest floor when not clearing bottom chrome', () => {
    expect(
      appToastBottomInsetCss({ elevated: false, measuredChromeInsetPx: 0 }),
    ).toBe('max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))');
  });

  it('prefers measured chrome inset when elevated', () => {
    expect(
      appToastBottomInsetCss({ elevated: true, measuredChromeInsetPx: 96 }),
    ).toBe('calc(106px + env(safe-area-inset-bottom, 0px) + 1rem)');
  });
});

describe('computeVisualViewportToastInsets', () => {
  it('returns zero when visualViewport is missing', () => {
    expect(computeVisualViewportToastInsets(800, null)).toEqual({
      bottomExtraPx: 0,
      offsetTopPx: 0,
    });
  });

  it('lifts the toast by layout/visual gap and tracks offsetTop', () => {
    expect(
      computeVisualViewportToastInsets(800, { height: 520, offsetTop: 40 }),
    ).toEqual({
      bottomExtraPx: 240,
      offsetTopPx: 40,
    });
  });

  it('caps runaway bottom gaps from buggy metrics', () => {
    expect(
      computeVisualViewportToastInsets(800, { height: 100, offsetTop: 0 }),
    ).toEqual({
      bottomExtraPx: 440,
      offsetTopPx: 0,
    });
  });
});

describe('buildAppToastShellPositionStyle', () => {
  it('pins toast viewport with top/bottom bounds', () => {
    const bottom =
      'max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))';
    const topReserve = 'max(0.5rem, env(safe-area-inset-top, 0px))';
    expect(
      buildAppToastShellPositionStyle({
        bottomInsetCss: bottom,
        bottomExtraPx: 0,
        visualViewportOffsetTopPx: 0,
      }),
    ).toEqual({
      top: topReserve,
      bottom,
      maxHeight: `max(0px, calc(min(100dvh, 100vh) - (${bottom}) - (${topReserve})))`,
    });
  });

  it('accounts for visual viewport lift on top and bottom', () => {
    const bottomInsetCss =
      'calc(106px + env(safe-area-inset-bottom, 0px) + 1rem)';
    const bottom = `calc(${bottomInsetCss} + 120px)`;
    const topReserve = 'max(0.5rem, env(safe-area-inset-top, 0px), 32px)';
    expect(
      buildAppToastShellPositionStyle({
        bottomInsetCss,
        bottomExtraPx: 120,
        visualViewportOffsetTopPx: 32,
      }),
    ).toEqual({
      top: topReserve,
      bottom,
      maxHeight: `max(0px, calc(min(100dvh, 100vh) - (${bottom}) - (${topReserve})))`,
    });
  });
});

describe('buildAppToastBarTimedPositionStyle', () => {
  it('pins bar-timed toasts top-left with breathing room', () => {
    expect(
      buildAppToastBarTimedPositionStyle({ visualViewportOffsetTopPx: 0 }),
    ).toEqual({
      top: APP_TOAST_BAR_TIMED_TOP,
      left: APP_TOAST_BAR_TIMED_LEFT,
      maxHeight: `max(0px, calc(min(100dvh, 100vh) - (${APP_TOAST_BAR_TIMED_TOP}) - ${APP_TOAST_BAR_TIMED_BOTTOM_FLOOR}))`,
    });
  });

  it('respects visual viewport offsetTop', () => {
    const top = `max(${APP_TOAST_BAR_TIMED_TOP}, 48px)`;
    expect(
      buildAppToastBarTimedPositionStyle({ visualViewportOffsetTopPx: 48 }),
    ).toEqual({
      top,
      left: APP_TOAST_BAR_TIMED_LEFT,
      maxHeight: `max(0px, calc(min(100dvh, 100vh) - (${top}) - ${APP_TOAST_BAR_TIMED_BOTTOM_FLOOR}))`,
    });
  });
});
