import { describe, expect, it } from 'vitest';

import { FULL, MIN_SIZE, dragCorner, fitContain, isFull, moveRect, toPixels } from '../src/lib/crop';

describe('crop geometry', () => {
  it('drags corners while keeping the opposite corner fixed', () => {
    const r = dragCorner(FULL, 'tl', 0.2, 0.1);
    expect(r).toEqual({ x: 0.2, y: 0.1, w: 0.8, h: 0.9 });
    const r2 = dragCorner(r, 'br', -0.3, -0.4);
    expect(r2.x).toBeCloseTo(0.2);
    expect(r2.w).toBeCloseTo(0.5);
    expect(r2.h).toBeCloseTo(0.5);
  });

  it('never goes outside the image or below the minimum size', () => {
    expect(dragCorner(FULL, 'tl', -1, -1)).toEqual(FULL);
    const tiny = dragCorner(FULL, 'tr', -5, 5);
    expect(tiny.w).toBeCloseTo(MIN_SIZE);
    expect(tiny.h).toBeCloseTo(MIN_SIZE);
    expect(tiny.x + tiny.w).toBeLessThanOrEqual(1);
  });

  it('moves the box within bounds', () => {
    expect(moveRect({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 1, -1)).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
  });

  it('converts to pixel rectangles inside the image', () => {
    expect(toPixels({ x: 0.25, y: 0.5, w: 0.5, h: 0.5 }, 4000, 3000)).toEqual({ originX: 1000, originY: 1500, width: 2000, height: 1500 });
    const p = toPixels({ x: 0.9999, y: 0, w: 0.0002, h: 1 }, 101, 100);
    expect(p.originX + p.width).toBeLessThanOrEqual(101);
    expect(p.width).toBeGreaterThanOrEqual(1);
  });

  it('detects an uncropped box and fits images into a frame', () => {
    expect(isFull(FULL)).toBe(true);
    expect(isFull({ x: 0.1, y: 0, w: 0.9, h: 1 })).toBe(false);
    expect(fitContain(4000, 3000, 400, 600)).toEqual({ left: 0, top: 150, width: 400, height: 300 });
  });
});
