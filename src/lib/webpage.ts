/** Pure HTML helpers for recipe pages (no Expo imports, unit tested in Node). */

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', deg: '°', frac12: '½', frac14: '¼', frac34: '¾', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Readable text of a page: drops scripts/styles/nav chrome, keeps line structure. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|svg|iframe|template|head|nav|footer|form)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n• ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isRecipeType(t: Json | undefined): boolean {
  if (typeof t === 'string') return t.toLowerCase() === 'recipe' || t.toLowerCase().endsWith('/recipe');
  return Array.isArray(t) && t.some(isRecipeType);
}

function findRecipe(node: Json): { [k: string]: Json } | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n);
      if (r) return r;
    }
    return null;
  }
  if (isRecipeType(node['@type'])) return node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    if (key in node) {
      const r = findRecipe(node[key]);
      if (r) return r;
    }
  }
  return null;
}

/** schema.org Recipe object from JSON-LD, if the page has one. */
export function extractJsonLdRecipe(html: string): { [k: string]: Json } | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const r = findRecipe(JSON.parse(m[1].trim()) as Json);
      if (r) return r;
    } catch {
      // Some sites ship invalid JSON-LD; ignore that block.
    }
  }
  return null;
}

/** True when JSON-LD alone holds the full recipe, so we don't need to send the whole page. */
export function jsonLdIsComplete(r: { [k: string]: Json } | null): boolean {
  if (!r) return false;
  const ing = r.recipeIngredient ?? r.ingredients;
  const steps = r.recipeInstructions;
  return Array.isArray(ing) && ing.length > 0 && !!steps && (typeof steps === 'string' ? steps.length > 20 : Array.isArray(steps) && steps.length > 0);
}

function meta(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`,
    'i',
  );
  const m = html.match(re);
  return m ? decodeEntities(m[1] ?? m[2]) : null;
}

function urlsFrom(v: Json | undefined, keys: string[]): string[] {
  if (!v) return [];
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap((x) => urlsFrom(x, keys));
  if (typeof v === 'object') return keys.flatMap((k) => (typeof v[k] === 'string' ? [v[k] as string] : []));
  return [];
}

export function absolutize(url: string, base: string): string | null {
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

export type PageInfo = {
  url: string;
  title: string | null;
  siteName: string | null;
  jsonLd: { [k: string]: Json } | null;
  text: string;
  images: string[];
  videos: string[];
};

export function analyzePage(html: string, url: string): PageInfo {
  const jsonLd = extractJsonLdRecipe(html);
  const images = [
    ...urlsFrom(jsonLd?.image, ['url', 'contentUrl']),
    ...[meta(html, 'og:image'), meta(html, 'twitter:image')].filter((x): x is string => !!x),
  ];
  const videos = [
    ...urlsFrom(jsonLd?.video, ['contentUrl', 'embedUrl', 'url']),
    ...[meta(html, 'og:video:secure_url'), meta(html, 'og:video')].filter((x): x is string => !!x),
  ];
  const clean = (xs: string[]) => [...new Set(xs.map((x) => absolutize(x, url)).filter((x): x is string => !!x && /^https?:/.test(x)))];
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return {
    url,
    title: meta(html, 'og:title') ?? (titleTag ? decodeEntities(titleTag).trim() : null),
    siteName: meta(html, 'og:site_name') ?? (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, '');
      } catch {
        return null;
      }
    })(),
    jsonLd,
    text: htmlToText(html),
    images: clean(images).slice(0, 6),
    videos: clean(videos).slice(0, 3),
  };
}

/** Pull the first http(s) URL out of shared text like "Check this out https://…". */
export function findUrl(text: string): string | null {
  return text.match(/https?:\/\/[^\s<>"']+/i)?.[0].replace(/[).,;!?]+$/, '') ?? null;
}
