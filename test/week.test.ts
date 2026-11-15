import { describe, expect, it } from 'vitest';

import type { Recipe } from '../src/lib/types';
import { addDays, dayLabel, startOfWeek, suggestRecipes, weekDays } from '../src/lib/week';

describe('week dates', () => {
  it('finds Monday as the start of the week', () => {
    expect(startOfWeek('2026-11-15')).toBe('2026-11-09'); // Sunday → previous Monday
    expect(startOfWeek('2026-11-16')).toBe('2026-11-16'); // Monday
    expect(startOfWeek('2026-11-21')).toBe('2026-11-16'); // Saturday
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekDays('2026-12-28')).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  });

  it('labels nearby days', () => {
    expect(dayLabel('2026-11-15', '2026-11-15')).toBe('Today');
    expect(dayLabel('2026-11-16', '2026-11-15')).toBe('Tomorrow');
    expect(dayLabel('2026-11-14', '2026-11-15')).toBe('Yesterday');
  });
});

const r = (title: string, tags: string[] = [], items: string[] = [], favorite = false): Recipe => ({
  id: title,
  title,
  description: null,
  servings: null,
  prepTime: null,
  cookTime: null,
  totalTime: null,
  ingredients: items.map((item, i) => ({ id: String(i), section: null, text: item, item, quantity: null })),
  steps: [],
  notes: null,
  tags,
  source: { type: 'manual', url: null, name: null },
  media: [],
  favorite,
  createdAt: 0,
  updatedAt: 0,
});

describe('suggestRecipes', () => {
  const recipes = [
    r('Chicken Tikka Masala', ['indian', 'dinner'], ['chicken thighs']),
    r('Lemon Chicken', ['dinner'], ['chicken breast'], true),
    r('Chickpea Curry', ['vegetarian'], ['chickpeas']),
    r('Beef Chili', ['dinner'], ['ground beef']),
    r('Weeknight Pasta', ['quick'], ['spaghetti']),
  ];

  it('ranks title starts, then title words (favorites first), then the rest', () => {
    expect(suggestRecipes(recipes, 'chi').map((x) => x.title)).toEqual(['Chicken Tikka Masala', 'Chickpea Curry', 'Lemon Chicken', 'Beef Chili']);
  });

  it('matches tags and ingredients when the title does not', () => {
    expect(suggestRecipes(recipes, 'quick').map((x) => x.title)).toEqual(['Weeknight Pasta']);
    expect(suggestRecipes(recipes, 'spaghetti').map((x) => x.title)).toEqual(['Weeknight Pasta']);
  });

  it('returns nothing for empty text and respects the limit', () => {
    expect(suggestRecipes(recipes, '  ')).toEqual([]);
    expect(suggestRecipes(recipes, 'dinner', 2)).toHaveLength(2);
  });
});
