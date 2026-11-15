import { describe, expect, it } from 'vitest';

import { costUsd, formatUsd, ratesFor } from '../src/lib/pricing';

describe('costUsd', () => {
  it('prices a typical recipe extraction on Opus 5.5', () => {
    // 8,000 input + 1,500 output tokens = $0.032 + $0.030
    expect(costUsd('claude-opus-5-5', { input_tokens: 8000, output_tokens: 1500 })).toBeCloseTo(0.062, 6);
  });

  it('includes cache tokens and web searches', () => {
    const c = costUsd('claude-opus-5-5', {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
      server_tool_use: { web_search_requests: 3 },
    });
    expect(c).toBeCloseTo(5 + 0.2 + 0.03, 6);
  });

  it('uses the served model, so fallbacks are priced correctly', () => {
    expect(ratesFor('claude-sonnet-5-5').input).toBe(2);
    expect(ratesFor('claude-opus-5').input).toBe(5);
    expect(ratesFor('claude-opus-5-5').input).toBe(4); // not confused with the opus-5 prefix
    expect(ratesFor('claude-unknown-9').input).toBe(4); // unknown → default rates
  });

  it('handles null usage fields', () => {
    expect(costUsd('claude-opus-5-5', { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: null, server_tool_use: null })).toBe(0);
  });
});

describe('formatUsd', () => {
  it('shows tenths of a cent for small amounts', () => {
    expect(formatUsd(0.0423)).toBe('$0.042');
    expect(formatUsd(18.4)).toBe('$18.40');
    expect(formatUsd(0)).toBe('$0.00');
  });
});
