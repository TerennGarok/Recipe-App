/** Dates and recipe suggestions for the meal planner (pure, unit tested). Days are local "YYYY-MM-DD" keys. */
import type { Recipe } from './types';

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type Meal = (typeof MEALS)[number];
export const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** Monday of the week containing `key`. */
export function startOfWeek(key: string): string {
  const day = fromKey(key).getDay(); // 0 = Sunday
  return addDays(key, -((day + 6) % 7));
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function dayLabel(key: string, today: string): string {
  if (key === today) return 'Today';
  if (key === addDays(today, 1)) return 'Tomorrow';
  if (key === addDays(today, -1)) return 'Yesterday';
  return fromKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function weekRangeLabel(start: string): string {
  const a = fromKey(start);
  const b = fromKey(addDays(start, 6));
  const md = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${md(a)} – ${a.getMonth() === b.getMonth() ? b.getDate() : md(b)}`;
}

/** Recipes matching what's typed so far, best first: title start > title word > title > tag > ingredient. */
export function suggestRecipes(recipes: Recipe[], text: string, limit = 6): Recipe[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const scored: { r: Recipe; score: number }[] = [];
  for (const r of recipes) {
    const title = r.title.toLowerCase();
    let score = 0;
    if (title.startsWith(q)) score = 100;
    else if (title.split(/[\s\-,'’]+/).some((w) => w.startsWith(q))) score = 80;
    else if (title.includes(q)) score = 60;
    else if (r.tags.some((t) => t.toLowerCase().startsWith(q))) score = 40;
    else if (r.ingredients.some((i) => i.item.toLowerCase().includes(q))) score = 20;
    if (score) scored.push({ r, score: score + (r.favorite ? 5 : 0) });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.r.title.localeCompare(b.r.title))
    .slice(0, limit)
    .map((s) => s.r);
}
