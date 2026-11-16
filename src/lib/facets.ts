/** Ingredient/tag filters for the meal-ideas page (pure, unit tested). */
import type { Recipe } from './types';

export type FacetKind = 'tag' | 'ingredient';
export type Facet = { key: string; kind: FacetKind; label: string; count: number };

/** Words that end in "s" but aren't plurals. */
const NOT_PLURAL = new Set(['molasses', 'hummus', 'couscous', 'asparagus', 'citrus', 'swiss', 'brussels', 'grits', 'oats', 'lemongrass', 'bass', 'harissa', 'chips']);

function singular(word: string): string {
  if (NOT_PLURAL.has(word) || word.endsWith('ss')) return word;
  if (/ies$/.test(word)) return word.slice(0, -3) + 'y';
  if (/(oes|ches|shes|xes)$/.test(word)) return word.slice(0, -2);
  if (/[^s]s$/.test(word)) return word.slice(0, -1);
  return word;
}

/** "Yellow Onions" → "yellow onion", so the same ingredient groups together across recipes. */
export function normalizeItem(item: string): string {
  const words = item
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '';
  words[words.length - 1] = singular(words[words.length - 1]);
  return words.join(' ');
}

const keyOf = (kind: FacetKind, value: string) => `${kind}:${value}`;

export function recipeFacetKeys(r: Recipe): Set<string> {
  const keys = new Set<string>();
  for (const t of r.tags) if (t.trim()) keys.add(keyOf('tag', t.trim().toLowerCase()));
  for (const i of r.ingredients) {
    const n = normalizeItem(i.item);
    if (n) keys.add(keyOf('ingredient', n));
  }
  return keys;
}

/** Recipes that have every selected ingredient/tag. */
export function filterRecipes(recipes: Recipe[], selected: string[]): Recipe[] {
  if (!selected.length) return recipes;
  return recipes.filter((r) => {
    const keys = recipeFacetKeys(r);
    return selected.every((k) => keys.has(k));
  });
}

/**
 * Filters you could add next, with how many of the matching recipes have each one.
 * Only options that still match at least one recipe are offered, so every tap narrows the list.
 */
export function availableFacets(matching: Recipe[], selected: string[]): Facet[] {
  const counts = new Map<string, number>();
  for (const r of matching) for (const k of recipeFacetKeys(r)) if (!selected.includes(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => {
      const [kind, ...rest] = key.split(':');
      return { key, kind: kind as FacetKind, label: rest.join(':'), count };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function facetLabel(key: string): string {
  return key.slice(key.indexOf(':') + 1);
}
