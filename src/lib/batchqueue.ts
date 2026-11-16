/** Batch-import queue rules (pure, unit tested). The store and worker live in batch.ts. */

export type BatchStatus = 'waiting' | 'working' | 'done' | 'failed';

export type BatchItem = {
  id: string;
  kind: 'photos' | 'link' | 'pdf';
  /** Files in the batch folder: photos in page order (one recipe can span several photos), or one PDF. */
  pages: string[];
  url: string | null;
  /** Original name of a PDF, for display. */
  fileName?: string | null;
  /** Every recipe created from this item (a PDF can hold several). */
  results?: { id: string; title: string }[];
  status: BatchStatus;
  error: string | null;
  recipeId: string | null;
  title: string | null;
};

/** Every distinct http(s) link in pasted text (one per line, or mixed with other text). */
export function parseLinks(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  return [...new Set(found.map((u) => u.replace(/[).,;!?]+$/, '')))];
}

const editable = (i: BatchItem) => i.kind === 'photos' && (i.status === 'waiting' || i.status === 'failed');

/** Make this photo item extra pages of the photo item before it (e.g. the back of a card). */
export function combineWithPrevious(items: BatchItem[], id: string): BatchItem[] {
  const idx = items.findIndex((i) => i.id === id);
  const prev = items[idx - 1];
  const cur = items[idx];
  if (idx < 1 || !prev || !cur || !editable(prev) || !editable(cur)) return items;
  const merged: BatchItem = { ...prev, pages: [...prev.pages, ...cur.pages], status: 'waiting', error: null };
  return [...items.slice(0, idx - 1), merged, ...items.slice(idx + 1)];
}

/** Undo combining: each page becomes its own recipe again. */
export function splitPages(items: BatchItem[], id: string, makeId: () => string): BatchItem[] {
  const idx = items.findIndex((i) => i.id === id);
  const cur = items[idx];
  if (!cur || !editable(cur) || cur.pages.length < 2) return items;
  const parts = cur.pages.map((p, n) => ({ ...cur, id: n === 0 ? cur.id : makeId(), pages: [p], status: 'waiting' as const, error: null }));
  return [...items.slice(0, idx), ...parts, ...items.slice(idx + 1)];
}

export function canCombine(items: BatchItem[], id: string): boolean {
  const idx = items.findIndex((i) => i.id === id);
  return idx > 0 && editable(items[idx]) && editable(items[idx - 1]);
}

/** Items to start now, keeping at most `concurrency` running at once, in list order. */
export function nextToRun(items: BatchItem[], concurrency: number): BatchItem[] {
  const running = items.filter((i) => i.status === 'working').length;
  return items.filter((i) => i.status === 'waiting').slice(0, Math.max(0, concurrency - running));
}

export function summarize(items: BatchItem[]) {
  const count = (s: BatchStatus) => items.filter((i) => i.status === s).length;
  return { total: items.length, waiting: count('waiting'), working: count('working'), done: count('done'), failed: count('failed') };
}

/** After a restart nothing is actually running, so interrupted items go back in line. */
export function resetInterrupted(items: BatchItem[]): BatchItem[] {
  return items.map((i) => (i.status === 'working' ? { ...i, status: 'waiting' } : i));
}
