/**
 * Pure helpers for ingredient and step text. No Expo imports so these can be unit tested in Node.
 */

const UNITS = [
  'cups?', 'c\\.?', 'tablespoons?', 'tbsps?\\.?', 'tbs\\.?', 'T\\.?', 'teaspoons?', 'tsps?\\.?', 't\\.?',
  'ounces?', 'oz\\.?', 'fluid ounces?', 'fl\\.? ?oz\\.?', 'pounds?', 'lbs?\\.?', 'grams?', 'g\\.?', 'kilograms?', 'kg\\.?',
  'milliliters?', 'millilitres?', 'ml\\.?', 'liters?', 'litres?', 'l\\.?', 'pints?', 'pts?\\.?', 'quarts?', 'qts?\\.?',
  'gallons?', 'gal\\.?', 'pinch(?:es)?', 'dash(?:es)?', 'cloves?', 'cans?', 'packages?', 'pkgs?\\.?', 'sticks?',
  'slices?', 'bunch(?:es)?', 'heads?', 'sprigs?', 'stalks?', 'jars?', 'bottles?', 'boxes?', 'bags?', 'large', 'medium', 'small',
];

const NUMBER = String.raw`(?:\d+(?:[.,]\d+)?(?:\s+\d+/\d+)?|\d+/\d+|[½⅓⅔¼¾⅛⅜⅝⅞]|\d+\s*[½⅓⅔¼¾⅛⅜⅝⅞])`;
const QUANTITY_RE = new RegExp(
  String.raw`^\s*((?:${NUMBER})(?:\s*(?:-|–|to)\s*(?:${NUMBER}))?(?:\s*\([^)]*\))?(?:\s+(?:${UNITS.join('|')})(?=\s|$|\.))?)\s*(?:of\s+)?`,
  'i',
);

/** Split "2 cups yellow onion, diced" into { quantity: "2 cups", item: "yellow onion" }. */
export function parseIngredientLine(line: string): { quantity: string | null; item: string } {
  const text = line.trim().replace(/^[-*•]\s*/, '');
  const match = text.match(QUANTITY_RE);
  let quantity: string | null = null;
  let rest = text;
  if (match && match[1].trim().length > 0) {
    quantity = match[1].trim();
    rest = text.slice(match[0].length);
  }
  // The shopping item is the part before any prep notes ("diced", "to taste", parentheticals).
  let item = rest
    .split(/,|\(|;| - | – /)[0]
    .replace(/\b(to taste|optional|divided|for serving|for garnish)\b.*$/i, '')
    .trim();
  if (!item) item = rest.trim() || text;
  return { quantity, item };
}

/**
 * Parse an editor text block (one item per line, "## Heading" or "Heading:" lines start a section)
 * into section-tagged lines.
 */
export function parseSectionedLines(block: string): { section: string | null; text: string }[] {
  const out: { section: string | null; text: string }[] = [];
  let section: string | null = null;
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#+\s*(.+)$/) ?? line.match(/^([^:]{2,40}):$/);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    out.push({ section, text: line.replace(/^(\d+[.)]|[-*•])\s+/, '') });
  }
  return out;
}

/** Inverse of parseSectionedLines, for loading a recipe into the editor. */
export function toSectionedText(lines: { section: string | null; text: string }[]): string {
  const parts: string[] = [];
  let current: string | null = null;
  for (const l of lines) {
    if (l.section !== current) {
      if (l.section) parts.push(`${parts.length ? '\n' : ''}## ${l.section}`);
      current = l.section;
    }
    parts.push(l.text);
  }
  return parts.join('\n');
}

/** Group consecutive items by section for display. */
export function groupBySection<T extends { section: string | null }>(items: T[]): { section: string | null; items: T[] }[] {
  const groups: { section: string | null; items: T[] }[] = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last.section === it.section) last.items.push(it);
    else groups.push({ section: it.section, items: [it] });
  }
  return groups;
}
