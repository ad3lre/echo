/**
 * Placeholder rows for Echo channel history load — mirrors MessageBubble grouping:
 * `grouped: false` → avatar + name row + body lines; `true` → gutter + body only.
 * Length ~ first history page density (see `ECHO_CHANNEL_MESSAGE_PAGE_SIZE` in `features/chat/constants/echoHistoryPageSize.ts`).
 */
export type HistorySkeletonRow = {
  grouped: boolean;
  /** Tailwind width classes for body line placeholders (new line per entry). */
  lineWidths: string[];
};

export const HISTORY_SKELETON_ROWS: HistorySkeletonRow[] = [
  { grouped: false, lineWidths: ['w-[min(92%,24rem)]', 'w-[min(58%,17rem)]'] },
  { grouped: true, lineWidths: ['w-[min(88%,22rem)]'] },
  { grouped: true, lineWidths: ['w-[min(42%,12rem)]'] },
  { grouped: false, lineWidths: ['w-[min(95%,26rem)]', 'w-[min(70%,19rem)]'] },
  { grouped: true, lineWidths: ['w-[min(90%,24rem)]', 'w-[min(62%,16rem)]'] },
  { grouped: true, lineWidths: ['w-[min(36%,11rem)]'] },
  { grouped: false, lineWidths: ['w-[min(80%,21rem)]'] },
  {
    grouped: false,
    lineWidths: [
      'w-[min(86%,23rem)]',
      'w-[min(52%,14rem)]',
      'w-[min(68%,18rem)]',
    ],
  },
  { grouped: true, lineWidths: ['w-[min(93%,25rem)]'] },
  { grouped: true, lineWidths: ['w-[min(48%,15rem)]'] },
  { grouped: false, lineWidths: ['w-[min(91%,24rem)]', 'w-[min(66%,18rem)]'] },
  { grouped: true, lineWidths: ['w-[min(78%,20rem)]'] },
  { grouped: true, lineWidths: ['w-[min(88%,22rem)]', 'w-[min(44%,13rem)]'] },
  { grouped: false, lineWidths: ['w-[min(84%,22rem)]'] },
  { grouped: true, lineWidths: ['w-[min(72%,19rem)]'] },
  { grouped: true, lineWidths: ['w-[min(56%,16rem)]'] },
  {
    grouped: false,
    lineWidths: [
      'w-[min(89%,23rem)]',
      'w-[min(61%,17rem)]',
      'w-[min(40%,12rem)]',
    ],
  },
  { grouped: true, lineWidths: ['w-[min(94%,25rem)]'] },
];
