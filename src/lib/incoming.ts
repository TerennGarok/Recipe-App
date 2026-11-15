import { router } from 'expo-router';
import type { ResolvedSharePayload } from 'expo-sharing';
import { Alert } from 'react-native';

import { describeImport, importShareFile } from './share';
import { findUrl } from './webpage';

/**
 * Route content shared into the app (links, text, photos, recipe files) to the right place.
 * Recipe files are imported directly; everything else opens the Add screen and starts there.
 */
export function handleSharedPayloads(payloads: ResolvedSharePayload[]): void {
  const recipeFile = payloads.find(
    (p) => p.contentUri && (p.originalName?.endsWith('.json') || p.contentMimeType === 'application/json' || p.contentUri.endsWith('.json')),
  );
  if (recipeFile?.contentUri) {
    importShareFile(recipeFile.contentUri)
      .then((s) => Alert.alert('Recipes imported', describeImport(s)))
      .catch((e: Error) => Alert.alert('Could not import', e.message));
    return;
  }
  const images = payloads.filter((p) => p.contentType === 'image' && p.contentUri).map((p) => p.contentUri!);
  if (images.length) {
    router.push({ pathname: '/add', params: { images: JSON.stringify(images) } });
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
