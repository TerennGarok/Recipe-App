import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { fetch as expoFetch } from 'expo/fetch';
import { z } from 'zod';

import { imageForClaude } from './media';
import { getAnthropicKey } from './settings';
import { Meter } from './spending';
import type { RecipeDraft, RecipeSourceType } from './types';
import { jsonLdIsComplete, type PageInfo } from './webpage';

const MODEL = 'claude-opus-5-5';
/** On a safety decline the API retries on a suitable fallback model inside the same call. */
const FALLBACK = { betas: ['server-side-fallback-2026-07-01' as const], fallbacks: 'default' as const };

export class ClaudeError extends Error {}

async function client(): Promise<Anthropic> {
  const apiKey = await getAnthropicKey();
  if (!apiKey) throw new ClaudeError('Add your Anthropic API key in Settings to use Claude features.');
  return new Anthropic({
    apiKey,
    // expo/fetch is a WinterCG-compliant fetch for React Native.
    fetch: expoFetch as unknown as typeof globalThis.fetch,
    // The key belongs to the person using the app and lives in their device keychain.
    dangerouslyAllowBrowser: true,
    timeout: 5 * 60 * 1000,
  });
}

function friendlyError(e: unknown): Error {
  if (e instanceof ClaudeError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new ClaudeError('Your Anthropic API key was rejected. Check it in Settings.');
  if (e instanceof Anthropic.PermissionDeniedError) return new ClaudeError('Your Anthropic account does not have access to this feature or model.');
  if (e instanceof Anthropic.RateLimitError) return new ClaudeError('Claude is busy (rate limited). Try again in a minute.');
  if (e instanceof Anthropic.BadRequestError) return new ClaudeError(`Claude could not process this request: ${e.message}`);
  if (e instanceof Anthropic.APIConnectionError) return new ClaudeError('Could not reach Claude. Check your internet connection.');
  if (e instanceof Anthropic.APIError) return new ClaudeError(`Claude error (${e.status ?? 'network'}): ${e.message}`);
  return e instanceof Error ? e : new Error(String(e));
}

// ---------------------------------------------------------------------------------------------
// Recipe extraction
// ---------------------------------------------------------------------------------------------

const ExtractedRecipe = z.object({
  isRecipe: z.boolean().describe('False if the input does not actually contain a recipe.'),
  title: z.string(),
  description: z.string().nullable().describe('One or two sentences, from the source if it has one.'),
  servings: z.string().nullable(),
  prepTime: z.string().nullable().describe('Human-readable, e.g. "15 min".'),
  cookTime: z.string().nullable(),
  totalTime: z.string().nullable(),
  ingredients: z.array(
    z.object({
      section: z.string().nullable().describe('Group heading such as "For the sauce", or null.'),
      text: z.string().describe('Full cleaned ingredient line as displayed, e.g. "2 cups yellow onion, diced".'),
      item: z.string().describe('Just the thing to buy at a store, e.g. "yellow onion". Lowercase unless a brand.'),
      quantity: z.string().nullable().describe('Amount with unit, e.g. "2 cups", or null.'),
    }),
  ),
  steps: z.array(z.object({ section: z.string().nullable(), text: z.string() })),
  notes: z.string().nullable().describe("Tips, variations, storage, or personal notes written on the card."),
  tags: z.array(z.string()).describe('3-6 short lowercase tags: meal type, cuisine, main ingredient, dietary (only if clearly true).'),
  sourceName: z.string().nullable().describe('Website, cookbook, or person the recipe is attributed to.'),
});
type ExtractedRecipeData = z.infer<typeof ExtractedRecipe>;

const EXTRACT_SYSTEM = `You turn recipes from any source (photos of handwritten cards, cookbook pages, web pages, pasted text) into a clean, consistent recipe record for a personal family recipe app.

- Be faithful to the original. Never invent ingredients, quantities, temperatures, or steps. Fix obvious OCR, handwriting, spelling, and formatting errors.
- If a word or amount is genuinely illegible, keep your best reading followed by "[?]".
- Write ingredient lines in a consistent style ("1 cup flour", "2 Tbsp butter, softened"). Expand cryptic abbreviations a cook might misread ("T." to "Tbsp", "t." to "tsp", "c." to "cup").
- Split instructions into clear, numbered-style steps (without the numbers), one action group per step. Keep oven temperatures and times.
- Keep section groupings the source uses (e.g. "Crust", "Filling").
- Handwritten annotations on a printed or typed recipe (crossed-out amounts with new ones written in, margin notes like "use ¾ cup sugar", "+1 tsp cinnamon", "bake 10 min longer", added or removed ingredients) are the cook's own corrections: apply them directly to the ingredients and steps, so the recipe reads the way it is actually made. Then add one line per applied change to notes, e.g. "Handwritten change: sugar reduced from 1 cup to ¾ cup".
- Handwritten remarks that aren't changes to the recipe (e.g. "Dad's favorite", "made for Easter 2019", serving suggestions) go in notes rather than being discarded.
- For web pages, ignore ads, life stories, comments, and navigation; extract only the recipe.
- If there are several recipes, extract the main one and mention the others in notes.
- If there is no recipe, set isRecipe to false and fill the other fields minimally.`;

/**
 * Read a structured-output response. We parse it ourselves (instead of messages.parse) so that a
 * cut-off or declined response is reported by its stop reason, and its cost is still recorded.
 */
function readStructured<T>(res: Anthropic.Beta.BetaMessage, schema: z.ZodType<T>, tooLong: string): T {
  if (res.stop_reason === 'refusal') throw new ClaudeError('Claude declined to process this content.');
  if (res.stop_reason === 'max_tokens') throw new ClaudeError(tooLong);
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ClaudeError('Claude returned an unreadable result. Please try again.');
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ClaudeError('Claude returned an unreadable result. Please try again.');
  return parsed.data;
}

async function runExtraction(
  content: Anthropic.Beta.BetaContentBlockParam[],
  tools?: Anthropic.Beta.BetaToolUnion[],
): Promise<ExtractedRecipeData> {
  const c = await client();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content }];
  const meter = new Meter('recipe');
  let ok = false;
  try {
    // Server tools (web fetch) can pause a long turn; send it back to let it continue.
    for (let i = 0; i < 5; i++) {
      const res = await c.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        ...FALLBACK,
        system: EXTRACT_SYSTEM,
        output_config: { effort: 'medium', format: betaZodOutputFormat(ExtractedRecipe) },
        ...(tools ? { tools } : {}),
        messages,
      });
      meter.add(res.model, res.usage);
      if (res.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: res.content });
        continue;
      }
      const recipe = readStructured(res, ExtractedRecipe, 'This recipe was too long to process in one go.');
      if (!recipe.isRecipe) throw new ClaudeError("Claude couldn't find a recipe in that.");
      ok = true;
      return recipe;
    }
    throw new ClaudeError('Claude took too long. Please try again.');
  } catch (e) {
    throw friendlyError(e);
  } finally {
    await meter.save(ok).catch(() => {});
  }
}

function toDraft(x: ExtractedRecipeData, type: RecipeSourceType, url: string | null, fallbackSourceName: string | null): RecipeDraft {
  let n = 0;
  const id = () => `tmp-${n++}`;
  return {
    title: x.title.trim() || 'Untitled recipe',
    description: x.description,
    servings: x.servings,
    prepTime: x.prepTime,
    cookTime: x.cookTime,
    totalTime: x.totalTime,
    ingredients: x.ingredients.map((i) => ({ id: id(), section: i.section, text: i.text, item: i.item || i.text, quantity: i.quantity })),
    steps: x.steps.map((s) => ({ id: id(), section: s.section, text: s.text })),
    notes: x.notes,
    tags: [...new Set(x.tags.map((t) => t.toLowerCase().trim()).filter(Boolean))],
    source: { type, url, name: x.sourceName ?? fallbackSourceName },
  };
}

/** Photos of a paper recipe (one or more pages, in order). */
export async function recipeFromPhotos(uris: string[], type: 'camera' | 'photos'): Promise<RecipeDraft> {
  const images = await Promise.all(uris.map(imageForClaude));
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...images.map((img) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: img.mediaType, data: img.base64 },
    })),
    {
      type: 'text',
      text:
        images.length > 1
          ? `These ${images.length} photos are pages/sides of one recipe, in order. Extract the recipe, applying any handwritten changes.`
          : 'This photo shows a recipe. Extract it, applying any handwritten changes.',
    },
  ];
  return toDraft(await runExtraction(content), type, null, null);
}

/** Text the user pasted or shared (an email, a message, notes). */
export async function recipeFromText(text: string): Promise<RecipeDraft> {
  return toDraft(await runExtraction([{ type: 'text', text: `Extract the recipe from this text:\n\n${text}` }]), 'text', null, null);
}

/** A web page the app downloaded itself. */
export async function recipeFromPage(page: PageInfo): Promise<RecipeDraft> {
  // Structured recipe data, when complete, is the whole recipe without the page clutter.
  const body = jsonLdIsComplete(page.jsonLd)
    ? `Structured recipe data (schema.org JSON-LD) from the page:\n${JSON.stringify(page.jsonLd)}`
    : `Page text:\n${page.text}`;
  const draft = toDraft(
    await runExtraction([{ type: 'text', text: `Recipe web page: ${page.url}\nPage title: ${page.title ?? 'unknown'}\n\n${body}` }]),
    'web',
    page.url,
    page.siteName,
  );
  draft.candidateMedia = [
    ...page.images.slice(0, 1).map((url) => ({ kind: 'image' as const, url })),
    ...page.videos.slice(0, 1).map((url) => ({ kind: 'video' as const, url })),
  ];
  return draft;
}

const PdfRecipes = z.object({
  recipes: z.array(ExtractedRecipe).describe('Every complete recipe in the document, in the order they appear.'),
});

/** PDFs of up to ~30 MB / 100 pages; a 1M-context model handles far more, but the request size limit is 32 MB. */
export const MAX_PDF_BYTES = 30 * 1024 * 1024;

/**
 * A PDF can hold one recipe (a printout) or many (a cookbook chapter, a family collection).
 * Every recipe in it becomes its own draft.
 */
export async function recipesFromPdf(base64: string, fileName: string): Promise<RecipeDraft[]> {
  const c = await client();
  const meter = new Meter('recipe');
  let found = 0;
  try {
    const res = await c.beta.messages.create(
      {
        model: MODEL,
        // Room for many recipes; a non-streaming request is fine because we set our own timeout.
        max_tokens: 32000,
        ...FALLBACK,
        system: EXTRACT_SYSTEM,
        output_config: { effort: 'medium', format: betaZodOutputFormat(PdfRecipes) },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 }, title: fileName },
              {
                type: 'text',
                text: 'This PDF may contain one recipe or several. Extract every complete recipe, each as its own entry, applying any handwritten changes. Skip tables of contents, indexes, ads and partial fragments.',
              },
            ],
          },
        ],
      },
      { timeout: 15 * 60 * 1000 },
    );
    meter.add(res.model, res.usage);
    const recipes = readStructured(res, PdfRecipes, 'This PDF has too many recipes to read at once. Split it into smaller PDFs and try again.').recipes.filter(
      (r) => r.isRecipe,
    );
    if (!recipes.length) throw new ClaudeError("Claude couldn't find a recipe in this PDF.");
    found = recipes.length;
    const name = fileName.replace(/\.pdf$/i, '');
    return recipes.map((r) => toDraft(r, 'photos', null, name));
  } catch (e) {
    throw friendlyError(e);
  } finally {
    await meter.save(found > 0, Math.max(found, 1)).catch(() => {});
  }
}

/** For pages the phone can't download directly (some sites block apps), let Claude fetch it. */
export async function recipeFromUrlViaClaude(url: string): Promise<RecipeDraft> {
  const x = await runExtraction(
    [{ type: 'text', text: `Fetch this recipe page and extract the recipe: ${url}` }],
    [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 2 }],
  );
  let host: string | null = null;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {}
  return toDraft(x, 'web', url, host);
}

// ---------------------------------------------------------------------------------------------
// Online recipe search
// ---------------------------------------------------------------------------------------------

const SearchResults = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      site: z.string(),
      summary: z.string(),
      rating: z.string().nullable(),
      totalTime: z.string().nullable(),
      whyGood: z.string(),
    }),
  ),
});
export type SearchResult = z.infer<typeof SearchResults>['results'][number];

const PRESENT_TOOL: Anthropic.Beta.BetaTool = {
  name: 'present_recipes',
  description: 'Show the final list of recommended recipes to the user. Call exactly once, after searching.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['results'],
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'url', 'site', 'summary', 'rating', 'totalTime', 'whyGood'],
          properties: {
            title: { type: 'string' },
            url: { type: 'string', description: 'Direct link to the recipe page itself (not a search or listing page).' },
            site: { type: 'string', description: 'Site or author name.' },
            summary: { type: 'string', description: 'One sentence describing the dish and approach.' },
            rating: { type: ['string', 'null'], description: 'e.g. "4.8★ (2,300 ratings)" if shown, else null.' },
            totalTime: { type: ['string', 'null'] },
            whyGood: { type: 'string', description: 'Short reason this one is worth trying.' },
          },
        },
      },
    },
  },
};

const SEARCH_SYSTEM = `You help a home cook find great recipes online. Search the web, favor well-tested recipes from reputable sources (sites with many positive ratings, respected food publications, trusted cookbook authors), and avoid content farms and AI-generated recipe spam. Return up to 6 distinct options with varied approaches when that's useful. Only include URLs you actually found in search results. When done, call present_recipes once with the final list.`;

export async function searchRecipes(query: string): Promise<SearchResult[]> {
  const c = await client();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: `Find recipes for: ${query}` }];
  let nudged = false;
  const meter = new Meter('search');
  let ok = false;
  try {
    for (let i = 0; i < 8; i++) {
      const res = await c.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        ...FALLBACK,
        system: SEARCH_SYSTEM,
        output_config: { effort: 'medium' },
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }, PRESENT_TOOL],
        messages,
      });
      meter.add(res.model, res.usage);
      if (res.stop_reason === 'refusal') throw new ClaudeError('Claude declined this search.');
      const call = res.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use' && b.name === 'present_recipes');
      if (call) {
        const parsed = SearchResults.safeParse(call.input);
        if (!parsed.success) throw new ClaudeError('Claude returned results in an unexpected format. Please try again.');
        ok = true;
        return parsed.data.results.filter((r) => /^https?:\/\//.test(r.url));
      }
      messages.push({ role: 'assistant', content: res.content });
      if (res.stop_reason === 'pause_turn') continue;
      if (nudged) break;
      nudged = true;
      messages.push({ role: 'user', content: 'Please call present_recipes with your results now.' });
    }
    throw new ClaudeError('Claude did not return any results. Try a different search.');
  } catch (e) {
    throw friendlyError(e);
  } finally {
    await meter.save(ok).catch(() => {});
  }
}
