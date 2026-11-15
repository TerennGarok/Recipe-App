import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RecipeRow } from '@/components/recipe-row';
import { Button, Chip, Field, Icon, T } from '@/components/ui';
import { Spacing, useTheme } from '@/constants/theme';
import { useRecipeList } from '@/lib/db';
import { availableFacets, facetLabel, filterRecipes, type Facet } from '@/lib/facets';

/** How many chips to show per section before "Show all". */
const PREVIEW = 18;

function FacetSection({ title, icon, facets, onPick }: { title: string; icon: 'pricetag-outline' | 'nutrition-outline'; facets: Facet[]; onPick: (key: string) => void }) {
  const t = useTheme();
  const [all, setAll] = useState(false);
  if (!facets.length) return null;
  const shown = all ? facets : facets.slice(0, PREVIEW);
  return (
    <View style={{ gap: Spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
        <Icon name={icon} size={16} color={t.textSecondary} />
        <T kind="small" style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {title}
        </T>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs }}>
        {shown.map((f) => (
          <Chip key={f.key} label={`${f.label} · ${f.count}`} onPress={() => onPick(f.key)} />
        ))}
        {facets.length > PREVIEW ? <Chip label={all ? 'Show fewer' : `+${facets.length - PREVIEW} more`} onPress={() => setAll(!all)} /> : null}
      </View>
    </View>
  );
}

export default function Ideas() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const recipes = useRecipeList('', false);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  const matching = useMemo(() => filterRecipes(recipes ?? [], selected), [recipes, selected]);
  const facets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return availableFacets(matching, selected).filter((f) => !q || f.label.includes(q));
  }, [matching, selected, query]);

  const pick = (key: string) => {
    setSelected((s) => [...s, key]);
    setQuery('');
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <FlatList
        data={matching}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md, paddingBottom: insets.bottom + 40 }}
        ListHeaderComponent={
          <View style={{ gap: Spacing.lg }}>
            <T kind="secondary">Not sure what to make? Pick ingredients you have or tags you&apos;re in the mood for. Each pick narrows the list.</T>
            <Field value={query} onChangeText={setQuery} placeholder="Search ingredients or tags (e.g. chicken, quick)" autoCapitalize="none" autoCorrect={false} />

            {selected.length ? (
              <View style={{ gap: Spacing.sm }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs }}>
                  {selected.map((k) => (
                    <Chip key={k} label={facetLabel(k)} icon="close" selected onPress={() => setSelected((s) => s.filter((x) => x !== k))} />
                  ))}
                </View>
                <Button title="Clear all" variant="ghost" onPress={() => setSelected([])} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
              </View>
            ) : null}

            <FacetSection title="Tags" icon="pricetag-outline" facets={facets.filter((f) => f.kind === 'tag')} onPick={pick} />
            <FacetSection title="Ingredients" icon="nutrition-outline" facets={facets.filter((f) => f.kind === 'ingredient')} onPick={pick} />
            {query && !facets.length ? <T kind="secondary">No ingredient or tag matching “{query}” in these recipes.</T> : null}

            <T kind="heading">
              {matching.length} recipe{matching.length === 1 ? '' : 's'}
              {selected.length ? ' match' : ''}
            </T>
          </View>
        }
        renderItem={({ item }) => <RecipeRow recipe={item} />}
        ListEmptyComponent={
          recipes && recipes.length === 0 ? (
            <View style={{ alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl }}>
              <T kind="secondary">Add some recipes first, then come back for ideas.</T>
              <Button title="Add a recipe" icon="add" onPress={() => router.push('/add')} />
            </View>
          ) : undefined
        }
      />
    </View>
  );
}
