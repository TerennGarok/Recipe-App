import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getRecipe, saveRecipe } from './db';
import { deleteRecipeMedia, mediaFile, writeBase64Media } from './media';
import { MAX_EMBED_BYTES, SHARE_FORMAT, SHARE_VERSION, parseShareFile, planImport, slugify, type ShareEntry, type ShareFile } from './sharefile';
import type { Media, Recipe } from './types';

async function toEntry(r: Recipe, warnings: string[]): Promise<ShareEntry> {
  const files: ShareEntry['files'] = {};
  const media: Media[] = [];
  for (const m of r.media) {
    const f = mediaFile(m);
    if (f?.exists && f.size <= MAX_EMBED_BYTES) {
      files[m.id] = { ext: f.extension.replace('.', '') || (m.kind === 'video' ? 'mp4' : 'jpg'), base64: await f.base64() };
      media.push({ ...m, localPath: null });
    } else if (m.remoteUrl) {
      media.push({ ...m, localPath: null });
    } else if (f?.exists) {
      warnings.push(`A video in "${r.title}" is too large to share in a file and was left out.`);
    }
  }
  return { recipe: { ...r, media, favorite: false }, files, sharedBy: null };
}

/** Write recipes to a .recipebox.json file and open the system share sheet. */
export async function shareRecipes(recipes: Recipe[]): Promise<string[]> {
  const warnings: string[] = [];
  const file: ShareFile = {
    format: SHARE_FORMAT,
    version: SHARE_VERSION,
    exportedAt: Date.now(),
    entries: [],
  };
  for (const r of recipes) file.entries.push(await toEntry(r, warnings));

  const name = recipes.length === 1 ? slugify(recipes[0].title) : `recipebox-${recipes.length}-recipes`;
  const out = new File(Paths.cache, `${name}.recipebox.json`);
  out.create({ overwrite: true });
  out.write(JSON.stringify(file));
  await Sharing.shareAsync(out.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: recipes.length === 1 ? `Share "${recipes[0].title}"` : 'Share recipes',
  });
  return warnings;
}

export type ImportSummary = { added: string[]; updated: string[]; skipped: string[] };

export async function importShareFile(uri: string): Promise<ImportSummary> {
  const file = parseShareFile(await new File(uri).text());
  const existing = new Map<string, Recipe>();
  for (const e of file.entries) {
    const r = await getRecipe(e.recipe.id);
    if (r) existing.set(r.id, r);
  }
  const summary: ImportSummary = { added: [], updated: [], skipped: [] };
  for (const action of planImport(file, existing)) {
    const { recipe, files } = action.entry;
    if (action.kind === 'skip') {
      summary.skipped.push(recipe.title);
      continue;
    }
    if (action.kind === 'update') deleteRecipeMedia(recipe.id);
    const media: Media[] = [];
    for (const m of recipe.media) {
      const embedded = files[m.id];
      if (embedded) {
        const written = await writeBase64Media(recipe.id, m.kind, embedded.ext, embedded.base64);
        media.push({ ...m, localPath: written.localPath });
      } else if (m.remoteUrl) {
        media.push({ ...m, localPath: null });
      }
    }
    await saveRecipe(
      {
        ...recipe,
        media,
        favorite: action.kind === 'update' ? action.existing.favorite : false,
      },
      { touch: false },
    );
    (action.kind === 'add' ? summary.added : summary.updated).push(recipe.title);
  }
  return summary;
}

export function describeImport(s: ImportSummary): string {
  const parts: string[] = [];
  if (s.added.length) parts.push(`Added ${s.added.length === 1 ? `"${s.added[0]}"` : `${s.added.length} recipes`}.`);
  if (s.updated.length) parts.push(`Updated ${s.updated.length === 1 ? `"${s.updated[0]}"` : `${s.updated.length} recipes`}.`);
  if (s.skipped.length) parts.push(`${s.skipped.length} already up to date.`);
  return parts.join(' ') || 'Nothing to import.';
}
