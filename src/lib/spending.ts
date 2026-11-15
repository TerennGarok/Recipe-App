import { useEffect, useState } from 'react';

import { getDb, notify, useDbVersion } from './db';
import { costUsd, type UsageLike } from './pricing';

/**
 * Tracks what this app spends on Claude. Anthropic has no API that reports a prepaid credit
 * balance, so the person enters their balance once and we subtract what we've spent since.
 */

export type UsageKind = 'recipe' | 'search';

/** Collects the cost of every API call made for one user action (e.g. one recipe import). */
export class Meter {
  private total = 0;
  constructor(private kind: UsageKind) {}

  add(model: string, usage: UsageLike) {
    this.total += costUsd(model, usage);
  }

  /** Record the action. Failed actions still cost money, but don't count toward the per-recipe average. */
  async save(ok: boolean) {
    if (this.total === 0) return;
    await getDb().runAsync('INSERT INTO claude_usage (at, kind, cost, ok) VALUES (?, ?, ?, ?)', [Date.now(), this.kind, this.total, ok ? 1 : 0]);
    notify();
  }
}

type Anchor = { amount: number; at: number };

async function getAnchor(): Promise<Anchor | null> {
  const row = await getDb().getFirstAsync<{ value: string }>('SELECT value FROM app_kv WHERE key = ?', ['balance_anchor']);
  return row ? (JSON.parse(row.value) as Anchor) : null;
}

export async function setBalance(amount: number | null): Promise<void> {
  if (amount === null) await getDb().runAsync('DELETE FROM app_kv WHERE key = ?', ['balance_anchor']);
  else
    await getDb().runAsync('INSERT OR REPLACE INTO app_kv (key, value) VALUES (?, ?)', ['balance_anchor', JSON.stringify({ amount, at: Date.now() })]);
  notify();
}

export type SpendingSummary = {
  /** Estimated balance left, or null if no balance has been entered. */
  available: number | null;
  balanceSetAt: number | null;
  totalSpent: number;
  recipeCount: number;
  /** Average cost of a successful recipe cleanup (scan, link, text), or null before the first one. */
  avgPerRecipe: number | null;
};

export async function getSpending(): Promise<SpendingSummary> {
  const db = getDb();
  const anchor = await getAnchor();
  const all = await db.getFirstAsync<{ total: number | null }>('SELECT SUM(cost) AS total FROM claude_usage');
  const recipes = await db.getFirstAsync<{ total: number | null; n: number }>(
    "SELECT SUM(cost) AS total, COUNT(*) AS n FROM claude_usage WHERE kind = 'recipe' AND ok = 1",
  );
  let available: number | null = null;
  if (anchor) {
    const since = await db.getFirstAsync<{ total: number | null }>('SELECT SUM(cost) AS total FROM claude_usage WHERE at > ?', [anchor.at]);
    available = anchor.amount - (since?.total ?? 0);
  }
  return {
    available,
    balanceSetAt: anchor?.at ?? null,
    totalSpent: all?.total ?? 0,
    recipeCount: recipes?.n ?? 0,
    avgPerRecipe: recipes && recipes.n > 0 ? (recipes.total ?? 0) / recipes.n : null,
  };
}

export function useSpending(): SpendingSummary | null {
  const v = useDbVersion();
  const [s, setS] = useState<SpendingSummary | null>(null);
  useEffect(() => {
    getSpending().then(setS);
  }, [v]);
  return s;
}
