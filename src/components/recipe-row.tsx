import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Card, Icon, T } from '@/components/ui';
import { Radius, Spacing, useTheme } from '@/constants/theme';
import { mediaUri } from '@/lib/media';
import { coverImage } from '@/lib/recipes';
import type { Recipe } from '@/lib/types';

/** One recipe in a list: cover photo, title, time/source and tags. */
export function RecipeRow({ recipe, onPress }: { recipe: Recipe; onPress?: () => void }) {
  const t = useTheme();
  const cover = coverImage(recipe);
  const uri = cover ? mediaUri(cover) : null;
  const meta = [recipe.totalTime ?? recipe.cookTime, recipe.source.name].filter(Boolean).join(' · ');
  return (
    <Card onPress={onPress ?? (() => router.push(`/recipe/${recipe.id}`))} style={styles.row}>
      <View style={[styles.thumb, { backgroundColor: t.chip }]}>
        {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="restaurant-outline" color={t.textSecondary} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T style={{ fontWeight: '600' }} numberOfLines={2}>
          {recipe.title}
        </T>
        {meta ? (
          <T kind="small" numberOfLines={1}>
            {meta}
          </T>
        ) : null}
        {recipe.tags.length ? (
          <T kind="small" numberOfLines={1} style={{ color: t.primary }}>
            {recipe.tags.slice(0, 4).join(' · ')}
          </T>
        ) : null}
      </View>
      {recipe.favorite ? <Icon name="heart" size={18} color={t.primary} /> : null}
    </Card>
  );
}


const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  thumb: { width: 72, height: 72, borderRadius: Radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
