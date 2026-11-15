import { describe, expect, it } from 'vitest';

import { parseShareFile, planImport, slugify } from '../src/lib/sharefile';
import type { Recipe } from '../src/lib/types';

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: 'r1',
  title: 'Grandma’s Apple Pie',
  description: null,
  servings: '8',
  prepTime: null,
  cookTime: null,
  totalTime: null,
  ingredients: [{ id: 'i', section: null, text: '6 apples', item: 'apples', quantity: '6' }],
  steps: [{ id: 's', section: null, text: 'Bake.' }],
  notes: null,
  tags: ['dessert'],
  source: { type: 'camera', url: null, name: 'Grandma' },
  media: [{ id: 'm1', kind: 'image', localPath: null, remoteUrl: null, caption: null }],
  favorite: false,
  createdAt: 1,
  updatedAt: 100,
  ...over,
});

const file = (r: Recipe, version = 1) =>
  JSON.stringify({ format: 'recipebox', version, exportedAt: 5, entries: [{ recipe: r, files: { m1: { ext: 'jpg', base64: 'AAAA' } } }] });

describe('share files', () => {
  it('parses a valid file and fills defaults', () => {
    const parsed = parseShareFile(file(recipe()));
    expect(parsed.entries[0].recipe.title).toBe('Grandma’s Apple Pie');
    expect(parsed.entries[0].files.m1.ext).toBe('jpg');
    expect(parsed.entries[0].sharedBy).toBeNull();
  });

  it('rejects garbage and future versions with clear messages', () => {
    expect(() => parseShareFile('not json')).toThrow(/isn't a RecipeBox/);
    expect(() => parseShareFile('{"format":"other"}')).toThrow(/valid RecipeBox/);
    expect(() => parseShareFile(file(recipe(), 2))).toThrow(/newer version/);
  });

  it('adds new recipes, updates older copies, and keeps newer local edits', () => {
    const incoming = parseShareFile(file(recipe({ updatedAt: 200 })));
    expect(planImport(incoming, new Map()).map((a) => a.kind)).toEqual(['add']);
    expect(planImport(incoming, new Map([['r1', recipe({ updatedAt: 150 })]])).map((a) => a.kind)).toEqual(['update']);
    expect(planImport(incoming, new Map([['r1', recipe({ updatedAt: 200 })]])).map((a) => a.kind)).toEqual(['skip']);
  });

  it('makes safe file names', () => {
    expect(slugify('Grandma’s Apple Pie!!')).toBe('grandmas-apple-pie');
    expect(slugify('***')).toBe('recipe');
  });
});
