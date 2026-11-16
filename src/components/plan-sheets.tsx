import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, Field, Icon, T } from '@/components/ui';
import { Radius, Spacing, useTheme } from '@/constants/theme';
import { useRecipeList } from '@/lib/db';
import { addPlanEntry, removePlanEntry, updatePlanEntry, type PlanEntry } from '@/lib/mealplan';
import type { Recipe } from '@/lib/types';
import { MEALS, MEAL_LABEL, addDays, dayLabel, suggestRecipes, toKey, type Meal } from '@/lib/week';

function Sheet({ visible, onClose, onShow, children }: { visible: boolean; onClose: () => void; onShow?: () => void; children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={onShow}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: t.card, paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={[styles.grabber, { backgroundColor: t.border }]} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MealPicker({ value, onChange }: { value: Meal; onChange: (m: Meal) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs }}>
      {MEALS.map((m) => (
        <Chip key={m} label={MEAL_LABEL[m]} selected={value === m} onPress={() => onChange(m)} />
      ))}
    </View>
  );
}

/** The next two weeks as tappable chips. */
function DayPicker({ value, onChange, from }: { value: string; onChange: (d: string) => void; from: string }) {
  const today = toKey(new Date());
  const days = Array.from({ length: 14 }, (_, i) => addDays(from, i));
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs }}>
      {days.map((d) => (
        <Chip key={d} label={dayLabel(d, today)} selected={value === d} onPress={() => onChange(d)} />
      ))}
    </View>
  );
}

/** "Add to meal plan" from a recipe page. */
export function PlanRecipeSheet({ recipe, visible, onClose, onSaved }: { recipe: Recipe; visible: boolean; onClose: () => void; onSaved?: (day: string) => void }) {
  const today = toKey(new Date());
  const [day, setDay] = useState(today);
  const [meal, setMeal] = useState<Meal>('dinner');
  return (
    <Sheet visible={visible} onClose={onClose}>
      <T kind="heading" numberOfLines={2}>
        Plan “{recipe.title}”
      </T>
      <T kind="small">Which day?</T>
      <DayPicker value={day} onChange={setDay} from={today} />
      <T kind="small">Which meal?</T>
      <MealPicker value={meal} onChange={setMeal} />
      <Button
        title={`Add to ${dayLabel(day, today)}`}
        icon="calendar"
        onPress={async () => {
          await addPlanEntry({ day, meal, recipeId: recipe.id, title: recipe.title });
          onSaved?.(day);
          onClose();
        }}
      />
    </Sheet>
  );
}

/** Fill in a day directly: type to get recipe suggestions, or save what you typed. */
export function AddEntrySheet({ day, onClose }: { day: string | null; onClose: () => void }) {
  const t = useTheme();
  const recipes = useRecipeList('', false);
  const [text, setText] = useState('');
  const [meal, setMeal] = useState<Meal>('dinner');
  const today = toKey(new Date());
  const suggestions = suggestRecipes(recipes ?? [], text);

  async function save(entry: { recipeId: string | null; title: string }) {
    if (!day || !entry.title.trim()) return;
    await addPlanEntry({ day, meal, ...entry });
    onClose();
  }

  return (
    <Sheet visible={!!day} onClose={onClose} onShow={() => setText('')}>
      <T kind="heading">{day ? dayLabel(day, today) : ''}</T>
      <MealPicker value={meal} onChange={setMeal} />
      <Field
        value={text}
        onChangeText={setText}
        placeholder="Type a recipe or anything (e.g. Leftovers)"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => save({ recipeId: null, title: text })}
      />
      {suggestions.length ? (
        <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
          {suggestions.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => save({ recipeId: r.id, title: r.title })}
              style={({ pressed }) => [styles.suggestion, { borderColor: t.border, opacity: pressed ? 0.6 : 1 }]}>
              <Icon name="book-outline" size={18} color={t.primary} />
              <View style={{ flex: 1 }}>
                <T numberOfLines={1}>{r.title}</T>
                {r.tags.length ? (
                  <T kind="small" numberOfLines={1}>
                    {r.tags.slice(0, 4).join(' · ')}
                  </T>
                ) : null}
              </View>
              {r.favorite ? <Icon name="heart" size={14} color={t.primary} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <Button
        title={text.trim() ? `Save “${text.trim()}”` : 'Type something to save'}
        variant={suggestions.length ? 'secondary' : 'primary'}
        icon="create-outline"
        disabled={!text.trim()}
        onPress={() => save({ recipeId: null, title: text })}
      />
    </Sheet>
  );
}

/** Move, change meal, or remove an entry. */
export function EditEntrySheet({ entry, onClose, onOpenRecipe }: { entry: PlanEntry | null; onClose: () => void; onOpenRecipe: (id: string) => void }) {
  const today = toKey(new Date());
  const from = entry && entry.day < today ? entry.day : today;
  return (
    <Sheet visible={!!entry} onClose={onClose}>
      {entry ? (
        <>
          <T kind="heading" numberOfLines={2}>
            {entry.title}
          </T>
          {entry.recipeId ? <Button title="Open recipe" icon="book-outline" variant="secondary" onPress={() => onOpenRecipe(entry.recipeId!)} /> : null}
          <T kind="small">Move to</T>
          <DayPicker value={entry.day} onChange={(d) => updatePlanEntry(entry.id, { day: d }).then(onClose)} from={from} />
          <T kind="small">Meal</T>
          <MealPicker value={entry.meal} onChange={(m) => updatePlanEntry(entry.id, { meal: m }).then(onClose)} />
          <Button title="Remove from plan" icon="trash-outline" variant="ghost" onPress={() => removePlanEntry(entry.id).then(onClose)} />
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { marginTop: 'auto', borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
});
