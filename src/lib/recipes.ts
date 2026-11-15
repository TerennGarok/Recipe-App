import { fetch } from 'expo/fetch';

import { recipeFromPage, recipeFromUrlViaClaude } from './claude';
import { deleteRecipeRow, getDb, getRecipe, saveRecipe } from './db';
import { newId } from './id';
import { deleteMediaFile, deleteRecipeMedia, importLocalMedia, importRemoteMedia } from './media';
import type { Media, MediaKind, Recipe, RecipeDraft } from './types';
import { analyzePage } from './webpage';

const BROWSER_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** Import a recipe web page. Tries downloading on the phone first, then lets Claude fetch it. */
export async function draftFromUrl(url: string): Promise<RecipeDraft> {
  let html: string | null = null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' } });
    if (res.ok) html = await res.text();
  } catch {
    // Network or site errors fall through to Claude's fetcher.
  }
  if (html && html.length > 500) return recipeFromPage(analyzePage(html, url));
  return recipeFromUrlViaClaude(url);
}

export type LocalAsset = { uri: string; kind: MediaKind; mimeType?: string | null; fileName?: string | null; caption?: string | null };

/** Save a draft as a new recipe, copying local media and downloading web media. */
export async function createRecipe(draft: RecipeDraft, localMedia: LocalAsset[] = []): Promise<Recipe> {
  const id = newId();
  const media: Media[] = [];
  for (const a of localMedia) {
    const m = await importLocalMedia(id, a.uri, a.kind, a.mimeType, a.fileName);
    media.push({ ...m, caption: a.caption ?? null });
  }
  for (const c of draft.candidateMedia ?? []) media.push(await importRemoteMedia(id, c.url, c.kind));
  const { candidateMedia: _ignored, ...rest } = draft;
  const now = Date.now();
  return saveRecipe({
    ...rest,
    id,
    ingredients: rest.ingredients.map((i) => ({ ...i, id: newId() })),
    steps: rest.steps.map((s) => ({ ...s, id: newId() })),
    media,
    favorite: false,
    createdAt: now,
    updatedAt: now,
  });
}

export async function addMedia(recipeId: string, items: (LocalAsset | { url: string; kind: MediaKind })[]): Promise<void> {
  const r = await getRecipe(recipeId);
  if (!r) return;
  const added: Media[] = [];
  for (const it of items) {
    added.push('url' in it ? await importRemoteMedia(recipeId, it.url, it.kind) : await importLocalMedia(recipeId, it.uri, it.kind, it.mimeType, it.fileName));
  }
  await saveRecipe({ ...r, media: [...r.media, ...added] });
}

export async function removeMedia(recipeId: string, mediaId: string): Promise<void> {
  const r = await getRecipe(recipeId);
  if (!r) return;
  const m = r.media.find((x) => x.id === mediaId);
  if (m) deleteMediaFile(m);
  await saveRecipe({ ...r, media: r.media.filter((x) => x.id !== mediaId) });
}

/** Swap a recipe photo for an edited (cropped/rotated) version of it. */
export async function replaceMediaImage(recipeId: string, mediaId: string, newUri: string): Promise<void> {
  const r = await getRecipe(recipeId);
  const old = r?.media.find((x) => x.id === mediaId);
  if (!r || !old) return;
  // A new file name, so cached thumbnails of the old version aren't shown.
  const fresh = await importLocalMedia(recipeId, newUri, 'image', 'image/jpeg');
  deleteMediaFile(old);
  await saveRecipe({ ...r, media: r.media.map((x) => (x.id === mediaId ? { ...x, localPath: fresh.localPath } : x)) });
}

export async function makeCover(recipeId: string, mediaId: string): Promise<void> {
  const r = await getRecipe(recipeId);
  if (!r) return;
  const m = r.media.find((x) => x.id === mediaId);
  if (!m) return;
  await saveRecipe({ ...r, media: [m, ...r.media.filter((x) => x.id !== mediaId)] });
}

export async function deleteRecipe(id: string): Promise<void> {
  deleteRecipeMedia(id);
  // Keep planned meals as plain text rather than linking to a recipe that's gone.
  await getDb().runAsync('UPDATE meal_plan SET recipe_id = NULL WHERE recipe_id = ?', [id]);
  await deleteRecipeRow(id);
}

export async function toggleFavorite(r: Recipe): Promise<void> {
  await saveRecipe({ ...r, favorite: !r.favorite }, { touch: false });
}

export function coverImage(r: Recipe): Media | undefined {
  return r.media.find((m) => m.kind === 'image');
}

export function guessMediaKind(url: string): MediaKind {
  return /\.(mp4|m4v|mov|webm|m3u8)(\?|#|$)/i.test(url) || /youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|instagram\.com\/reel/i.test(url)
    ? 'video'
    : 'image';
}
