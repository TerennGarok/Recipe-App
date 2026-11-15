import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImageEditor } from '@/components/image-editor';
import { LineEditor, type LineEdit } from '@/components/line-editor';
import { ListPickerSheet } from '@/components/list-picker';
import { MediaGallery } from '@/components/media-gallery';
import { BusyOverlay, Button, Chip, Icon, IconButton, PromptModal, T } from '@/components/ui';
import { Radius, Spacing, useTheme } from '@/constants/theme';
import type { ShoppingItemInput } from '@/lib/anylist/client';
import { saveRecipe, useRecipe } from '@/lib/db';
import { groupBySection, parseIngredientLine } from '@/lib/ingredients';
import { pickFromLibrary, takeWithCamera } from '@/lib/pick';
import { mediaUri } from '@/lib/media';
import { addMedia, deleteRecipe, guessMediaKind, makeCover, removeMedia, replaceMediaImage, toggleFavorite, type LocalAsset } from '@/lib/recipes';
import { shareRecipes } from '@/lib/share';
import type { Ingredient, Media, Recipe } from '@/lib/types';

type Option = { label: string; onPress: () => void; destructive?: boolean };

/** Native action sheet on iOS, alert-style menu on Android. */
function chooseAction(title: string, options: Option[]) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...options.map((o) => o.label), 'Cancel'],
        cancelButtonIndex: options.length,
        destructiveButtonIndex: options.findIndex((o) => o.destructive),
      },
      (i) => options[i]?.onPress(),
    );
  } else {
    Alert.alert(title, undefined, [...options.map((o) => ({ text: o.label, onPress: o.onPress, style: o.destructive ? ('destructive' as const) : undefined })), { text: 'Cancel', style: 'cancel' }]);
  }
}

function toShoppingItem(i: Ingredient, r: Recipe): ShoppingItemInput {
  return { name: i.item, quantity: i.quantity, details: `${i.text} — for ${r.title}` };
}

function Meta({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={{ minWidth: 70 }}>
      <T kind="small">{label}</T>
      <T style={{ fontWeight: '600' }}>{value}</T>
    </View>
  );
}

export default function RecipeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipe = useRecipe(id);
  const [pickerItems, setPickerItems] = useState<ShoppingItemInput[] | null>(null);
  const [shopMode, setShopMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [doneSteps, setDoneSteps] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [linkPrompt, setLinkPrompt] = useState(false);
  const [lineEdit, setLineEdit] = useState<LineEdit | null>(null);
  const [cropping, setCropping] = useState<Media | null>(null);
  const [newPhoto, setNewPhoto] = useState<LocalAsset | null>(null);

  if (recipe === undefined) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.background }}>
        <ActivityIndicator color={t.primary} />
      </View>
    );
  }
  if (recipe === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.background }}>
        <T>This recipe was deleted.</T>
      </View>
    );
  }
  const r = recipe;

  function openPicker(ingredients: Ingredient[]) {
    setPendingIds(ingredients.map((i) => i.id));
    setPickerItems(ingredients.map((i) => toShoppingItem(i, r)));
  }

  async function withBusy(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Something went wrong', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  /** A single new photo opens in the crop & rotate editor first; videos and batches are saved as-is. */
  function addPicked(assets: LocalAsset[]) {
    if (assets.length === 1 && assets[0].kind === 'image') setNewPhoto(assets[0]);
    else if (assets.length) withBusy('Saving…', () => addMedia(r.id, assets));
  }

  function addMediaMenu() {
    chooseAction('Add photo or video', [
      { label: 'Take photo or video', onPress: async () => addPicked(await takeWithCamera('photo-or-video')) },
      { label: 'Choose from library', onPress: async () => addPicked(await pickFromLibrary('photos-and-videos')) },
      { label: 'From a web link', onPress: () => setLinkPrompt(true) },
    ]);
  }

  function mediaMenu(m: Media) {
    chooseAction(m.kind === 'image' ? 'Photo' : 'Video', [
      ...(m.kind === 'image' && m.localPath ? [{ label: 'Crop & rotate', onPress: () => setCropping(m) }] : []),
      ...(m.kind === 'image' ? [{ label: 'Use as cover photo', onPress: () => makeCover(r.id, m.id) }] : []),
      ...(m.remoteUrl ? [{ label: 'Open original link', onPress: () => WebBrowser.openBrowserAsync(m.remoteUrl!) }] : []),
      { label: 'Remove', destructive: true, onPress: () => removeMedia(r.id, m.id) },
    ]);
  }

  function moreMenu() {
    chooseAction(r.title, [
      { label: 'Edit recipe', onPress: () => router.push(`/edit/${r.id}`) },
      { label: 'Share with family', onPress: () => withBusy('Preparing file…', () => shareRecipes([r]).then((w) => w.length && Alert.alert('Note', w.join('\n')))) },
      ...(r.source.url ? [{ label: 'Open original page', onPress: () => WebBrowser.openBrowserAsync(r.source.url!) }] : []),
      {
        label: 'Delete recipe',
        destructive: true,
        onPress: () =>
          Alert.alert('Delete recipe?', `"${r.title}" and its photos will be removed from this device.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteRecipe(r.id).then(() => router.back()) },
          ]),
      },
    ]);
  }

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <IconButton name={r.favorite ? 'heart' : 'heart-outline'} label="Favorite" color={t.primary} onPress={() => toggleFavorite(r)} />
              <IconButton name="share-outline" label="Share" color={t.primary} onPress={() => withBusy('Preparing file…', () => shareRecipes([r]))} />
              <IconButton name="ellipsis-horizontal-circle-outline" label="More" color={t.primary} onPress={moreMenu} />
            </View>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ paddingVertical: Spacing.md, paddingBottom: insets.bottom + (shopMode ? 120 : 40), gap: Spacing.lg }}>
        <MediaGallery media={r.media} onAdd={addMediaMenu} onLongPress={mediaMenu} />

        <View style={styles.section}>
          <T kind="title">{r.title}</T>
          {r.source.name || r.source.url ? (
            <Pressable disabled={!r.source.url} onPress={() => r.source.url && WebBrowser.openBrowserAsync(r.source.url)}>
              <T kind="secondary" style={r.source.url ? { color: t.primary } : undefined}>
                From {r.source.name ?? r.source.url}
              </T>
            </Pressable>
          ) : null}
          {r.description ? <T kind="secondary">{r.description}</T> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg, marginTop: Spacing.sm }}>
            <Meta label="Serves" value={r.servings} />
            <Meta label="Prep" value={r.prepTime} />
            <Meta label="Cook" value={r.cookTime} />
            <Meta label="Total" value={r.totalTime} />
          </View>
          {r.tags.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.sm }}>
              {r.tags.map((tag) => (
                <Chip key={tag} label={tag} />
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T kind="heading">Ingredients</T>
            <Chip
              label={shopMode ? 'Cancel' : 'Shop'}
              icon={shopMode ? 'close' : 'cart-outline'}
              selected={shopMode}
              onPress={() => {
                setShopMode(!shopMode);
                setSelected(new Set());
              }}
            />
          </View>
          <T kind="small">{shopMode ? 'Tap the ingredients you need to buy.' : 'Tap an ingredient to add it to an AnyList list. Press and hold to edit.'}</T>
          {groupBySection(r.ingredients).map((g, gi) => (
            <View key={gi} style={{ gap: 2 }}>
              {g.section ? <T style={{ fontWeight: '700', marginTop: Spacing.sm }}>{g.section}</T> : null}
              {g.items.map((ing) => {
                const isSel = selected.has(ing.id);
                const isAdded = added.has(ing.id);
                return (
                  <Pressable
                    key={ing.id}
                    onPress={() => (shopMode ? toggle(selected, setSelected, ing.id) : openPicker([ing]))}
                    onLongPress={() => setLineEdit({ kind: 'ingredient', id: ing.id, text: ing.text, label: 'Edit ingredient' })}
                    delayLongPress={400}
                    style={({ pressed }) => [styles.ingredient, { borderColor: t.border, backgroundColor: pressed || isSel ? t.chip : 'transparent' }]}>
                    <Icon
                      name={shopMode ? (isSel ? 'checkbox' : 'square-outline') : isAdded ? 'checkmark-circle' : 'add-circle-outline'}
                      size={20}
                      color={isAdded && !shopMode ? t.accent : t.primary}
                    />
                    <T style={{ flex: 1 }}>{ing.text}</T>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <T kind="heading">Steps</T>
          {groupBySection(r.steps).map((g, gi) => (
            <View key={gi} style={{ gap: Spacing.sm }}>
              {g.section ? <T style={{ fontWeight: '700', marginTop: Spacing.sm }}>{g.section}</T> : null}
              {g.items.map((s) => {
                const n = r.steps.indexOf(s) + 1;
                const done = doneSteps.has(s.id);
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => toggle(doneSteps, setDoneSteps, s.id)}
                    onLongPress={() => setLineEdit({ kind: 'step', id: s.id, text: s.text, label: `Edit step ${n}` })}
                    delayLongPress={400}
                    style={styles.step}>
                    <View style={[styles.stepNum, { backgroundColor: done ? t.accent : t.primary }]}>
                      {done ? <Icon name="checkmark" size={16} color={t.primaryText} /> : <T style={{ color: t.primaryText, fontWeight: '700' }}>{n}</T>}
                    </View>
                    <T style={{ flex: 1, opacity: done ? 0.5 : 1 }}>{s.text}</T>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        {r.notes ? (
          <View style={styles.section}>
            <T kind="heading">Notes</T>
            <T kind="secondary">{r.notes}</T>
          </View>
        ) : null}
      </ScrollView>

      {shopMode ? (
        <View style={[styles.shopBar, { backgroundColor: t.card, borderColor: t.border, paddingBottom: insets.bottom + Spacing.md }]}>
          <Button
            title={selected.size ? `Add ${selected.size} item${selected.size > 1 ? 's' : ''} to a list` : 'Select ingredients'}
            icon="cart"
            disabled={!selected.size}
            onPress={() => openPicker(r.ingredients.filter((i) => selected.has(i.id)))}
          />
        </View>
      ) : null}

      <ListPickerSheet
        items={pickerItems}
        onClose={() => setPickerItems(null)}
        onAdded={() => {
          setAdded(new Set([...added, ...pendingIds]));
          setShopMode(false);
          setSelected(new Set());
        }}
      />
      <ImageEditor
        uri={cropping ? mediaUri(cropping) : null}
        onCancel={() => setCropping(null)}
        onDone={(uri) => {
          const m = cropping;
          setCropping(null);
          if (m && uri !== mediaUri(m)) withBusy('Saving…', () => replaceMediaImage(r.id, m.id, uri));
        }}
      />
      <ImageEditor
        uri={newPhoto?.uri ?? null}
        cancelLabel="Skip"
        onCancel={() => {
          // Cancel still keeps the photo, just unedited.
          const a = newPhoto;
          setNewPhoto(null);
          if (a) withBusy('Saving…', () => addMedia(r.id, [a]));
        }}
        onDone={(uri) => {
          const a = newPhoto;
          setNewPhoto(null);
          if (a) withBusy('Saving…', () => addMedia(r.id, [uri === a.uri ? a : { uri, kind: 'image', mimeType: 'image/jpeg' }]));
        }}
      />
      <LineEditor
        edit={lineEdit}
        onClose={() => setLineEdit(null)}
        onSave={(e, text) => {
          setLineEdit(null);
          if (text === e.text) return;
          if (e.kind === 'ingredient') {
            const { item, quantity } = parseIngredientLine(text);
            saveRecipe({ ...r, ingredients: r.ingredients.map((i) => (i.id === e.id ? { ...i, text, item, quantity } : i)) });
          } else {
            saveRecipe({ ...r, steps: r.steps.map((st) => (st.id === e.id ? { ...st, text } : st)) });
          }
        }}
        onDelete={(e) => {
          setLineEdit(null);
          if (e.kind === 'ingredient') saveRecipe({ ...r, ingredients: r.ingredients.filter((i) => i.id !== e.id) });
          else saveRecipe({ ...r, steps: r.steps.filter((st) => st.id !== e.id) });
        }}
      />
      <PromptModal
        visible={linkPrompt}
        title="Photo or video link"
        message="Paste a link to an image, a video file, or a YouTube, Vimeo or TikTok page."
        placeholder="https://…"
        onCancel={() => setLinkPrompt(false)}
        onSubmit={(u) => {
          setLinkPrompt(false);
          if (/^https?:\/\//.test(u)) withBusy('Downloading…', () => addMedia(r.id, [{ url: u, kind: guessMediaKind(u) }]));
          else Alert.alert('That doesn’t look like a web link');
        }}
      />
      <BusyOverlay message={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  ingredient: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 10, paddingHorizontal: Spacing.sm, borderRadius: Radius.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  step: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  shopBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: Spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
});
