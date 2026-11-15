/** Crop-box geometry in normalized image coordinates (0..1). Pure, unit tested. */

export type Rect = { x: number; y: number; w: number; h: number };
export type Corner = 'tl' | 'tr' | 'bl' | 'br';

export const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };
/** Smallest crop, as a fraction of each side. */
export const MIN_SIZE = 0.1;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Drag one corner by (dx, dy); the opposite corner stays put. */
export function dragCorner(r: Rect, corner: Corner, dx: number, dy: number): Rect {
  let left = r.x;
  let top = r.y;
  let right = r.x + r.w;
  let bottom = r.y + r.h;
  if (corner === 'tl' || corner === 'bl') left = clamp(left + dx, 0, right - MIN_SIZE);
  else right = clamp(right + dx, left + MIN_SIZE, 1);
  if (corner === 'tl' || corner === 'tr') top = clamp(top + dy, 0, bottom - MIN_SIZE);
  else bottom = clamp(bottom + dy, top + MIN_SIZE, 1);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Move the whole box, keeping it inside the image. */
export function moveRect(r: Rect, dx: number, dy: number): Rect {
  return { ...r, x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h) };
}

/** Pixel rectangle for the image manipulator, rounded and kept inside the image. */
export function toPixels(r: Rect, width: number, height: number) {
  const originX = Math.min(width - 1, Math.round(r.x * width));
  const originY = Math.min(height - 1, Math.round(r.y * height));
  return {
    originX,
    originY,
    width: Math.max(1, Math.min(width - originX, Math.round(r.w * width))),
    height: Math.max(1, Math.min(height - originY, Math.round(r.h * height))),
  };
}

export function isFull(r: Rect): boolean {
  return r.x < 0.001 && r.y < 0.001 && r.w > 0.999 && r.h > 0.999;
}

/** Where an image of (iw × ih) sits when fitted ("contain") into a (cw × ch) box. */
export function fitContain(iw: number, ih: number, cw: number, ch: number) {
  const scale = Math.min(cw / iw, ch / ih);
  const w = iw * scale;
  const h = ih * scale;
  return { left: (cw - w) / 2, top: (ch - h) / 2, width: w, height: h };
}
