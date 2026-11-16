import { Directory, File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import type { ResolvedSharePayload } from 'expo-sharing';
import { Alert } from 'react-native';

import { addPdfs } from './batch';
import { newId } from './id';
import { describeImport, importShareFile } from './share';
import { findUrl } from './webpage';

/** "file:/data/…" → "file:///data/…" (some Android providers hand out the short form). */
const normalizeFileUri = (uri: string) => uri.replace(/^file:\/(?!\/)/, 'file:///');

function extOf(p: ResolvedSharePayload, fallback: string): string {
  const fromName = (p.originalName ?? p.contentUri ?? '').split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i)?.[1];
  if (fromName) return fromName.toLowerCase();
  const fromMime = p.contentMimeType?.split('/')[1]?.replace('jpeg', 'jpg');
  return fromMime && /^[a-z0-9]{2,5}$/.test(fromMime) ? fromMime : fallback;
}

/**
 * Copy a shared file somewhere we own. expo-sharing deletes its copies when the share is
 * cleared, so anything we want to keep must be copied first.
 */
async function keepCopy(p: ResolvedSharePayload, fallbackExt: string): Promise<string> {
  const dir = new Directory(Paths.cache, 'incoming');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, `${newId()}.${extOf(p, fallbackExt)}`);
  await new File(normalizeFileUri(p.contentUri!)).copy(dest);
  return dest.uri;
}

const isPdf = (p: ResolvedSharePayload) => !!p.contentUri && (p.contentMimeType === 'application/pdf' || /\.pdf$/i.test(p.originalName ?? p.contentUri));
const isRecipeFile = (p: ResolvedSharePayload) =>
  !!p.contentUri && (p.originalName?.endsWith('.json') || p.contentMimeType === 'application/json' || p.contentUri.endsWith('.json'));
const isImage = (p: ResolvedSharePayload) => !!p.contentUri && (p.contentType === 'image' || /^image\//.test(p.contentMimeType ?? ''));

/**
 * Route content shared into the app (links, text, photos, PDFs, recipe files) to the right place.
 * Call this BEFORE clearing the shared payloads — it copies the files it needs.
 */
export async function handleSharedPayloads(payloads: ResolvedSharePayload[]): Promise<void> {
  try {
    const recipeFile = payloads.find(isRecipeFile);
    if (recipeFile) {
      const s = await importShareFile(await keepCopy(recipeFile, 'json'));
      Alert.alert('Recipes imported', describeImport(s));
      return;
    }
    const pdfs = payloads.filter(isPdf);
    if (pdfs.length) {
      const copies = await Promise.all(pdfs.map(async (p) => ({ uri: await keepCopy(p, 'pdf'), name: p.originalName ?? 'Shared PDF' })));
      await addPdfs(copies);
      router.push('/batch');
      return;
    }
    const images = payloads.filter(isImage);
    if (images.length) {
      const uris = await Promise.all(images.map((p) => keepCopy(p, 'jpg')));
      router.push({ pathname: '/add', params: { images: JSON.stringify(uris) } });
      return;
    }
  } catch (e) {
    Alert.alert('Could not open the shared item', (e as Error).message);
    return;
  }
  const text = payloads
    .map((p) => (p.contentType === 'website' ? p.contentUri ?? p.value : p.value))
    .join('\n')
    .trim();
  const url = findUrl(text);
  // Browsers share "Page title https://…"; treat short text containing a link as a link.
  if (url && text.length < url.length + 300) router.push({ pathname: '/add', params: { url } });
  else if (text) router.push({ pathname: '/add', params: { text } });
}
