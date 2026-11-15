/**
 * Exercises src/lib/claude.ts against a mocked Messages API: checks the request we send
 * (model, fallback beta, structured-output schema, tools) and how responses are handled.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { url: string; headers: Record<string, string>; body: any }[] = [];
let replies: object[] = [];

vi.mock('expo/fetch', () => ({
  fetch: async (url: string, init: { headers: any; body: string }) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    calls.push({ url: String(url), headers, body: JSON.parse(init.body) });
    const reply = replies.shift();
    if (!reply) throw new Error('unexpected request');
    return new Response(JSON.stringify(reply), { status: 200, headers: { 'content-type': 'application/json' } });
  },
}));
vi.mock('../src/lib/settings', () => ({ getAnthropicKey: async () => 'sk-ant-test' }));
vi.mock('../src/lib/media', () => ({ imageForClaude: async () => ({ base64: 'AAAA', mediaType: 'image/jpeg' }) }));

const { recipeFromText, recipeFromPage, searchRecipes, ClaudeError } = await import('../src/lib/claude');

const message = (content: object[], stop_reason = 'end_turn') => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content,
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 },
});

const recipeJson = {
  isRecipe: true,
  title: 'Pancakes',
  description: null,
  servings: '4',
  prepTime: '5 min',
  cookTime: '10 min',
  totalTime: null,
  ingredients: [{ section: null, text: '1 cup flour', item: 'flour', quantity: '1 cup' }],
  steps: [{ section: null, text: 'Mix and fry.' }],
  notes: null,
  tags: ['Breakfast', 'breakfast'],
  sourceName: null,
};

beforeEach(() => {
  calls.length = 0;
  replies = [];
});

describe('recipe extraction', () => {
  it('sends a structured-output request with fallbacks and parses the result', async () => {
    replies = [message([{ type: 'text', text: JSON.stringify(recipeJson) }])];
    const draft = await recipeFromText('pancakes: flour, eggs...');
    expect(draft.title).toBe('Pancakes');
    expect(draft.tags).toEqual(['breakfast']);
    expect(draft.ingredients[0]).toMatchObject({ item: 'flour', quantity: '1 cup' });

    const { url, headers, body } = calls[0];
    expect(url).toContain('/v1/messages');
    expect(headers['authorization']).toBe('Bearer sk-ant-test');
    expect(headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.fallbacks).toBe('default');
    expect(body.output_config.effort).toBe('medium');
    expect(body.output_config.format.type).toBe('json_schema');
    const schema = body.output_config.format.schema;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(expect.arrayContaining(['title', 'ingredients', 'steps', 'isRecipe']));
    expect(body.thinking).toBeUndefined();
  });

  it('reports when there is no recipe', async () => {
    replies = [message([{ type: 'text', text: JSON.stringify({ ...recipeJson, isRecipe: false }) }])];
    await expect(recipeFromText('hello')).rejects.toThrow(/couldn't find a recipe/);
  });

  it('surfaces refusals as a friendly error', async () => {
    replies = [message([], 'refusal')];
    await expect(recipeFromText('x')).rejects.toBeInstanceOf(ClaudeError);
  });

  it('sends complete JSON-LD instead of the full page and attaches page media', async () => {
    replies = [message([{ type: 'text', text: JSON.stringify(recipeJson) }])];
    const draft = await recipeFromPage({
      url: 'https://example.com/p',
      title: 'Pancakes',
      siteName: 'Example',
      jsonLd: { '@type': 'Recipe', recipeIngredient: ['1 cup flour'], recipeInstructions: [{ text: 'Mix and fry.' }] },
      text: 'VERY LONG PAGE TEXT',
      images: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
      videos: ['https://youtube.com/watch?v=1'],
    });
    const prompt = calls[0].body.messages[0].content[0].text as string;
    expect(prompt).toContain('JSON-LD');
    expect(prompt).not.toContain('VERY LONG PAGE TEXT');
    expect(draft.source).toEqual({ type: 'web', url: 'https://example.com/p', name: 'Example' });
    expect(draft.candidateMedia).toEqual([
      { kind: 'image', url: 'https://example.com/a.jpg' },
      { kind: 'video', url: 'https://youtube.com/watch?v=1' },
    ]);
  });
});

describe('online search', () => {
  it('continues paused turns and returns the present_recipes results', async () => {
    const results = [
      { title: 'Chili', url: 'https://ex.com/chili', site: 'Ex', summary: 's', rating: null, totalTime: null, whyGood: 'w' },
      { title: 'Bad', url: 'not-a-url', site: 'X', summary: 's', rating: null, totalTime: null, whyGood: 'w' },
    ];
    replies = [
      message([{ type: 'server_tool_use', id: 'srv_1', name: 'web_search', input: { query: 'chili' } }], 'pause_turn'),
      message([{ type: 'tool_use', id: 'tu_1', name: 'present_recipes', input: { results } }], 'tool_use'),
    ];
    const found = await searchRecipes('chili');
    expect(found.map((r) => r.title)).toEqual(['Chili']);
    expect(calls).toHaveLength(2);
    const tools = calls[0].body.tools;
    expect(tools[0]).toMatchObject({ type: 'web_search_20260209', name: 'web_search' });
    expect(tools[1]).toMatchObject({ name: 'present_recipes', strict: true });
    expect(calls[0].body.tool_choice).toBeUndefined();
    // the paused assistant turn is sent back unchanged
    expect(calls[1].body.messages[1]).toMatchObject({ role: 'assistant' });
  });

  it('nudges once if Claude answers without calling the tool', async () => {
    replies = [
      message([{ type: 'text', text: 'Here are some ideas…' }]),
      message([{ type: 'tool_use', id: 'tu_1', name: 'present_recipes', input: { results: [] } }], 'tool_use'),
    ];
    expect(await searchRecipes('soup')).toEqual([]);
    expect(calls[1].body.messages.at(-1)).toMatchObject({ role: 'user' });
  });
});
