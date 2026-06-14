/**
 * Placeholder rows for Echo channel history load — mirrors MessageBubble grouping:
 * `grouped: false` → avatar + name/time row + body lines; `true` → gutter + body only.
 * `nameWidth` / `timeWidth` size the header line so usernames read as varied (not a fixed bar).
 * Length ~ first history page density (see `ECHO_CHANNEL_MESSAGE_PAGE_SIZE` in `constants/echoHistoryPageSize.ts`).
 */
export type HistorySkeletonImageBlock = {
  aspectW: number;
  aspectH: number;
};

export type HistorySkeletonRow = {
  grouped: boolean;
  /** First row of a same-author cluster keeps header chrome but tightens the gap below. */
  clustered?: boolean;
  /** Tailwind width class for the author-name placeholder (header rows only). */
  nameWidth?: string;
  /** Tailwind width class for the inline timestamp placeholder (header rows only). */
  timeWidth?: string;
  /** Tailwind width classes for body line placeholders (new line per entry). */
  lineWidths: string[];
  /** Reserved media blocks that mirror attachment / image-slot aspect boxes. */
  imageBlocks?: HistorySkeletonImageBlock[];
};

export const HISTORY_SKELETON_ROWS: HistorySkeletonRow[] = [
  {
    grouped: false,
    nameWidth: 'w-28',
    timeWidth: 'w-10',
    lineWidths: ['w-[min(92%,24rem)]', 'w-[min(58%,17rem)]'],
  },
  { grouped: true, lineWidths: ['w-[min(88%,22rem)]'] },
  { grouped: true, lineWidths: ['w-[min(42%,12rem)]'] },
  {
    grouped: false,
    nameWidth: 'w-20',
    timeWidth: 'w-12',
    clustered: true,
    lineWidths: ['w-[min(95%,26rem)]', 'w-[min(70%,19rem)]'],
    imageBlocks: [{ aspectW: 16, aspectH: 9 }],
  },
  { grouped: true, lineWidths: ['w-[min(90%,24rem)]', 'w-[min(62%,16rem)]'] },
  { grouped: true, lineWidths: ['w-[min(36%,11rem)]'] },
  {
    grouped: false,
    nameWidth: 'w-32',
    timeWidth: 'w-10',
    lineWidths: ['w-[min(80%,21rem)]'],
    imageBlocks: [{ aspectW: 4, aspectH: 3 }],
  },
  {
    grouped: false,
    nameWidth: 'w-24',
    timeWidth: 'w-12',
    lineWidths: [
      'w-[min(86%,23rem)]',
      'w-[min(52%,14rem)]',
      'w-[min(68%,18rem)]',
    ],
  },
  { grouped: true, lineWidths: ['w-[min(93%,25rem)]'] },
  { grouped: true, lineWidths: ['w-[min(48%,15rem)]'] },
  {
    grouped: false,
    nameWidth: 'w-16',
    timeWidth: 'w-10',
    lineWidths: ['w-[min(91%,24rem)]', 'w-[min(66%,18rem)]'],
    imageBlocks: [{ aspectW: 1, aspectH: 1 }],
  },
  { grouped: true, lineWidths: ['w-[min(78%,20rem)]'] },
  { grouped: true, lineWidths: ['w-[min(88%,22rem)]', 'w-[min(44%,13rem)]'] },
  {
    grouped: false,
    nameWidth: 'w-28',
    timeWidth: 'w-12',
    lineWidths: ['w-[min(84%,22rem)]'],
  },
  { grouped: true, lineWidths: ['w-[min(72%,19rem)]'] },
  { grouped: true, lineWidths: ['w-[min(56%,16rem)]'] },
  {
    grouped: false,
    nameWidth: 'w-24',
    timeWidth: 'w-10',
    lineWidths: [
      'w-[min(89%,23rem)]',
      'w-[min(61%,17rem)]',
      'w-[min(40%,12rem)]',
    ],
    imageBlocks: [{ aspectW: 3, aspectH: 4 }],
  },
  { grouped: true, lineWidths: ['w-[min(94%,25rem)]'] },
];
