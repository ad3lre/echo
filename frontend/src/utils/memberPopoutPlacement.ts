import type {
  PopoutAnchorRect,
  PopoutAnchorSource,
} from '@/utils/memberProfiles';
import type { OverlayVisibleViewport } from '@/utils/overlayViewport';

export type ResolveMemberPopoutTopParams = {
  desiredTop: number;
  panelHeight: number;
  viewport: OverlayVisibleViewport;
  padding: number;
  anchor: PopoutAnchorRect;
  source: PopoutAnchorSource;
  gap: number;
};

function visibleBottom(viewport: OverlayVisibleViewport): number {
  return viewport.offsetTop + viewport.height;
}

/** Natural content height for positioning (scrollHeight, not clipped layout height). */
export function measurePopoutContentHeight(
  article: HTMLElement,
  scrollEl?: HTMLElement | null,
): number {
  const fromArticle = article.scrollHeight;
  const fromScroll = scrollEl?.scrollHeight ?? 0;
  return Math.max(fromArticle, fromScroll);
}

export function computePopoutPanelHeight(
  measuredHeight: number,
  layoutHeightEstimate: number,
  maxPanelHeight: number,
): number {
  const natural = measuredHeight > 0 ? measuredHeight : layoutHeightEstimate;
  return Math.min(natural, maxPanelHeight);
}

export function computePopoutViewportMaxHeight(
  viewport: OverlayVisibleViewport,
  top: number,
  padding: number,
  maxPanelHeight: number,
): number {
  const viewportFitMaxHeight = Math.max(
    200,
    visibleBottom(viewport) - top - padding,
  );
  return Math.min(maxPanelHeight, viewportFitMaxHeight);
}

export function computeFittedPopoutTop(
  top: number,
  panelMaxHeight: number,
  viewport: OverlayVisibleViewport,
  padding: number,
): number {
  const minTop = viewport.offsetTop + padding;
  const maxTop = visibleBottom(viewport) - panelMaxHeight - padding;
  return Math.max(minTop, Math.min(top, Math.max(minTop, maxTop)));
}

/** Keep the quick profile card inside the viewport; flip above the anchor when needed. */
export function resolveMemberPopoutTop(
  params: ResolveMemberPopoutTopParams,
): number {
  const { desiredTop, panelHeight, viewport, padding, anchor, source, gap } =
    params;
  const minTop = viewport.offsetTop + padding;
  const maxTop = Math.max(
    minTop,
    visibleBottom(viewport) - panelHeight - padding,
  );
  const clampTop = (value: number) => Math.min(Math.max(value, minTop), maxTop);

  const spaceBelow = visibleBottom(viewport) - anchor.bottom - padding;
  const spaceAbove = anchor.top - viewport.offsetTop - padding;

  const isChatSource = source === 'chat-avatar' || source === 'chat-name';
  if (isChatSource) {
    const preferredBelowTop =
      source === 'chat-avatar' ? anchor.top - 24 : anchor.top - 42;
    const preferredAboveTop = anchor.bottom - panelHeight - gap;

    if (spaceBelow >= panelHeight + gap) {
      return clampTop(preferredBelowTop);
    }
    if (spaceAbove >= panelHeight + gap) {
      return Math.max(preferredAboveTop, minTop);
    }
    if (spaceBelow >= spaceAbove) {
      return clampTop(preferredBelowTop);
    }
    return Math.max(Math.min(preferredAboveTop, maxTop), minTop);
  }

  if (source === 'member-list') {
    let preferredTop = desiredTop;
    const bottomAlignedTop = visibleBottom(viewport) - panelHeight - padding;
    if (preferredTop > bottomAlignedTop) {
      preferredTop = bottomAlignedTop;
    }
    return clampTop(preferredTop);
  }

  if (source === 'vc-panel') {
    if (spaceBelow >= panelHeight + gap) {
      return clampTop(desiredTop);
    }
    if (spaceAbove >= panelHeight + gap) {
      const aboveTop = anchor.top - panelHeight - gap;
      return Math.max(Math.min(aboveTop, maxTop), minTop);
    }
    if (spaceBelow >= spaceAbove) {
      return clampTop(desiredTop);
    }
    const aboveTop = anchor.bottom - panelHeight - gap;
    return Math.max(Math.min(aboveTop, maxTop), minTop);
  }

  return clampTop(desiredTop);
}

export function popoutCardNeedsFixedHeight(
  naturalHeight: number,
  panelMaxHeight: number,
): boolean {
  return naturalHeight > panelMaxHeight;
}
