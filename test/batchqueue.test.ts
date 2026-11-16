import { describe, expect, it } from 'vitest';

import { canCombine, combineWithPrevious, nextToRun, parseLinks, resetInterrupted, splitPages, summarize, type BatchItem } from '../src/lib/batchqueue';

const photo = (id: string, pages = [`${id}.jpg`], status: BatchItem['status'] = 'waiting'): BatchItem => ({
  id,
  kind: 'photos',
  pages,
  url: null,
  status,
  error: null,
  recipeId: null,
  title: null,
});
const link = (id: string, status: BatchItem['status'] = 'waiting'): BatchItem => ({ ...photo(id), kind: 'link', pages: [], url: `https://x.com/${id}`, status });

describe('batch queue', () => {
  it('parses distinct links from pasted text', () => {
    expect(parseLinks('https://a.com/1\nsee https://b.com/2). and https://a.com/1\nnot a link')).toEqual(['https://a.com/1', 'https://b.com/2']);
    expect(parseLinks('')).toEqual([]);
  });

  it('combines a photo into the previous recipe and splits it back', () => {
    const items = [photo('a'), photo('b'), photo('c')];
    const combined = combineWithPrevious(items, 'b');
    expect(combined.map((i) => [i.id, i.pages])).toEqual([
      ['a', ['a.jpg', 'b.jpg']],
      ['c', ['c.jpg']],
    ]);
    let n = 0;
    const split = splitPages(combined, 'a', () => `new${n++}`);
    expect(split.map((i) => [i.id, i.pages])).toEqual([
      ['a', ['a.jpg']],
      ['new0', ['b.jpg']],
      ['c', ['c.jpg']],
    ]);
  });

  it('only combines waiting/failed photo items that have a photo item before them', () => {
    const items = [link('l'), photo('a'), photo('b', ['b.jpg'], 'done'), photo('c')];
    expect(canCombine(items, 'a')).toBe(false); // previous is a link
    expect(canCombine(items, 'c')).toBe(false); // previous is done
    expect(canCombine(items, 'l')).toBe(false); // first item
    expect(combineWithPrevious(items, 'a')).toBe(items);
  });

  it('starts items in order up to the concurrency limit', () => {
    const items = [photo('a', undefined, 'done'), photo('b', undefined, 'working'), photo('c'), link('d'), photo('e')];
    expect(nextToRun(items, 2).map((i) => i.id)).toEqual(['c']);
    expect(nextToRun(items, 1)).toEqual([]);
    expect(nextToRun(resetInterrupted(items), 2).map((i) => i.id)).toEqual(['b', 'c']);
  });

  it('summarizes progress', () => {
    expect(summarize([photo('a', undefined, 'done'), photo('b', undefined, 'failed'), photo('c')])).toEqual({ total: 3, waiting: 1, working: 0, done: 1, failed: 1 });
  });
});
