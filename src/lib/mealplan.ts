import { useEffect, useState } from 'react';

import { getDb, notify, useDbVersion } from './db';
import { newId } from './id';
import { MEALS, addDays, type Meal } from './week';

export type PlanEntry = {
  id: string;
  /** "YYYY-MM-DD" */
  day: string;
  meal: Meal;
  /** Linked recipe, or null for a typed-in entry ("Leftovers", "Pizza night"). */
  recipeId: string | null;
  title: string;
  createdAt: number;
};

type Row = { id: string; day: string; meal: string; recipe_id: string | null; title: string; created_at: number };

const toEntry = (r: Row): PlanEntry => ({
  id: r.id,
  day: r.day,
  meal: (MEALS as readonly string[]).includes(r.meal) ? (r.meal as Meal) : 'dinner',
  recipeId: r.recipe_id,
  title: r.title,
  createdAt: r.created_at,
});

export async function addPlanEntry(e: { day: string; meal: Meal; recipeId: string | null; title: string }): Promise<void> {
  await getDb().runAsync('INSERT INTO meal_plan (id, day, meal, recipe_id, title, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
    newId(),
    e.day,
    e.meal,
    e.recipeId,
    e.title.trim(),
    Date.now(),
  ]);
  notify();
}

export async function updatePlanEntry(id: string, changes: Partial<Pick<PlanEntry, 'day' | 'meal'>>): Promise<void> {
  if (changes.day) await getDb().runAsync('UPDATE meal_plan SET day = ? WHERE id = ?', [changes.day, id]);
  if (changes.meal) await getDb().runAsync('UPDATE meal_plan SET meal = ? WHERE id = ?', [changes.meal, id]);
  notify();
}

export async function removePlanEntry(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM meal_plan WHERE id = ?', [id]);
  notify();
}

/** Entries for the 7 days starting at `start`, ordered by day, then meal, then when added. */
export function useWeekPlan(start: string): PlanEntry[] | null {
  const v = useDbVersion();
  const [entries, setEntries] = useState<PlanEntry[] | null>(null);
  useEffect(() => {
    let live = true;
    getDb()
      .getAllAsync<Row>('SELECT * FROM meal_plan WHERE day >= ? AND day <= ? ORDER BY day, created_at', [start, addDays(start, 6)])
      .then((rows) => {
        if (!live) return;
        const list = rows.map(toEntry);
        list.sort((a, b) => a.day.localeCompare(b.day) || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) || a.createdAt - b.createdAt);
        setEntries(list);
      });
    return () => {
      live = false;
    };
  }, [start, v]);
  return entries;
}

/** Upcoming days this recipe is planned for (shown on the recipe page). */
export function useRecipePlanDays(recipeId: string | undefined, fromDay: string): PlanEntry[] {
  const v = useDbVersion();
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  useEffect(() => {
    if (!recipeId) return;
    getDb()
      .getAllAsync<Row>('SELECT * FROM meal_plan WHERE recipe_id = ? AND day >= ? ORDER BY day', [recipeId, fromDay])
      .then((rows) => setEntries(rows.map(toEntry)));
  }, [recipeId, fromDay, v]);
  return entries;
}
