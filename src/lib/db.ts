import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import type { Recipe } from './types';

let db: SQLiteDatabase | null = null;

export function getDb(): SQLiteDatabase {
  if (!db) {
    db = openDatabaseSync('recipebox.db');
    db.execSync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS recipes (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        search_text TEXT NOT NULL,
        favorite INTEGER NOT NULL DEFAULT 0,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS recipes_updated ON recipes(updated_at DESC);
      CREATE TABLE IF NOT EXISTS claude_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        kind TEXT NOT NULL,
        cost REAL NOT NULL,
        ok INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meal_plan (
        id TEXT PRIMARY KEY NOT NULL,
        day TEXT NOT NULL,
        meal TEXT NOT NULL,
        recipe_id TEXT,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS meal_plan_day ON meal_plan(day);
    `);
  }
  return db;
}

// --- tiny change-notification so screens refresh after edits ---
let version = 0;
const listeners = new Set<() => void>();
export function notify() {
  version++;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useDbVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

function searchText(r: Recipe): string {
  return [r.title, r.description, r.tags.join(' '), r.source.name, ...r.ingredients.map((i) => i.text), r.notes]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

type Row = { data: string };

export async function listRecipes(query = '', favoritesOnly = false): Promise<Recipe[]> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const where: string[] = [];
  const params: (string | number)[] = [];
  for (const t of terms) {
    where.push('search_text LIKE ?');
    params.push(`%${t}%`);
  }
  if (favoritesOnly) where.push('favorite = 1');
  const sql = `SELECT data FROM recipes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC`;
  const rows = await getDb().getAllAsync<Row>(sql, params);
  return rows.map((r) => JSON.parse(r.data) as Recipe);
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const row = await getDb().getFirstAsync<Row>('SELECT data FROM recipes WHERE id = ?', [id]);
  return row ? (JSON.parse(row.data) as Recipe) : null;
}

export async function saveRecipe(recipe: Recipe, opts: { touch?: boolean } = {}): Promise<Recipe> {
  const r = opts.touch === false ? recipe : { ...recipe, updatedAt: Date.now() };
  await getDb().runAsync(
    `INSERT INTO recipes (id, title, search_text, favorite, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, search_text=excluded.search_text,
       favorite=excluded.favorite, data=excluded.data, updated_at=excluded.updated_at`,
    [r.id, r.title, searchText(r), r.favorite ? 1 : 0, JSON.stringify(r), r.createdAt, r.updatedAt],
  );
  notify();
  return r;
}

export async function deleteRecipeRow(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM recipes WHERE id = ?', [id]);
  notify();
}

/** Load a recipe and keep it fresh when the database changes. */
export function useRecipe(id: string | undefined) {
  const v = useDbVersion();
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    if (!id) return;
    getRecipe(id).then((r) => live && setRecipe(r));
    return () => {
      live = false;
    };
  }, [id, v]);
  return recipe;
}

export function useRecipeList(query: string, favoritesOnly: boolean) {
  const v = useDbVersion();
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const reload = useCallback(() => listRecipes(query, favoritesOnly).then(setRecipes), [query, favoritesOnly]);
  useEffect(() => {
    reload();
  }, [reload, v]);
  return recipes;
}
