import { router } from 'expo-router';
import { useIncomingShare } from 'expo-sharing';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { T } from '@/components/ui';
import { Spacing, useTheme } from '@/constants/theme';
import { handleSharedPayloads } from '@/lib/incoming';

/**
 * When something is shared to RecipeBox while it's closed, the system opens the app at
 * recipebox://expo-sharing. This screen picks up the shared item, puts the recipe list
 * underneath, and hands off to the Add screen (or imports a recipe file).
 */
export default function SharedInto() {
  const t = useTheme();
  const { resolvedSharedPayloads, clearSharedPayloads, isResolving, error } = useIncomingShare();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || isResolving) return;
    done.current = true;
    const payloads = resolvedSharedPayloads;
    clearSharedPayloads();
    router.replace('/');
    if (payloads.length) handleSharedPayloads(payloads);
  }, [isResolving, resolvedSharedPayloads, clearSharedPayloads, error]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, backgroundColor: t.background }}>
      <ActivityIndicator color={t.primary} />
      <T kind="secondary">Opening shared item…</T>
    </View>
  );
}
