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
