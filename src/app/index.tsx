import { Link, Stack, router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RecipeRow } from '@/components/recipe-row';
import { Button, Card, Chip, Icon, IconButton, T } from '@/components/ui';
import { Radius, Spacing, useTheme } from '@/constants/theme';
import { useBatch } from '@/lib/batch';
import { useRecipeList } from '@/lib/db';
import { useHasAnthropicKey } from '@/lib/settings';

export default function Home() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState(false);
  const recipes = useRecipeList(query, favorites);
  const hasKey = useHasAnthropicKey();
  const batch = useBatch();
  const batchLeft = batch.summary.waiting + batch.summary.working;

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <IconButton name="globe-outline" label="Find recipes online" color={t.primary} onPress={() => router.push('/discover')} />
              <IconButton name="settings-outline" label="Settings" color={t.primary} onPress={() => router.push('/settings')} />
            </View>
          ),
        }}
      />
      <FlatList
        data={recipes ?? []}
        keyExtractor={(r) => r.id}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md, paddingBottom: insets.bottom + 100 }}
        ListHeaderComponent={
          <View style={{ gap: Spacing.md }}>
            {hasKey === false ? (
              <Card style={{ gap: Spacing.sm, borderColor: t.primary }}>
                <T style={{ fontWeight: '600' }}>Set up Claude</T>
                <T kind="secondary">Add your Anthropic API key so Claude can scan, clean up and find recipes.</T>
                <Link href="/settings" asChild>
                  <Pressable>
                    <T style={{ color: t.primary, fontWeight: '600' }}>Open Settings →</T>
                  </Pressable>
                </Link>
              </Card>
            ) : null}
            {batchLeft || batch.summary.failed ? (
              <Card onPress={() => router.push('/batch')} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderColor: t.primary }}>
                <Icon name="layers-outline" color={t.primary} />
                <T style={{ flex: 1 }}>
                  {batch.running
                    ? `Importing recipes… ${batch.summary.done} of ${batch.summary.total} done`
                    : batchLeft
                      ? `${batchLeft} recipe${batchLeft > 1 ? 's' : ''} waiting in batch import`
                      : `${batch.summary.failed} batch import${batch.summary.failed > 1 ? 's' : ''} failed`}
                </T>
                <Icon name="chevron-forward" color={t.textSecondary} />
              </Card>
            ) : null}
            <View style={[styles.search, { backgroundColor: t.card, borderColor: t.border }]}>
              <Icon name="search" size={18} color={t.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search recipes, ingredients, tags"
                placeholderTextColor={t.textSecondary}
                style={{ flex: 1, fontSize: 16, color: t.text, paddingVertical: 10 }}
                clearButtonMode="while-editing"
                autoCorrect={false}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <Button title="Meal plan" icon="calendar-outline" variant="secondary" onPress={() => router.push('/planner')} style={{ flex: 1 }} />
              <Button title="Ideas" icon="bulb-outline" variant="secondary" onPress={() => router.push('/ideas')} style={{ flex: 1 }} />
            </View>
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <Chip label="All" selected={!favorites} onPress={() => setFavorites(false)} />
              <Chip label="Favorites" icon="heart" selected={favorites} onPress={() => setFavorites(true)} />
            </View>
          </View>
        }
        renderItem={({ item }) => <RecipeRow recipe={item} />}
        ListEmptyComponent={
          recipes ? (
            <View style={styles.empty}>
              <Icon name="book-outline" size={48} color={t.textSecondary} />
              <T kind="heading">{query || favorites ? 'No matches' : 'Your recipe box is empty'}</T>
              <T kind="secondary" style={{ textAlign: 'center' }}>
                {query || favorites
                  ? 'Try a different search.'
                  : 'Scan a recipe card, paste a link, or find something new online.'}
              </T>
              {!query && !favorites ? <Button title="Find recipes online" variant="secondary" icon="globe-outline" onPress={() => router.push('/discover')} /> : null}
            </View>
          ) : undefined
        }
      />
      <View style={[styles.fabWrap, { bottom: insets.bottom + Spacing.lg }]}>
        <Button title="Add recipe" icon="add" onPress={() => router.push('/add')} style={styles.fab} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  thumb: { width: 72, height: 72, borderRadius: Radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md },
  empty: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xxl },
  fabWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  fab: { borderRadius: Radius.pill, paddingHorizontal: Spacing.xl, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
});
