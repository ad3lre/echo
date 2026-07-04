/** Static channel-list placeholder layout while guild categories hydrate. */
export type ChannelPanelSkeletonSection = {
  key: string;
  headerWidth: string;
  rowWidths: string[];
};

export const CHANNEL_PANEL_SKELETON_SECTIONS: ChannelPanelSkeletonSection[] = [
  { key: 'a', headerWidth: '42%', rowWidths: ['68%', '54%', '61%'] },
  { key: 'b', headerWidth: '36%', rowWidths: ['58%', '49%'] },
  { key: 'c', headerWidth: '44%', rowWidths: ['64%', '52%', '47%'] },
];

function pctWidthFromLabelLength(len: number, min = 36, max = 72): string {
  const pct = Math.min(max, Math.max(min, 8 + len * 4));
  return `${pct}%`;
}

/** Shape the channel-panel skeleton from a cached category tree when available. */
export function buildChannelPanelSkeletonSectionsFromCategories(
  categories: readonly {
    id?: string;
    name: string;
    channels: readonly { name: string }[];
  }[],
): ChannelPanelSkeletonSection[] {
  if (!categories.length) return CHANNEL_PANEL_SKELETON_SECTIONS;
  const sections = categories
    .map((cat, index) => ({
      key: cat.id?.trim() || `cat-${index}`,
      headerWidth: pctWidthFromLabelLength(cat.name.length, 28, 52),
      rowWidths:
        cat.channels.length > 0
          ? cat.channels.map((ch) => pctWidthFromLabelLength(ch.name.length))
          : ['52%'],
    }))
    .filter((section) => section.rowWidths.length > 0);
  return sections.length > 0 ? sections : CHANNEL_PANEL_SKELETON_SECTIONS;
}
