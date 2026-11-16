import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddEntrySheet, EditEntrySheet } from '@/components/plan-sheets';
import { Card, Icon, IconButton, T } from '@/components/ui';
import { Radius, Spacing, useTheme } from '@/constants/theme';
import { useWeekPlan, type PlanEntry } from '@/lib/mealplan';
import { MEAL_LABEL, addDays, dayLabel, startOfWeek, toKey, weekDays, weekRangeLabel } from '@/lib/week';

export default function Planner() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const today = toKey(new Date());
  const thisWeek = startOfWeek(today);
  const [start, setStart] = useState(thisWeek);
  const entries = useWeekPlan(start);
  const [addingDay, setAddingDay] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlanEntry | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: 'Meal plan' }} />
      <View style={[styles.weekBar, { borderColor: t.border }]}>
        <IconButton name="chevron-back" label="Previous week" color={t.primary} onPress={() => setStart(addDays(start, -7))} />
        <Pressable onPress={() => setStart(thisWeek)} disabled={start === thisWeek} style={{ alignItems: 'center' }}>
          <T style={{ fontWeight: '700' }}>{weekRangeLabel(start)}</T>
          <T kind="small" style={{ color: start === thisWeek ? t.textSecondary : t.primary }}>
            {start === thisWeek ? 'This week' : start === addDays(thisWeek, 7) ? 'Next week · tap for this week' : 'Tap for this week'}
          </T>
        </Pressable>
        <IconButton name="chevron-forward" label="Next week" color={t.primary} onPress={() => setStart(addDays(start, 7))} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md, paddingBottom: insets.bottom + 40 }}>
        {weekDays(start).map((day) => {
          const items = (entries ?? []).filter((e) => e.day === day);
          const isToday = day === today;
          return (
            <Card key={day} style={[{ gap: Spacing.sm, padding: Spacing.md }, isToday && { borderColor: t.primary, borderWidth: 1.5 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <T style={{ fontWeight: '700', color: isToday ? t.primary : t.text }}>{dayLabel(day, today)}</T>
                <Pressable onPress={() => setAddingDay(day)} hitSlop={8} style={styles.add} accessibilityLabel={`Add a meal on ${dayLabel(day, today)}`}>
                  <Icon name="add-circle-outline" size={20} color={t.primary} />
                  <T style={{ color: t.primary, fontWeight: '600' }}>Add</T>
                </Pressable>
              </View>
              {items.length === 0 ? (
                <T kind="small">Nothing planned</T>
              ) : (
                items.map((e) => (
                  <Pressable
                    key={e.id}
                    onPress={() => (e.recipeId ? router.push(`/recipe/${e.recipeId}`) : setEditing(e))}
                    onLongPress={() => setEditing(e)}
                    delayLongPress={350}
                    style={({ pressed }) => [styles.entry, { backgroundColor: pressed ? t.chip : 'transparent' }]}>
                    <View style={[styles.meal, { backgroundColor: t.chip }]}>
                      <T kind="small" style={{ color: t.primary, fontWeight: '600' }}>
                        {MEAL_LABEL[e.meal]}
                      </T>
                    </View>
                    <T style={{ flex: 1 }} numberOfLines={2}>
                      {e.title}
                    </T>
                    {e.recipeId ? <Icon name="chevron-forward" size={16} color={t.textSecondary} /> : null}
                  </Pressable>
                ))
              )}
            </Card>
          );
        })}
        <T kind="small" style={{ textAlign: 'center' }}>
          Tap a planned recipe to open it. Press and hold any entry to move or remove it.
        </T>
      </ScrollView>

      <AddEntrySheet day={addingDay} onClose={() => setAddingDay(null)} />
      <EditEntrySheet
        entry={editing}
        onClose={() => setEditing(null)}
        onOpenRecipe={(id) => {
          setEditing(null);
          router.push(`/recipe/${id}`);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  weekBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6, paddingHorizontal: 4, borderRadius: Radius.sm },
  meal: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill, minWidth: 72, alignItems: 'center' },
});
