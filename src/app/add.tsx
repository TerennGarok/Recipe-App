import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';

import { BusyOverlay, Button, Card, Field, Icon, T } from '@/components/ui';
import { Spacing, useTheme } from '@/constants/theme';
import { recipeFromPhotos, recipeFromText } from '@/lib/claude';
import { pickFromLibrary, takeWithCamera } from '@/lib/pick';
import { createRecipe, draftFromUrl, type LocalAsset } from '@/lib/recipes';
import type { RecipeDraft } from '@/lib/types';
import { findUrl } from '@/lib/webpage';

function ask(title: string, message: string, yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: no, style: 'cancel', onPress: () => resolve(false) },
      { text: yes, onPress: () => resolve(true) },
    ]),
  );
}

export default function AddRecipe() {
  const t = useTheme();
  const params = useLocalSearchParams<{ url?: string; text?: string; images?: string }>();
  const [url, setUrl] = useState(params.url ?? '');
  const [text, setText] = useState(params.text ?? '');
  const [keepPhotos, setKeepPhotos] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const started = useRef(false);

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
    const pages: LocalAsset[] = [];
    for (;;) {
      const shot = await takeWithCamera('photo');
      if (!shot.length) break;
      pages.push(...shot);
      const more = await ask(`${pages.length} page${pages.length > 1 ? 's' : ''} captured`, 'Does the recipe continue on another page or the back of the card?', 'Add page', 'Done');
      if (!more) break;
    }
    await fromPhotos(pages, 'camera');
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

  // Shared into the app from another app: start right away.
  useEffect(() => {
    if (started.current) return;
    let uris: string[] | null = null;
    try {
      uris = params.images ? (JSON.parse(params.images) as string[]) : null;
    } catch {}
    const sharedUrl = params.url;
    if (!uris?.length && !sharedUrl) return;
    started.current = true;
    // Start after this render so the screen is visible behind the progress overlay.
    const timer = setTimeout(() => {
      if (uris?.length) fromPhotos(uris.map((uri) => ({ uri, kind: 'image' as const })), 'photos');
      else if (sharedUrl) fromUrl(sharedUrl);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.images, params.url]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: Spacing.md }}>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
            <Icon name="camera" color={t.primary} />
            <T kind="heading">Paper recipe</T>
          </View>
          <T kind="secondary">Photograph a recipe card or cookbook page. Claude reads handwriting, fixes typos and formats it.</T>
          <Button title="Scan with camera" icon="camera-outline" onPress={scan} />
          <Button title="Choose photos" icon="images-outline" variant="secondary" onPress={async () => fromPhotos(await pickFromLibrary('photos'), 'photos')} />
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

        <Button title="Type it in myself" variant="ghost" icon="create-outline" onPress={() => router.replace('/edit/new')} />
      </ScrollView>
      <BusyOverlay message={busy} />
    </KeyboardAvoidingView>
  );
}
