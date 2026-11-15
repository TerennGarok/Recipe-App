import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BusyOverlay, Button, Card, Chip, Field, T } from '@/components/ui';
import { Spacing, useTheme } from '@/constants/theme';
import { searchRecipes, type SearchResult } from '@/lib/claude';
import { createRecipe, draftFromUrl } from '@/lib/recipes';

const IDEAS = ['weeknight chicken thighs', 'vegetarian chili', 'sourdough discard pancakes', 'make-ahead breakfast', 'Thanksgiving sides'];

export default function Discover() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});

  async function search(q = query) {
    if (!q.trim()) return;
    setQuery(q);
    setSearching(true);
    setResults(null);
    try {
      setResults(await searchRecipes(q.trim()));
    } catch (e) {
      Alert.alert('Search failed', (e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function save(r: SearchResult) {
    setSaving(`Saving "${r.title}"…`);
    try {
      const draft = await draftFromUrl(r.url);
      draft.source.name ??= r.site;
      const recipe = await createRecipe(draft);
      setSaved((s) => ({ ...s, [r.url]: recipe.id }));
    } catch (e) {
      Alert.alert('Could not save recipe', (e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <FlatList
        data={results ?? []}
        keyExtractor={(r) => r.url}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md, paddingBottom: insets.bottom + 40 }}
        ListHeaderComponent={
          <View style={{ gap: Spacing.md }}>
            <Field value={query} onChangeText={setQuery} placeholder="What do you feel like making?" returnKeyType="search" onSubmitEditing={() => search()} />
            <Button title="Search with Claude" icon="sparkles-outline" onPress={() => search()} loading={searching} disabled={!query.trim()} />
            {!results && !searching ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
                {IDEAS.map((i) => (
                  <Chip key={i} label={i} onPress={() => search(i)} />
                ))}
              </View>
            ) : null}
            {searching ? (
              <View style={{ alignItems: 'center', gap: Spacing.sm, padding: Spacing.xl }}>
                <ActivityIndicator color={t.primary} />
                <T kind="secondary">Claude is searching the web and comparing recipes… this can take a minute.</T>
              </View>
            ) : null}
            {results && results.length === 0 ? <T kind="secondary">No recipes found. Try different words.</T> : null}
          </View>
        }
        renderItem={({ item }) => (
          <Card style={{ gap: Spacing.sm }}>
            <T kind="heading">{item.title}</T>
            <T kind="small">
              {[item.site, item.rating, item.totalTime].filter(Boolean).join(' · ')}
            </T>
            <T kind="secondary">{item.summary}</T>
            <T kind="small" style={{ color: t.accent }}>
              {item.whyGood}
            </T>
            <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs }}>
              <Button title="Preview" variant="secondary" icon="eye-outline" onPress={() => WebBrowser.openBrowserAsync(item.url)} style={{ flex: 1 }} />
              {saved[item.url] ? (
                <Button title="Open" icon="checkmark" onPress={() => router.push(`/recipe/${saved[item.url]}`)} style={{ flex: 1 }} />
              ) : (
                <Button title="Save" icon="bookmark-outline" onPress={() => save(item)} style={{ flex: 1 }} />
              )}
            </View>
          </Card>
        )}
      />
      <BusyOverlay message={saving} />
    </View>
  );
}
