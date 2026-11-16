/** Finds cooking times in step text ("bake 25–30 minutes", "simmer 1 hr 15 min"). Pure, unit tested. */

export type Duration = {
  /** Short label for the timer button, e.g. "25–30 min". */
  label: string;
  /** Seconds to count down (the low end of a range — check early, add time if needed). */
  seconds: number;
};

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
const NUM = String.raw`(?:\d+(?:\.\d+)?(?:\s+\d\/\d)?|\d\/\d|\d*\s*[½¼¾⅓⅔])`;
const RANGE = String.raw`(${NUM})(?:\s*(?:-|–|—|to)\s*(${NUM}))?`;
const UNIT = String.raw`(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b`;
const PIECE = new RegExp(String.raw`(?<![\w/])${RANGE}\s*-?\s*${UNIT}`, 'gi');

export function parseNumber(s: string): number {
  const t = s.trim();
  const frac = t.match(/[½¼¾⅓⅔]/);
  if (frac) return (parseFloat(t.replace(frac[0], '')) || 0) + FRACTIONS[frac[0]];
  const mixed = t.match(/^(\d+)\s+(\d)\/(\d)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const simple = t.match(/^(\d)\/(\d)$/);
  if (simple) return Number(simple[1]) / Number(simple[2]);
  return parseFloat(t);
}

const unitSeconds = (u: string) => (/^h/i.test(u) ? 3600 : /^m/i.test(u) ? 60 : 1);
const unitShort = (u: string) => (/^h/i.test(u) ? 'hr' : /^m/i.test(u) ? 'min' : 'sec');

function fmt(n: number): string {
  const whole = Math.floor(n);
  const rest = n - whole;
  const glyph = Object.entries(FRACTIONS).find(([, v]) => Math.abs(v - rest) < 0.01)?.[0];
  if (glyph) return whole ? `${whole}${glyph}` : glyph;
  return String(Math.round(n * 100) / 100);
}

type Piece = { start: number; end: number; low: number; high: number | null; unit: string };

export function findDurations(text: string): Duration[] {
  const pieces: Piece[] = [];
  for (const m of text.matchAll(PIECE)) {
    const low = parseNumber(m[1]);
    const high = m[2] ? parseNumber(m[2]) : null;
    if (!Number.isFinite(low) || low <= 0) continue;
    pieces.push({ start: m.index!, end: m.index! + m[0].length, low, high, unit: m[3] });
  }

  const out: Duration[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    const next = pieces[i + 1];
    // "1 hour 15 minutes" / "1 hr and 15 min" → one timer
    if (
      next &&
      unitSeconds(p.unit) === 3600 &&
      unitSeconds(next.unit) === 60 &&
      p.high === null &&
      next.high === null &&
      /^[\s,]*(and\s*)?$/i.test(text.slice(p.end, next.start))
    ) {
      out.push({ label: `${fmt(p.low)} hr ${fmt(next.low)} min`, seconds: Math.round(p.low * 3600 + next.low * 60) });
      i++;
      continue;
    }
    const range = p.high !== null && p.high > p.low ? `${fmt(p.low)}–${fmt(p.high)}` : fmt(p.low);
    out.push({ label: `${range} ${unitShort(p.unit)}`, seconds: Math.round(p.low * unitSeconds(p.unit)) });
  }
  // A step that says "10 minutes" twice only needs one button.
  return out.filter((d, i) => out.findIndex((x) => x.label === d.label) === i);
}

/** "1:05:09", "12:03", "0:45" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
