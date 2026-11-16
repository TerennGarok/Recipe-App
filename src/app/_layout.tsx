import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname } from 'expo-router';
import { useIncomingShare } from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { TimerTray } from '@/components/timers';
import { handleSharedPayloads } from '@/lib/incoming';
import { initBatch } from '@/lib/batch';
import { initTimers } from '@/lib/timers';

/**
 * Handles items shared while the app is already open. (When the app is closed, the system
 * opens it at /expo-sharing instead, and that screen does the same job.)
 */
function IncomingShareHandler() {
  const pathname = usePathname();
  const { resolvedSharedPayloads, clearSharedPayloads, isResolving } = useIncomingShare();

  useEffect(() => {
    if (pathname === '/expo-sharing' || isResolving || resolvedSharedPayloads.length === 0) return;
    const payloads = resolvedSharedPayloads;
    clearSharedPayloads();
    handleSharedPayloads(payloads);
  }, [pathname, resolvedSharedPayloads, isResolving, clearSharedPayloads]);

  return null;
}

export default function RootLayout() {
  const scheme = useColorScheme();
  useEffect(() => {
    initTimers();
    initBatch();
  }, []);
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
        <Stack.Screen name="planner" options={{ title: 'Meal plan' }} />
        <Stack.Screen name="ideas" options={{ title: 'Meal ideas' }} />
        <Stack.Screen name="batch" options={{ title: 'Batch import' }} />
        <Stack.Screen name="expo-sharing" options={{ headerShown: false, animation: 'none' }} />
      </Stack>
      <TimerTray />
    </ThemeProvider>
  );
}
