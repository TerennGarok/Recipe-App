import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { newId } from './id';
import type { Media, MediaKind } from './types';

const ROOT = 'media';

function recipeDir(recipeId: string): Directory {
  const dir = new Directory(Paths.document, ROOT, recipeId);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** URI that <Image>/<VideoView> can display, preferring the on-device copy. */
export function mediaUri(m: Media): string | null {
  if (m.localPath) return new File(Paths.document, ROOT, m.localPath).uri;
  return m.remoteUrl;
}

export function mediaFile(m: Media): File | null {
  return m.localPath ? new File(Paths.document, ROOT, m.localPath) : null;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

export function extensionFor(kind: MediaKind, mime?: string | null, nameOrUrl?: string | null): string {
  if (mime && EXT_BY_MIME[mime.toLowerCase()]) return EXT_BY_MIME[mime.toLowerCase()];
  const m = nameOrUrl?.split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i);
  if (m) return m[1].toLowerCase();
  return kind === 'video' ? 'mp4' : 'jpg';
}

export function mimeFor(path: string, kind: MediaKind): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const found = Object.entries(EXT_BY_MIME).find(([, e]) => e === ext);
  return found ? found[0] : kind === 'video' ? 'video/mp4' : 'image/jpeg';
}

/** Copy a file picked from the camera/library into the recipe's media folder. */
export async function importLocalMedia(
  recipeId: string,
  uri: string,
  kind: MediaKind,
  mime?: string | null,
  fileName?: string | null,
): Promise<Media> {
  const id = newId();
  const name = `${id}.${extensionFor(kind, mime, fileName ?? uri)}`;
  const dest = new File(recipeDir(recipeId), name);
  await new File(uri).copy(dest);
  return { id, kind, localPath: `${recipeId}/${name}`, remoteUrl: null, caption: null };
}

/**
 * Download web media into the recipe folder so it works offline and can be shared.
 * Falls back to a link-only entry (e.g. YouTube pages, or downloads that fail).
 */
export async function importRemoteMedia(recipeId: string, url: string, kind: MediaKind): Promise<Media> {
  const id = newId();
  if (kind === 'video' && !isDirectVideoFile(url)) {
    return { id, kind, localPath: null, remoteUrl: url, caption: null };
  }
  try {
    const name = `${id}.${extensionFor(kind, null, url)}`;
    await File.downloadFileAsync(url, new File(recipeDir(recipeId), name));
    return { id, kind, localPath: `${recipeId}/${name}`, remoteUrl: url, caption: null };
  } catch {
    return { id, kind, localPath: null, remoteUrl: url, caption: null };
  }
}

export async function writeBase64Media(recipeId: string, kind: MediaKind, ext: string, base64: string): Promise<Media> {
  const id = newId();
  const name = `${id}.${ext}`;
  const f = new File(recipeDir(recipeId), name);
  f.create({ overwrite: true });
  f.write(base64, { encoding: 'base64' });
  return { id, kind, localPath: `${recipeId}/${name}`, remoteUrl: null, caption: null };
}

export function deleteMediaFile(m: Media): void {
  const f = mediaFile(m);
  if (f?.exists) f.delete();
}

export function deleteRecipeMedia(recipeId: string): void {
  const dir = new Directory(Paths.document, ROOT, recipeId);
  if (dir.exists) dir.delete();
}

export function isDirectVideoFile(url: string): boolean {
  return /\.(mp4|m4v|mov|webm|m3u8)(\?|#|$)/i.test(url);
}

/**
 * Shrink a photo before sending it to Claude: big phone photos are slow to upload and the API
 * downsizes anything over ~1.5k px anyway. Returns JPEG base64.
 */
export async function imageForClaude(uri: string): Promise<{ base64: string; mediaType: 'image/jpeg' }> {
  const ref = await ImageManipulator.manipulate(uri, { maxWidth: 2000, maxHeight: 2000 }).renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
  if (!out.base64) throw new Error('Could not read the photo.');
  return { base64: out.base64, mediaType: 'image/jpeg' };
}
