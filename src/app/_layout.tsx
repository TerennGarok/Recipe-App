import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import { useIncomingShare } from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Alert, useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { describeImport, importShareFile } from '@/lib/share';
import { findUrl } from '@/lib/webpage';

/** Handles things shared *into* the app from the share sheet: links, text, photos, recipe files. */
function IncomingShareHandler() {
  const { resolvedSharedPayloads, clearSharedPayloads, isResolving } = useIncomingShare();

  useEffect(() => {
    if (isResolving || resolvedSharedPayloads.length === 0) return;
    const payloads = resolvedSharedPayloads;
    clearSharedPayloads();

    const recipeFile = payloads.find(
      (p) => p.contentUri && (p.originalName?.endsWith('.json') || p.contentMimeType === 'application/json' || p.contentUri.endsWith('.json')),
    );
    if (recipeFile?.contentUri) {
      importShareFile(recipeFile.contentUri)
        .then((s) => Alert.alert('Recipes imported', describeImport(s)))
        .catch((e: Error) => Alert.alert('Could not import', e.message));
      return;
    }
    const images = payloads.filter((p) => p.contentType === 'image' && p.contentUri).map((p) => p.contentUri!);
    if (images.length) {
      router.push({ pathname: '/add', params: { images: JSON.stringify(images) } });
      return;
    }
    const text = payloads.map((p) => (p.contentType === 'website' ? p.contentUri ?? p.value : p.value)).join('\n').trim();
    const url = findUrl(text);
    if (url && text.length < url.length + 200) router.push({ pathname: '/add', params: { url } });
    else if (text) router.push({ pathname: '/add', params: { text } });
  }, [resolvedSharedPayloads, isResolving, clearSharedPayloads]);

  return null;
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const palette = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, primary: palette.primary, background: palette.background, card: palette.background, text: palette.text, border: palette.border },
  };
  return (
    <ThemeProvider value={theme}>
      <StatusBar style="auto" />
      <IncomingShareHandler />
      <Stack screenOptions={{ headerShadowVisible: false, headerTintColor: palette.primary, headerTitleStyle: { color: palette.text } }}>
        <Stack.Screen name="index" options={{ title: 'RecipeBox', headerLargeTitle: true }} />
        <Stack.Screen name="add" options={{ title: 'Add a recipe', presentation: 'modal' }} />
        <Stack.Screen name="discover" options={{ title: 'Find recipes online' }} />
        <Stack.Screen name="recipe/[id]" options={{ title: '' }} />
        <Stack.Screen name="edit/[id]" options={{ title: 'Edit recipe', presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </ThemeProvider>
  );
}
