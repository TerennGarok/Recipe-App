/**
 * Batch import: queue many photos and links, then let Claude process them two at a time.
 * The queue is saved, so it survives leaving the app; processing runs while the app is open
 * and picks up where it left off (after you tap Resume) if the app was closed.
 */
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Directory, File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { canCombine, combineWithPrevious, nextToRun, parseLinks, resetInterrupted, splitPages, summarize, type BatchItem } from './batchqueue';
import { MAX_PDF_BYTES, recipeFromPhotos, recipesFromPdf } from './claude';
import { getDb } from './db';
import { newId } from './id';
import { createRecipe, draftFromUrl, type LocalAsset } from './recipes';

export type { BatchItem } from './batchqueue';
export { canCombine } from './batchqueue';

/** Two at a time is quick without tripping API rate limits on a new Anthropic account. */
const CONCURRENCY = 2;

type State = { items: BatchItem[]; running: boolean; keepPhotos: boolean };
let state: State = { items: [], running: false, keepPhotos: true };
let version = 0;
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  version++;
  listeners.forEach((l) => l());
  getDb()
    .runAsync('INSERT OR REPLACE INTO app_kv (key, value) VALUES (?, ?)', ['batch', JSON.stringify({ items: state.items, keepPhotos: state.keepPhotos })])
    .catch(() => {});
}

export function useBatch(): State & { summary: ReturnType<typeof summarize> } {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return { ...state, summary: summarize(state.items) };
}

function batchDir(): Directory {
  const d = new Directory(Paths.document, 'batch');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}
export const batchPhotoUri = (name: string) => new File(Paths.document, 'batch', name).uri;
function deletePhotos(names: string[]) {
  for (const n of names) {
    const f = new File(Paths.document, 'batch', n);
    if (f.exists) f.delete();
  }
}

const update = (id: string, patch: Partial<BatchItem>) => set({ items: state.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });

// ---------- editing the queue ----------

/** Each photo becomes its own recipe; combine pages afterwards if a recipe spans several photos. */
export async function addPhotos(assets: LocalAsset[]): Promise<void> {
  const added: BatchItem[] = [];
  for (const a of assets.filter((x) => x.kind === 'image')) {
    const name = `${newId()}.jpg`;
    // Picker/camera files live in a cache the system may clear, so keep our own copy.
    await new File(a.uri).copy(new File(batchDir(), name));
    added.push({ id: newId(), kind: 'photos', pages: [name], url: null, status: 'waiting', error: null, recipeId: null, title: null });
  }
  set({ items: [...state.items, ...added] });
}

/**
 * Queue PDFs (each may hold one recipe or several). Returns the names of files that were too
 * large to send to Claude and were skipped.
 */
export async function addPdfs(files: { uri: string; name: string }[]): Promise<string[]> {
  const added: BatchItem[] = [];
  const tooBig: string[] = [];
  for (const f of files) {
    const src = new File(f.uri);
    if (src.size > MAX_PDF_BYTES) {
      tooBig.push(f.name);
      continue;
    }
    const name = `${newId()}.pdf`;
    await src.copy(new File(batchDir(), name));
    added.push({ id: newId(), kind: 'pdf', pages: [name], url: null, fileName: f.name, status: 'waiting', error: null, recipeId: null, title: null });
  }
  set({ items: [...state.items, ...added] });
  return tooBig;
}

/** Returns how many new links were queued. */
export function addLinks(text: string): number {
  const known = new Set(state.items.map((i) => i.url));
  const links = parseLinks(text).filter((u) => !known.has(u));
  set({
    items: [
      ...state.items,
      ...links.map((url): BatchItem => ({ id: newId(), kind: 'link', pages: [], url, status: 'waiting', error: null, recipeId: null, title: null })),
    ],
  });
  return links.length;
}

export function combine(id: string) {
  if (canCombine(state.items, id)) set({ items: combineWithPrevious(state.items, id) });
}

export function split(id: string) {
  set({ items: splitPages(state.items, id, newId) });
}

export function removeItem(id: string) {
  const item = state.items.find((i) => i.id === id);
  if (!item || item.status === 'working') return;
  deletePhotos(item.pages);
  set({ items: state.items.filter((i) => i.id !== id) });
}

export function retry(id: string) {
  update(id, { status: 'waiting', error: null });
  if (state.running) pump();
}

export function clearFinished() {
  set({ items: state.items.filter((i) => i.status !== 'done') });
}

export function setKeepPhotos(keepPhotos: boolean) {
  set({ keepPhotos });
}

// ---------- processing ----------

async function processItem(item: BatchItem) {
  update(item.id, { status: 'working', error: null });
  try {
    let recipeId: string;
    let title: string;
    if (item.kind === 'pdf') {
      const base64 = await new File(Paths.document, 'batch', item.pages[0]).base64();
      const drafts = await recipesFromPdf(base64, item.fileName ?? 'PDF');
      const results: { id: string; title: string }[] = [];
      for (const d of drafts) {
        const r = await createRecipe(d);
        results.push({ id: r.id, title: r.title });
      }
      deletePhotos(item.pages);
      update(item.id, {
        status: 'done',
        results,
        recipeId: results.length === 1 ? results[0].id : null,
        title: results.length === 1 ? results[0].title : `${results.length} recipes from ${item.fileName ?? 'PDF'}`,
      });
      return;
    }
    if (item.kind === 'link' && item.url) {
      const r = await createRecipe(await draftFromUrl(item.url));
      recipeId = r.id;
      title = r.title;
    } else {
      const uris = item.pages.map(batchPhotoUri);
      const draft = await recipeFromPhotos(uris, 'photos');
      const media: LocalAsset[] = state.keepPhotos
        ? uris.map((uri, n) => ({ uri, kind: 'image', mimeType: 'image/jpeg', caption: uris.length > 1 ? `Original, page ${n + 1}` : 'Original recipe' }))
        : [];
      const r = await createRecipe(draft, media);
      recipeId = r.id;
      title = r.title;
      deletePhotos(item.pages); // the recipe has its own copies now
    }
    update(item.id, { status: 'done', recipeId, title, results: [{ id: recipeId, title }] });
  } catch (e) {
    update(item.id, { status: 'failed', error: (e as Error).message });
  }
}

function pump() {
  if (!state.running) return;
  const next = nextToRun(state.items, CONCURRENCY);
  const s = summarize(state.items);
  if (!next.length && s.working === 0) {
    set({ running: false });
    deactivateKeepAwake('batch');
    return;
  }
  for (const item of next) processItem(item).then(pump);
}

export function startBatch() {
  if (state.running || !summarize(state.items).waiting) return;
  set({ running: true });
  // Keep the screen on while working; processing pauses if the app is put away.
  activateKeepAwakeAsync('batch').catch(() => {});
  pump();
}

/** Stops starting new items; ones already in progress finish. */
export function pauseBatch() {
  set({ running: false });
  deactivateKeepAwake('batch');
}

let loaded = false;
export async function initBatch() {
  if (loaded) return;
  loaded = true;
  try {
    const row = await getDb().getFirstAsync<{ value: string }>('SELECT value FROM app_kv WHERE key = ?', ['batch']);
    if (row) {
      const saved = JSON.parse(row.value) as { items: BatchItem[]; keepPhotos?: boolean };
      set({ items: resetInterrupted(saved.items ?? []), keepPhotos: saved.keepPhotos ?? true, running: false });
    }
  } catch {}
}
