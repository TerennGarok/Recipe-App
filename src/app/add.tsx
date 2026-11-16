import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { ImageEditor } from '@/components/image-editor';
import { KeyboardSafeView } from '@/components/keyboard';
import { BusyOverlay, Button, Card, Field, Icon, IconButton, T } from '@/components/ui';
import { Spacing, useTheme } from '@/constants/theme';
import { recipeFromPhotos, recipeFromText } from '@/lib/claude';
import { pickFromLibrary, takeWithCamera } from '@/lib/pick';
import { createRecipe, draftFromUrl, type LocalAsset } from '@/lib/recipes';
import type { RecipeDraft } from '@/lib/types';
import { findUrl } from '@/lib/webpage';

type Page = LocalAsset & { id: string };

let pageCounter = 0;
const toPage = (a: LocalAsset): Page => ({ ...a, id: `page-${pageCounter++}` });

function sharedImages(param: string | undefined): Page[] {
  try {
    return param ? (JSON.parse(param) as string[]).map((uri) => toPage({ uri, kind: 'image' })) : [];
  } catch {
    return [];
  }
}

export default function AddRecipe() {
  const t = useTheme();
  const params = useLocalSearchParams<{ url?: string; text?: string; images?: string }>();
  const [url, setUrl] = useState(params.url ?? '');
  const [text, setText] = useState(params.text ?? '');
  const [keepPhotos, setKeepPhotos] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const started = useRef(false);
  // Photos waiting to be read, so they can be reviewed, cropped and rotated first.
  const [pages, setPages] = useState<Page[]>(() => sharedImages(params.images));
  const [pageSource, setPageSource] = useState<'camera' | 'photos'>('photos');
  const [editing, setEditing] = useState<Page | null>(null);

  async function run(label: string, makeDraft: () => Promise<RecipeDraft>, media: LocalAsset[] = []) {
    setBusy(label);
    try {
      const draft = await makeDraft();
      setBusy('Saving…');
      const recipe = await createRecipe(draft, media);
      router.replace(`/recipe/${recipe.id}`);
    } catch (e) {
      Alert.alert('Could not add recipe', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function fromPhotos(photos: LocalAsset[], type: 'camera' | 'photos') {
    if (!photos.length) return;
    const keep = keepPhotos ? photos.map((p, i) => ({ ...p, caption: photos.length > 1 ? `Original, page ${i + 1}` : 'Original recipe' })) : [];
    return run(
      `Claude is reading ${photos.length > 1 ? `${photos.length} pages` : 'the recipe'}…`,
      () => recipeFromPhotos(photos.map((p) => p.uri), type),
      keep,
    );
  }

  async function scan() {
    const shot = await takeWithCamera('photo');
    if (!shot.length) return;
    const added = shot.map(toPage);
    setPages((p) => [...p, ...added]);
    setPageSource('camera');
    // Offer crop & rotate right away for camera shots; Cancel keeps the photo as taken.
    setEditing(added[0]);
  }

  async function choose() {
    const picked = await pickFromLibrary('photos');
    if (!picked.length) return;
    setPages((p) => [...p, ...picked.map(toPage)]);
    if (!pages.length) setPageSource('photos');
  }

  function fromUrl(u = url) {
    const link = findUrl(u.trim()) ?? (u.trim() ? `https://${u.trim()}` : '');
    if (!link) return;
    return run('Claude is reading the recipe page…', () => draftFromUrl(link));
  }

  function fromText() {
    if (!text.trim()) return;
    return run('Claude is cleaning up the recipe…', () => recipeFromText(text));
  }

  // A link shared into the app from a browser: start importing right away.
  // (Shared photos wait in the review strip so they can be cropped first.)
  useEffect(() => {
    const sharedUrl = params.url;
    if (started.current || !sharedUrl) return;
    started.current = true;
    // Start after this render so the screen is visible behind the progress overlay.
    const timer = setTimeout(() => fromUrl(sharedUrl), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.url]);

  return (
    <KeyboardSafeView style={{ backgroundColor: t.background }}>
      <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: Spacing.md }}>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
            <Icon name="camera" color={t.primary} />
            <T kind="heading">Paper recipe</T>
          </View>
          <T kind="secondary">Photograph a recipe card or cookbook page. Claude reads handwriting, applies handwritten changes, fixes typos and formats it.</T>
          {pages.length ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
                {pages.map((p, i) => (
                  <View key={p.id} style={{ gap: Spacing.xs, alignItems: 'center' }}>
                    <Pressable onPress={() => setEditing(p)} accessibilityLabel={`Crop or rotate page ${i + 1}`}>
                      <Image source={{ uri: p.uri }} style={[styles.thumb, { backgroundColor: t.chip }]} contentFit="cover" />
                    </Pressable>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <IconButton name="crop" label={`Crop or rotate page ${i + 1}`} color={t.primary} onPress={() => setEditing(p)} />
                      <IconButton name="trash-outline" label={`Remove page ${i + 1}`} color={t.textSecondary} onPress={() => setPages((ps) => ps.filter((x) => x.id !== p.id))} />
                    </View>
                  </View>
                ))}
              </ScrollView>
              <T kind="small">Tap a photo to crop or rotate it. Add more pages if the recipe continues on the back or another page.</T>
              <Button title={`Read ${pages.length > 1 ? `${pages.length} pages` : 'recipe'} with Claude`} icon="sparkles-outline" onPress={() => fromPhotos(pages, pageSource)} />
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <Button title="Add page" icon="camera-outline" variant="secondary" onPress={scan} style={{ flex: 1 }} />
                <Button title="From photos" icon="images-outline" variant="secondary" onPress={choose} style={{ flex: 1 }} />
              </View>
            </>
          ) : (
            <>
              <Button title="Scan with camera" icon="camera-outline" onPress={scan} />
              <Button title="Choose photos" icon="images-outline" variant="secondary" onPress={choose} />
            </>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T kind="secondary">Keep the original photos with the recipe</T>
            <Switch value={keepPhotos} onValueChange={setKeepPhotos} trackColor={{ true: t.primary }} />
          </View>
        </Card>

        <Card style={{ gap: Spacing.md }}>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
            <Icon name="link" color={t.primary} />
            <T kind="heading">From a website</T>
          </View>
          <Field
            value={url}
            onChangeText={setUrl}
            placeholder="https://…"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={() => fromUrl()}
          />
          <Button title="Import from link" icon="download-outline" onPress={() => fromUrl()} disabled={!url.trim()} />
          <T kind="small">Tip: in Safari or Chrome, tap Share → RecipeBox to send a page straight here.</T>
        </Card>

        <Card style={{ gap: Spacing.md }}>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
            <Icon name="document-text-outline" color={t.primary} />
            <T kind="heading">Paste text</T>
          </View>
          <Field value={text} onChangeText={setText} multiline placeholder="Paste a recipe from an email, message or note…" />
          <Button title="Clean up with Claude" icon="sparkles-outline" onPress={fromText} disabled={!text.trim()} />
        </Card>

        <Card style={{ gap: Spacing.md }} onPress={() => router.replace('/batch')}>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
            <Icon name="layers-outline" color={t.primary} />
            <T kind="heading" style={{ flex: 1 }}>
              Many recipes at once
            </T>
            <Icon name="chevron-forward" color={t.textSecondary} />
          </View>
          <T kind="secondary">Got a stack of recipe cards or a list of links? Queue them all and let Claude work through them.</T>
        </Card>

        <Button title="Type it in myself" variant="ghost" icon="create-outline" onPress={() => router.replace('/edit/new')} />
      </ScrollView>
      <ImageEditor
        uri={editing?.uri ?? null}
        cancelLabel={pages.length && editing?.id === pages[pages.length - 1].id && pageSource === 'camera' ? 'Skip' : 'Cancel'}
        onCancel={() => setEditing(null)}
        onDone={(uri) => {
          const page = editing;
          setEditing(null);
          if (page) setPages((ps) => ps.map((x) => (x.id === page.id ? { ...x, uri, mimeType: 'image/jpeg', fileName: null } : x)));
        }}
      />
      <BusyOverlay message={busy} />
    </KeyboardSafeView>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 96, height: 128, borderRadius: 10 },
});
