import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardSafeView } from '@/components/keyboard';
import { Button, Card, Chip, Field, Icon, T } from '@/components/ui';
import { Radius, Spacing, useTheme } from '@/constants/theme';
import {
  addLinks,
  addPdfs,
  addPhotos,
  batchPhotoUri,
  canCombine,
  clearFinished,
  combine,
  pauseBatch,
  removeItem,
  retry,
  setKeepPhotos,
  split,
  startBatch,
  useBatch,
  type BatchItem,
} from '@/lib/batch';
import { pickFromLibrary, takeWithCamera } from '@/lib/pick';
import { formatUsd } from '@/lib/pricing';
import { useSpending } from '@/lib/spending';

function StatusBadge({ item }: { item: BatchItem }) {
  const t = useTheme();
  if (item.status === 'working') return <ActivityIndicator color={t.primary} />;
  const map = {
    waiting: { icon: 'time-outline', color: t.textSecondary, label: 'Waiting' },
    done: { icon: 'checkmark-circle', color: t.accent, label: 'Added' },
    failed: { icon: 'alert-circle', color: t.danger, label: 'Failed' },
  } as const;
  const s = map[item.status];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon name={s.icon} size={16} color={s.color} />
      <T kind="small" style={{ color: s.color, fontWeight: '600' }}>
        {s.label}
      </T>
    </View>
  );
}

function ItemRow({ item, index, items }: { item: BatchItem; index: number; items: BatchItem[] }) {
  const t = useTheme();
  const editable = item.status === 'waiting' || item.status === 'failed';
  return (
    <Card style={{ gap: Spacing.sm, padding: Spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
        {item.kind === 'photos' ? (
          <View style={{ flexDirection: 'row' }}>
            {item.pages.slice(0, 3).map((p, n) => (
              <Image
                key={p}
                source={{ uri: batchPhotoUri(p) }}
                style={[styles.thumb, { backgroundColor: t.chip, marginLeft: n ? -28 : 0, borderColor: t.card }]}
                contentFit="cover"
              />
            ))}
          </View>
        ) : (
          <View style={[styles.thumb, { backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center', borderColor: t.card }]}>
            <Icon name={item.kind === 'pdf' ? 'document-text-outline' : 'link'} color={t.primary} />
          </View>
        )}
        <Pressable style={{ flex: 1, gap: 2 }} disabled={!item.recipeId} onPress={() => item.recipeId && router.push(`/recipe/${item.recipeId}`)}>
          <T numberOfLines={2} style={{ fontWeight: '600' }}>
            {item.title ?? (item.kind === 'link' ? item.url?.replace(/^https?:\/\/(www\.)?/, '') : item.kind === 'pdf' ? item.fileName : `Recipe ${index + 1}`)}
          </T>
          <T kind="small">
            {item.kind === 'photos' ? `${item.pages.length} photo${item.pages.length > 1 ? 's' : ''}` : item.kind === 'pdf' ? 'PDF — every recipe in it is added' : 'Web link'}
          </T>
          {item.error ? (
            <T kind="small" style={{ color: t.danger }} numberOfLines={3}>
              {item.error}
            </T>
          ) : null}
        </Pressable>
        <StatusBadge item={item} />
      </View>
      {editable || item.status === 'done' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs }}>
          {editable && canCombine(items, item.id) ? <Chip label="Same recipe as above" icon="git-merge-outline" onPress={() => combine(item.id)} /> : null}
          {editable && item.pages.length > 1 ? <Chip label="Split into separate recipes" icon="git-branch-outline" onPress={() => split(item.id)} /> : null}
          {item.status === 'failed' ? <Chip label="Retry" icon="refresh" onPress={() => retry(item.id)} /> : null}
          {item.status === 'done'
            ? (item.results ?? (item.recipeId ? [{ id: item.recipeId, title: item.title ?? 'Recipe' }] : [])).map((r) => (
                <Chip key={r.id} label={(item.results?.length ?? 1) > 1 ? r.title : 'Open recipe'} icon="book-outline" onPress={() => router.push(`/recipe/${r.id}`)} />
              ))
            : null}
          {editable ? <Chip label="Remove" icon="trash-outline" onPress={() => removeItem(item.id)} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

export default function Batch() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { items, running, keepPhotos, summary } = useBatch();
  const spending = useSpending();
  const [links, setLinks] = useState('');
  const [adding, setAdding] = useState(false);

  async function add(fn: () => Promise<unknown>) {
    setAdding(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Could not add', (e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function takeMany() {
    for (;;) {
      const shot = await takeWithCamera('photo');
      if (!shot.length) break;
      await addPhotos(shot);
    }
  }

  async function choosePdfs() {
    const picked = await File.pickFileAsync({ mimeTypes: ['application/pdf'], multipleFiles: true });
    if (picked.canceled) return;
    const tooBig = await addPdfs(picked.result.map((f) => ({ uri: f.uri, name: f.name })));
    if (tooBig.length) Alert.alert('Some PDFs are too large', `${tooBig.join(', ')} ${tooBig.length > 1 ? 'are' : 'is'} over 30 MB. Split ${tooBig.length > 1 ? 'them' : 'it'} into smaller PDFs.`);
  }

  const remaining = summary.waiting + summary.working;
  const estimate = spending?.avgPerRecipe != null && remaining ? ` · about ${formatUsd(spending.avgPerRecipe * remaining)}` : '';

  return (
    <KeyboardSafeView style={{ backgroundColor: t.background }}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md, paddingBottom: insets.bottom + 120 }}
        ListHeaderComponent={
          <View style={{ gap: Spacing.md }}>
            <T kind="secondary">
              Queue up a stack of recipe cards, PDFs or links, then let Claude work through them. Each photo becomes its own recipe — tap “Same recipe as above” for the back of a card or a second page. A PDF can hold many recipes; each one is added.
            </T>
            <Card style={{ gap: Spacing.md }}>
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <Button title="Photos" icon="images-outline" onPress={() => add(async () => addPhotos(await pickFromLibrary('photos')))} style={{ flex: 1 }} loading={adding} />
                <Button title="Camera" icon="camera-outline" variant="secondary" onPress={() => add(takeMany)} style={{ flex: 1 }} />
                <Button title="PDFs" icon="document-text-outline" variant="secondary" onPress={() => add(choosePdfs)} style={{ flex: 1 }} />
              </View>
              <Field value={links} onChangeText={setLinks} multiline style={{ minHeight: 70 }} placeholder="Paste recipe links, one per line" autoCapitalize="none" autoCorrect={false} />
              <Button
                title="Add links"
                icon="link"
                variant="secondary"
                disabled={!links.trim()}
                onPress={() => {
                  const n = addLinks(links);
                  setLinks('');
                  if (!n) Alert.alert('No new links found', 'Paste full web addresses starting with https://');
                }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <T kind="secondary" style={{ flex: 1 }}>
                  Keep the original photos with each recipe
                </T>
                <Switch value={keepPhotos} onValueChange={setKeepPhotos} trackColor={{ true: t.primary }} />
              </View>
            </Card>
            {items.length ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <T kind="heading">
                  {summary.done}/{summary.total} added{summary.failed ? ` · ${summary.failed} failed` : ''}
                </T>
                {summary.done ? <Button title="Clear added" variant="ghost" onPress={clearFinished} style={{ paddingHorizontal: 0 }} /> : null}
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => <ItemRow item={item} index={index} items={items} />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl }}>
            <Icon name="layers-outline" size={40} color={t.textSecondary} />
            <T kind="secondary">Nothing queued yet.</T>
          </View>
        }
      />
      {remaining ? (
        <View style={[styles.bar, { backgroundColor: t.card, borderColor: t.border, paddingBottom: insets.bottom + Spacing.md }]}>
          {running ? (
            <>
              <T kind="small" style={{ textAlign: 'center' }}>
                Working on {summary.working}, {summary.waiting} waiting{estimate}. Keep RecipeBox open while it works.
              </T>
              <Button title="Pause" icon="pause" variant="secondary" onPress={pauseBatch} />
            </>
          ) : (
            <>
              <T kind="small" style={{ textAlign: 'center' }}>
                {remaining} recipe{remaining > 1 ? 's' : ''} to process{estimate}
              </T>
              <Button title={summary.done || summary.failed ? 'Resume' : `Process ${remaining} with Claude`} icon="sparkles-outline" onPress={startBatch} />
            </>
          )}
        </View>
      ) : null}
    </KeyboardSafeView>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 56, height: 72, borderRadius: Radius.sm, borderWidth: 2 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: Spacing.md, gap: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
});
