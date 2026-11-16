import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { KeyboardSafeView } from '@/components/keyboard';
import { BusyOverlay, Button, Field, T } from '@/components/ui';
import { Spacing, useTheme } from '@/constants/theme';
import { recipeFromText } from '@/lib/claude';
import { getRecipe, saveRecipe } from '@/lib/db';
import { newId } from '@/lib/id';
import { parseIngredientLine, parseSectionedLines, toSectionedText } from '@/lib/ingredients';
import { createRecipe } from '@/lib/recipes';
import type { Ingredient, Recipe, RecipeDraft } from '@/lib/types';

type Form = {
  title: string;
  description: string;
  servings: string;
  prepTime: string;
  cookTime: string;
  totalTime: string;
  ingredients: string;
  steps: string;
  notes: string;
  tags: string;
  sourceName: string;
  sourceUrl: string;
};

const EMPTY: Form = { title: '', description: '', servings: '', prepTime: '', cookTime: '', totalTime: '', ingredients: '', steps: '', notes: '', tags: '', sourceName: '', sourceUrl: '' };

function toForm(r: Pick<Recipe, 'title' | 'description' | 'servings' | 'prepTime' | 'cookTime' | 'totalTime' | 'ingredients' | 'steps' | 'notes' | 'tags' | 'source'>): Form {
  return {
    title: r.title,
    description: r.description ?? '',
    servings: r.servings ?? '',
    prepTime: r.prepTime ?? '',
    cookTime: r.cookTime ?? '',
    totalTime: r.totalTime ?? '',
    ingredients: toSectionedText(r.ingredients),
    steps: toSectionedText(r.steps),
    notes: r.notes ?? '',
    tags: r.tags.join(', '),
    sourceName: r.source.name ?? '',
    sourceUrl: r.source.url ?? '',
  };
}

const orNull = (s: string) => (s.trim() ? s.trim() : null);

/** Turn the form back into recipe fields, keeping Claude's shopping names for unchanged lines. */
function fromForm(f: Form, previous: Ingredient[]): Omit<RecipeDraft, 'source'> & { source: { name: string | null; url: string | null } } {
  const byText = new Map(previous.map((i) => [i.text, i]));
  return {
    title: f.title.trim() || 'Untitled recipe',
    description: orNull(f.description),
    servings: orNull(f.servings),
    prepTime: orNull(f.prepTime),
    cookTime: orNull(f.cookTime),
    totalTime: orNull(f.totalTime),
    ingredients: parseSectionedLines(f.ingredients).map((l) => {
      const prev = byText.get(l.text);
      if (prev) return { ...prev, section: l.section };
      const { item, quantity } = parseIngredientLine(l.text);
      return { id: newId(), section: l.section, text: l.text, item, quantity };
    }),
    steps: parseSectionedLines(f.steps).map((l) => ({ id: newId(), section: l.section, text: l.text })),
    notes: orNull(f.notes),
    tags: [...new Set(f.tags.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean))],
    source: { name: orNull(f.sourceName), url: orNull(f.sourceUrl) },
  };
}

export default function EditRecipe() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const [original, setOriginal] = useState<Recipe | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [ingredientHints, setIngredientHints] = useState<Ingredient[]>([]);

  useEffect(() => {
    if (isNew) return;
    getRecipe(id).then((r) => {
      if (!r) return;
      setOriginal(r);
      setForm(toForm(r));
      setIngredientHints(r.ingredients);
    });
  }, [id, isNew]);

  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function tidy() {
    const text = [
      form.title,
      form.description,
      form.servings && `Serves ${form.servings}`,
      form.prepTime && `Prep: ${form.prepTime}`,
      form.cookTime && `Cook: ${form.cookTime}`,
      form.totalTime && `Total: ${form.totalTime}`,
      'Ingredients:',
      form.ingredients,
      'Instructions:',
      form.steps,
      form.notes && `Notes: ${form.notes}`,
    ]
      .filter(Boolean)
      .join('\n');
    setBusy('Claude is tidying up…');
    try {
      const d = await recipeFromText(text);
      setForm((f) => ({ ...toForm({ ...d, source: { ...d.source, name: f.sourceName || d.source.name, url: f.sourceUrl || null } }), tags: f.tags || d.tags.join(', ') }));
      setIngredientHints(d.ingredients);
    } catch (e) {
      Alert.alert('Could not tidy recipe', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const fields = fromForm(form, ingredientHints);
    if (!fields.ingredients.length && !fields.steps.length) {
      Alert.alert('Add some ingredients or steps first');
      return;
    }
    if (original) {
      await saveRecipe({ ...original, ...fields, source: { ...original.source, ...fields.source } });
      router.back();
    } else {
      const r = await createRecipe({ ...fields, source: { type: 'manual', ...fields.source } });
      router.replace(`/recipe/${r.id}`);
    }
  }

  return (
    <KeyboardSafeView style={{ backgroundColor: t.background }}>
      <Stack.Screen
        options={{
          title: isNew ? 'New recipe' : 'Edit recipe',
          headerLeft: () => <Button title="Cancel" variant="ghost" onPress={() => router.back()} style={{ paddingHorizontal: 0 }} />,
          headerRight: () => <Button title="Save" variant="ghost" onPress={save} style={{ paddingHorizontal: 0 }} />,
        }}
      />
      <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
        <Field label="Title" value={form.title} onChangeText={set('title')} placeholder="Grandma's apple pie" />
        <Field label="Description" value={form.description} onChangeText={set('description')} placeholder="Optional" multiline style={{ minHeight: 60 }} />
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Field label="Serves" value={form.servings} onChangeText={set('servings')} placeholder="4" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Prep" value={form.prepTime} onChangeText={set('prepTime')} placeholder="15 min" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Cook" value={form.cookTime} onChangeText={set('cookTime')} placeholder="1 hr" />
          </View>
        </View>
        <Field label="Total time" value={form.totalTime} onChangeText={set('totalTime')} placeholder="1 hr 15 min" />
        <View style={{ gap: Spacing.xs }}>
          <Field label="Ingredients — one per line" value={form.ingredients} onChangeText={set('ingredients')} multiline placeholder={'2 cups flour\n1 tsp salt\n\n## Filling\n6 apples, sliced'} />
          <T kind="small">Start a line with ## to make a section heading.</T>
        </View>
        <Field label="Steps — one per line" value={form.steps} onChangeText={set('steps')} multiline placeholder={'Preheat oven to 375°F.\nMix the dry ingredients.'} />
        <Field label="Notes" value={form.notes} onChangeText={set('notes')} multiline style={{ minHeight: 80 }} />
        <Field label="Tags (comma separated)" value={form.tags} onChangeText={set('tags')} placeholder="dessert, holiday" autoCapitalize="none" />
        <Field label="Source (person, book or site)" value={form.sourceName} onChangeText={set('sourceName')} placeholder="Grandma Jean" />
        <Field label="Source link" value={form.sourceUrl} onChangeText={set('sourceUrl')} placeholder="https://…" autoCapitalize="none" keyboardType="url" />
        <Button title="Tidy up with Claude" icon="sparkles-outline" variant="secondary" onPress={tidy} disabled={!form.ingredients.trim() && !form.steps.trim()} />
        <Button title={isNew ? 'Save recipe' : 'Save changes'} icon="checkmark" onPress={save} />
      </ScrollView>
      <BusyOverlay message={busy} />
    </KeyboardSafeView>
  );
}
