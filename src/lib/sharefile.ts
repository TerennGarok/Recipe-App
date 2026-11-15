/**
 * The .recipebox.json sharing format (pure, unit tested). A file holds one or more recipes with
 * their photos/videos embedded as base64, so it can be sent over Messages, AirDrop, email, etc.
 */
import { z } from 'zod';

import type { Recipe } from './types';

export const SHARE_FORMAT = 'recipebox';
export const SHARE_VERSION = 1;
/** Videos bigger than this are shared as links (if they have one) instead of being embedded. */
export const MAX_EMBED_BYTES = 25 * 1024 * 1024;

const nullableString = z.string().nullable().optional().transform((v) => v ?? null);

const MediaSchema = z.object({
  id: z.string(),
  kind: z.enum(['image', 'video']),
  localPath: nullableString,
  remoteUrl: nullableString,
  caption: nullableString,
});

const RecipeSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  description: nullableString,
  servings: nullableString,
  prepTime: nullableString,
  cookTime: nullableString,
  totalTime: nullableString,
  ingredients: z.array(z.object({ id: z.string(), section: nullableString, text: z.string(), item: z.string(), quantity: nullableString })),
  steps: z.array(z.object({ id: z.string(), section: nullableString, text: z.string() })),
  notes: nullableString,
  tags: z.array(z.string()).default([]),
  source: z.object({
    type: z.enum(['camera', 'photos', 'web', 'text', 'manual', 'shared']),
    url: nullableString,
    name: nullableString,
  }),
  media: z.array(MediaSchema).default([]),
  favorite: z.boolean().default(false),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const EntrySchema = z.object({
  recipe: RecipeSchema,
  /** mediaId -> embedded file */
  files: z.record(z.string(), z.object({ ext: z.string().regex(/^[a-z0-9]{1,5}$/i), base64: z.string() })).default({}),
  sharedBy: nullableString,
});

const ShareFileSchema = z.object({
  format: z.literal(SHARE_FORMAT),
  version: z.number().int().max(SHARE_VERSION),
  exportedAt: z.number(),
  entries: z.array(EntrySchema),
});

export type ShareEntry = z.infer<typeof EntrySchema>;
export type ShareFile = z.infer<typeof ShareFileSchema>;

export function parseShareFile(json: string): ShareFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("That file isn't a RecipeBox recipe file.");
  }
  const v = (raw as { version?: unknown } | null)?.version;
  if ((raw as { format?: unknown } | null)?.format === SHARE_FORMAT && typeof v === 'number' && v > SHARE_VERSION) {
    throw new Error('This file was made by a newer version of RecipeBox. Update the app to open it.');
  }
  const parsed = ShareFileSchema.safeParse(raw);
  if (!parsed.success) throw new Error("That file isn't a valid RecipeBox recipe file.");
  return parsed.data;
}

export type ImportAction =
  | { kind: 'add'; entry: ShareEntry }
  | { kind: 'update'; entry: ShareEntry; existing: Recipe }
  | { kind: 'skip'; entry: ShareEntry; reason: 'same-or-older' };

/**
 * Recipes keep their id when shared, so a family member re-sending an updated recipe replaces
 * the older copy instead of duplicating it. Your own copy wins if it was edited more recently.
 */
export function planImport(file: ShareFile, existing: Map<string, Recipe>): ImportAction[] {
  return file.entries.map((entry) => {
    const mine = existing.get(entry.recipe.id);
    if (!mine) return { kind: 'add', entry };
    if (entry.recipe.updatedAt > mine.updatedAt) return { kind: 'update', entry, existing: mine };
    return { kind: 'skip', entry, reason: 'same-or-older' };
  });
}

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '-')
      .slice(0, 50) || 'recipe'
  );
}
