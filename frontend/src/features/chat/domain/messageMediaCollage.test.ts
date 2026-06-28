import { describe, it, expect } from 'vitest';
import {
  planMediaCollage,
  CHAT_MEDIA_BOX_HEIGHT_PX,
  type CollageSourceItem,
} from './messageMediaCollage';

const items = (n: number): CollageSourceItem[] =>
  Array.from({ length: n }, (_, i) => ({ url: `u${i}`, alt: `a${i}` }));

describe('planMediaCollage', () => {
  it('returns null for no items', () => {
    expect(planMediaCollage([])).toBeNull();
  });

  it('single image is shown whole (contain), full cell', () => {
    const plan = planMediaCollage(items(1))!;
    expect(plan.cells).toHaveLength(1);
    expect(plan.cells[0].fit).toBe('contain');
    expect(plan.cells[0].overflowCount).toBe(0);
  });

  it('2 images: side by side, cover', () => {
    const plan = planMediaCollage(items(2))!;
    expect(plan.cells).toHaveLength(2);
    expect(plan.rows).toBe('1fr');
    expect(plan.cells.every((c) => c.fit === 'cover')).toBe(true);
    expect(plan.cells.every((c) => c.overflowCount === 0)).toBe(true);
  });

  it('3 images: one tall + two stacked', () => {
    const plan = planMediaCollage(items(3))!;
    expect(plan.cells).toHaveLength(3);
    expect(plan.cells[0].gridRow).toBe('1 / -1');
    expect(plan.cells[1].gridRow).toBe('1 / 2');
    expect(plan.cells[2].gridRow).toBe('2 / 3');
  });

  it('4 images: 2x2, all visible, no overflow', () => {
    const plan = planMediaCollage(items(4))!;
    expect(plan.cells).toHaveLength(4);
    expect(plan.cells.every((c) => c.overflowCount === 0)).toBe(true);
  });

  it('5+ images: 3 visible + 4th cell badged "+N" (N = total-3)', () => {
    const plan = planMediaCollage(items(7))!;
    expect(plan.cells).toHaveLength(4);
    expect(plan.cells.slice(0, 3).every((c) => c.overflowCount === 0)).toBe(
      true,
    );
    expect(plan.cells[3].overflowCount).toBe(4); // 7 - 3
  });

  it('exactly 5 -> "+2"', () => {
    expect(planMediaCollage(items(5))!.cells[3].overflowCount).toBe(2);
  });

  it('reserved box height matches 16:9 at max width', () => {
    expect(CHAT_MEDIA_BOX_HEIGHT_PX).toBe(360);
  });

  it('carries the isGif flag through to cells (images + GIFs share the box)', () => {
    const mixed: CollageSourceItem[] = [
      { url: 'a.png', alt: 'still' },
      { url: 'b.gif', alt: 'anim', isGif: true },
    ];
    const plan = planMediaCollage(mixed)!;
    expect(plan.cells).toHaveLength(2);
    expect(plan.cells[0].item.isGif).toBeFalsy();
    expect(plan.cells[1].item.isGif).toBe(true);
  });
});
