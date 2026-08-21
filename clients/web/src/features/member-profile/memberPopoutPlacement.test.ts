import { describe, expect, it } from 'vitest';
import type { PopoutAnchorRect } from '@/features/member-profile/memberProfiles';
import {
  computeFittedPopoutTop,
  computePopoutPanelHeight,
  computePopoutViewportMaxHeight,
  popoutCardNeedsFixedHeight,
  resolveMemberPopoutTop,
} from './memberPopoutPlacement';

function anchor(
  partial: Partial<PopoutAnchorRect> & Pick<PopoutAnchorRect, 'source'>,
): PopoutAnchorRect {
  return {
    top: 520,
    left: 40,
    right: 72,
    bottom: 552,
    width: 32,
    height: 32,
    ...partial,
  };
}

const layoutViewport = (height: number, offsetTop = 0) => ({
  offsetLeft: 0,
  offsetTop,
  width: 1200,
  height,
});

describe('resolveMemberPopoutTop', () => {
  const viewport = layoutViewport(800);
  const padding = 16;
  const gap = 8;

  it('bottom-aligns member-list popout when content is taller than space below anchor', () => {
    const panelHeight = 560;
    const desiredTop = anchor({ source: 'member-list' }).top - 44;
    const top = resolveMemberPopoutTop({
      desiredTop,
      panelHeight,
      viewport,
      padding,
      anchor: anchor({ source: 'member-list' }),
      source: 'member-list',
      gap,
    });
    expect(top).toBe(viewport.height - panelHeight - padding);
  });

  it('bottom-aligns member-list popout when the card is taller than the viewport', () => {
    const panelHeight = 760;
    const top = resolveMemberPopoutTop({
      desiredTop: 900,
      panelHeight,
      viewport,
      padding,
      anchor: anchor({ source: 'member-list' }),
      source: 'member-list',
      gap,
    });
    expect(top).toBe(viewport.height - panelHeight - padding);
  });

  it('flips chat-name popout above when there is insufficient space below', () => {
    const panelHeight = 420;
    const lowAnchor = anchor({
      source: 'chat-name',
      top: 700,
      bottom: 728,
    });
    const top = resolveMemberPopoutTop({
      desiredTop: lowAnchor.top - 42,
      panelHeight,
      viewport,
      padding,
      anchor: lowAnchor,
      source: 'chat-name',
      gap: 12,
    });
    expect(top).toBe(lowAnchor.bottom - panelHeight - 12);
  });

  it('respects visual viewport offset when the layout viewport is panned', () => {
    const panelHeight = 400;
    const panned = layoutViewport(600, 80);
    const top = resolveMemberPopoutTop({
      desiredTop: 900,
      panelHeight,
      viewport: panned,
      padding,
      anchor: anchor({ source: 'member-list' }),
      source: 'member-list',
      gap,
    });
    expect(top).toBe(panned.offsetTop + panned.height - panelHeight - padding);
  });
});

describe('popout sizing helpers', () => {
  it('uses measured natural height capped by viewport', () => {
    expect(computePopoutPanelHeight(620, 400, 768)).toBe(620);
    expect(computePopoutPanelHeight(900, 400, 768)).toBe(768);
  });

  it('fits top after max-height is known', () => {
    const panelMaxHeight = 520;
    expect(
      computeFittedPopoutTop(300, panelMaxHeight, layoutViewport(800), 16),
    ).toBe(264);
  });

  it('limits max height to viewport below top', () => {
    expect(
      computePopoutViewportMaxHeight(layoutViewport(800), 200, 16, 768),
    ).toBe(584);
  });

  it('detects when the card needs a fixed height for internal scroll', () => {
    expect(popoutCardNeedsFixedHeight(640, 520)).toBe(true);
    expect(popoutCardNeedsFixedHeight(480, 520)).toBe(false);
  });
});
