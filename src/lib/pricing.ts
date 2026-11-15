/**
 * Estimated cost of a Claude request from the usage the API reports (pure, unit tested).
 * List prices in USD per million tokens; update if Anthropic changes pricing.
 */

type Rates = { input: number; output: number; cacheWrite: number; cacheRead: number };

const PRICES: Record<string, Rates> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  'claude-sonnet-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
};
const DEFAULT_RATES = PRICES['claude-opus-5-5'];

/** $10 per 1,000 web searches. Web fetches are billed only as tokens. */
const WEB_SEARCH_USD = 0.01;

export type UsageLike = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
};

export function ratesFor(model: string): Rates {
  // Served model ids may carry a suffix (e.g. a dated snapshot); match on the family prefix.
  const key = Object.keys(PRICES)
    .sort((a, b) => b.length - a.length)
    .find((k) => model === k || model.startsWith(`${k}-`));
  return key ? PRICES[key] : DEFAULT_RATES;
}

export function costUsd(model: string, u: UsageLike): number {
  const r = ratesFor(model);
  const tokens =
    u.input_tokens * r.input +
    u.output_tokens * r.output +
    (u.cache_creation_input_tokens ?? 0) * r.cacheWrite +
    (u.cache_read_input_tokens ?? 0) * r.cacheRead;
  return tokens / 1_000_000 + (u.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD;
}

export function formatUsd(n: number): string {
  if (Math.abs(n) < 0.1 && n !== 0) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}
