import { describe, expect, it } from 'vitest';

import { availableFacets, filterRecipes, normalizeItem } from '../src/lib/facets';
import type { Recipe } from '../src/lib/types';

const recipe = (id: string, tags: string[], items: string[]): Recipe => ({
  id,
  title: id,
  description: null,
  servings: null,
  prepTime: null,
  cookTime: null,
  totalTime: null,
  ingredients: items.map((item, i) => ({ id: `${id}-${i}`, section: null, text: item, item, quantity: null })),
  steps: [],
  notes: null,
  tags,
  source: { type: 'manual', url: null, name: null },
  media: [],
  favorite: false,
  createdAt: 0,
  updatedAt: 0,
});

const recipes = [
  recipe('chili', ['dinner', 'Mexican'], ['ground beef', 'Yellow Onions', 'tomatoes']),
  recipe('tacos', ['dinner', 'mexican'], ['ground beef', 'tortillas', 'yellow onion']),
  recipe('pancakes', ['breakfast'], ['flour', 'eggs']),
];

describe('meal idea filters', () => {
  it('normalizes ingredient names', () => {
    expect(normalizeItem('Yellow Onions')).toBe('yellow onion');
    expect(normalizeItem('cherries')).toBe('cherry');
    expect(normalizeItem('potatoes')).toBe('potato');
    expect(normalizeItem('peaches')).toBe('peach');
    expect(normalizeItem('molasses')).toBe('molasses');
    expect(normalizeItem('Swiss chard')).toBe('swiss chard');
  });

  it('narrows with every selection (all selected filters must match)', () => {
    expect(filterRecipes(recipes, []).length).toBe(3);
    expect(filterRecipes(recipes, ['tag:dinner']).map((r) => r.id)).toEqual(['chili', 'tacos']);
    expect(filterRecipes(recipes, ['tag:dinner', 'ingredient:tomato']).map((r) => r.id)).toEqual(['chili']);
    expect(filterRecipes(recipes, ['tag:mexican', 'ingredient:yellow onion']).map((r) => r.id)).toEqual(['chili', 'tacos']);
  });

  it('only offers filters that still match, with counts', () => {
    const matching = filterRecipes(recipes, ['tag:dinner']);
    const facets = availableFacets(matching, ['tag:dinner']);
    expect(facets.find((f) => f.key === 'ingredient:ground beef')?.count).toBe(2);
    expect(facets.find((f) => f.key === 'tag:mexican')?.count).toBe(2);
    expect(facets.some((f) => f.key === 'ingredient:flour')).toBe(false);
    expect(facets.some((f) => f.key === 'tag:dinner')).toBe(false);
    expect(facets[0].count).toBeGreaterThanOrEqual(facets[facets.length - 1].count);
  });
});
