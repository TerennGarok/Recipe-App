import { describe, expect, it } from 'vitest';

import { groupBySection, parseIngredientLine, parseSectionedLines, toSectionedText } from '../src/lib/ingredients';
import { analyzePage, findUrl, htmlToText, jsonLdIsComplete } from '../src/lib/webpage';

const PAGE = `<!doctype html><html><head>
<title>Best Chili &amp; Cornbread | Example Kitchen</title>
<meta property="og:site_name" content="Example Kitchen">
<meta property="og:image" content="/img/chili.jpg">
<script type="application/ld+json">{ not valid json </script>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":["Recipe"],"name":"Best Chili",
"image":[{"@type":"ImageObject","url":"https://cdn.example.com/chili-hero.jpg"}],
"recipeIngredient":["2 lb ground beef","1 yellow onion, diced"],
"recipeInstructions":[{"@type":"HowToStep","text":"Brown the beef."}],
"video":{"@type":"VideoObject","contentUrl":"https://cdn.example.com/chili.mp4","embedUrl":"https://www.youtube.com/embed/abc"}}]}
</script><style>.x{color:red}</style></head>
<body><nav>Home | Recipes</nav><h1>Best Chili</h1><ul><li>2 lb ground beef</li><li>1 onion</li></ul>
<p>Cook it&nbsp;low &amp; slow.</p><script>trackEverything()</script></body></html>`;

describe('analyzePage', () => {
  it('finds the JSON-LD recipe inside @graph and collects media', () => {
    const info = analyzePage(PAGE, 'https://example.com/recipes/chili');
    expect(info.jsonLd?.name).toBe('Best Chili');
    expect(jsonLdIsComplete(info.jsonLd)).toBe(true);
    expect(info.siteName).toBe('Example Kitchen');
    expect(info.images).toEqual(['https://cdn.example.com/chili-hero.jpg', 'https://example.com/img/chili.jpg']);
    expect(info.videos).toEqual(['https://cdn.example.com/chili.mp4', 'https://www.youtube.com/embed/abc']);
  });

  it('turns HTML into readable text without scripts or nav', () => {
    const text = htmlToText(PAGE);
    expect(text).toContain('• 2 lb ground beef');
    expect(text).toContain('Cook it low & slow.');
    expect(text).not.toContain('trackEverything');
    expect(text).not.toContain('Home | Recipes');
    expect(text).not.toContain('color:red');
  });

  it('reports incomplete JSON-LD', () => {
    expect(jsonLdIsComplete({ '@type': 'Recipe', name: 'x', recipeIngredient: [] })).toBe(false);
    expect(jsonLdIsComplete(null)).toBe(false);
  });
});

describe('findUrl', () => {
  it('extracts a URL from shared text', () => {
    expect(findUrl('Try this! https://example.com/a?b=1).')).toBe('https://example.com/a?b=1');
    expect(findUrl('no link here')).toBeNull();
  });
});

describe('ingredient parsing', () => {
  it.each([
    ['2 cups yellow onion, diced', '2 cups', 'yellow onion'],
    ['1 1/2 tsp. kosher salt', '1 1/2 tsp.', 'kosher salt'],
    ['½ lb ground beef', '½ lb', 'ground beef'],
    ['2-3 cloves garlic, minced', '2-3 cloves', 'garlic'],
    ['1 (14 oz) can diced tomatoes', '1 (14 oz) can', 'diced tomatoes'],
    ['Salt and pepper to taste', null, 'Salt and pepper'],
    ['3 eggs', '3', 'eggs'],
    ['1 cup of milk', '1 cup', 'milk'],
  ])('%s', (line, quantity, item) => {
    expect(parseIngredientLine(line)).toEqual({ quantity, item });
  });

  it('round-trips sectioned editor text', () => {
    const text = 'flour\nsugar\n\n## Frosting\nbutter\nFor the glaze:\nlemon';
    const lines = parseSectionedLines(text);
    expect(lines).toEqual([
      { section: null, text: 'flour' },
      { section: null, text: 'sugar' },
      { section: 'Frosting', text: 'butter' },
      { section: 'For the glaze', text: 'lemon' },
    ]);
    expect(parseSectionedLines(toSectionedText(lines))).toEqual(lines);
    expect(groupBySection(lines).map((g) => g.items.length)).toEqual([2, 1, 1]);
  });

  it('strips step numbering', () => {
    expect(parseSectionedLines('1. Preheat oven\n2) Mix')).toEqual([
      { section: null, text: 'Preheat oven' },
      { section: null, text: 'Mix' },
    ]);
  });
});
