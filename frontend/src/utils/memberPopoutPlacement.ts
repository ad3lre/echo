import type {
  PopoutAnchorRect,
  PopoutAnchorSource,
} from '@/utils/memberProfiles';

export type ResolveMemberPopoutTopParams = {
  desiredTop: number;
  panelHeight: number;
  viewportHeight: number;
  padding: number;
  anchor: PopoutAnchorRect;
  source: PopoutAnchorSource;
  gap: number;
};

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
  viewportHeight: number,
  top: number,
  padding: number,
  maxPanelHeight: number,
): number {
  const viewportFitMaxHeight = Math.max(200, viewportHeight - top - padding);
  return Math.min(maxPanelHeight, viewportFitMaxHeight);
}

export function computeFittedPopoutTop(
  top: number,
  panelMaxHeight: number,
  viewportHeight: number,
  padding: number,
): number {
  return Math.max(
    padding,
    Math.min(top, viewportHeight - panelMaxHeight - padding),
  );
}

/** Keep the quick profile card inside the viewport; flip above the anchor when needed. */
export function resolveMemberPopoutTop(
  params: ResolveMemberPopoutTopParams,
): number {
  const {
    desiredTop,
    panelHeight,
    viewportHeight,
    padding,
    anchor,
    source,
    gap,
  } = params;
  const maxTop = Math.max(padding, viewportHeight - panelHeight - padding);
  const clampTop = (value: number) =>
    Math.min(Math.max(value, padding), maxTop);

  const spaceBelow = viewportHeight - anchor.bottom - padding;
  const spaceAbove = anchor.top - padding;

  const isChatSource = source === 'chat-avatar' || source === 'chat-name';
  if (isChatSource) {
    const preferredBelowTop =
      source === 'chat-avatar' ? anchor.top - 24 : anchor.top - 42;
    const preferredAboveTop = anchor.bottom - panelHeight - gap;

    if (spaceBelow >= panelHeight + gap) {
      return clampTop(preferredBelowTop);
    }
    if (spaceAbove >= panelHeight + gap) {
      return Math.max(preferredAboveTop, padding);
    }
    if (spaceBelow >= spaceAbove) {
      return clampTop(preferredBelowTop);
    }
    return Math.max(Math.min(preferredAboveTop, maxTop), padding);
  }

  if (source === 'member-list') {
    let preferredTop = desiredTop;
    const bottomAlignedTop = viewportHeight - panelHeight - padding;
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
      return Math.max(Math.min(aboveTop, maxTop), padding);
    }
    if (spaceBelow >= spaceAbove) {
      return clampTop(desiredTop);
    }
    const aboveTop = anchor.bottom - panelHeight - gap;
    return Math.max(Math.min(aboveTop, maxTop), padding);
  }

  return clampTop(desiredTop);
}

export function popoutCardNeedsFixedHeight(
  naturalHeight: number,
  panelMaxHeight: number,
): boolean {
  return naturalHeight > panelMaxHeight;
}
