import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, T } from '@/components/ui';
import { Radius, Spacing, useTheme } from '@/constants/theme';
import { addItemsToList, getShoppingLists, type ShoppingItemInput } from '@/lib/anylist/client';
import { findOnList, type ShoppingList } from '@/lib/anylist/protocol';
import { getLastListId, setLastListId, useAnyListSession } from '@/lib/settings';

// Lists rarely change while cooking; cache briefly so repeated taps open instantly.
let cache: { at: number; lists: ShoppingList[] } | null = null;
export function invalidateListCache() {
  cache = null;
}

type Props = {
  items: ShoppingItemInput[] | null;
  onClose: () => void;
  onAdded?: (listName: string) => void;
};

/** Bottom sheet asking "which AnyList list?" for one or more ingredients. */
export function ListPickerSheet({ items, onClose, onAdded }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const session = useAnyListSession();
  const [lists, setLists] = useState<ShoppingList[] | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const visible = !!items && items.length > 0;

  const load = useCallback((force: boolean) => {
    setError(null);
    if (!force && cache && Date.now() - cache.at < 60_000) {
      setLists(cache.lists);
      return;
    }
    setLists(null);
    getShoppingLists()
      .then((l) => {
        cache = { at: Date.now(), lists: l };
        setLists(l);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // Reset and (re)load each time the sheet opens.
  const onShow = () => {
    setDone(null);
    getLastListId().then(setLastId);
    load(false);
  };

  const ordered = lists ? [...lists].sort((a, b) => (a.id === lastId ? -1 : b.id === lastId ? 1 : 0)) : null;

  async function pick(list: ShoppingList) {
    if (!items) return;
    setBusyId(list.id);
    setError(null);
    try {
      await addItemsToList(list.id, items);
      await setLastListId(list.id);
      invalidateListCache();
      setDone(list.name);
      onAdded?.(list.name);
      setTimeout(onClose, 900);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const title = items?.length === 1 ? `Add "${items[0].name}" to…` : `Add ${items?.length ?? 0} items to…`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={onShow}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: t.card, paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={[styles.grabber, { backgroundColor: t.border }]} />
        <T kind="heading">{title}</T>
        {items && items.length > 1 ? (
          <T kind="small" numberOfLines={2}>
            {items.map((i) => i.name).join(', ')}
          </T>
        ) : null}

        {session === null ? (
          <View style={{ gap: Spacing.md, paddingVertical: Spacing.md }}>
            <T kind="secondary">Connect your AnyList account to send ingredients to your shopping lists.</T>
            <Button
              title="Connect AnyList"
              icon="link"
              onPress={() => {
                onClose();
                router.push('/settings');
              }}
            />
          </View>
        ) : done ? (
          <View style={styles.center}>
            <Icon name="checkmark-circle" size={40} color={t.accent} />
            <T>Added to {done}</T>
          </View>
        ) : error ? (
          <View style={{ gap: Spacing.md, paddingVertical: Spacing.md }}>
            <T style={{ color: t.danger }}>{error}</T>
            <Button title="Try again" variant="secondary" onPress={() => load(true)} />
          </View>
        ) : !ordered ? (
          <View style={styles.center}>
            <ActivityIndicator color={t.primary} />
          </View>
        ) : ordered.length === 0 ? (
          <T kind="secondary">No lists found in your AnyList account.</T>
        ) : (
          <ScrollView style={{ maxHeight: 360 }}>
            {ordered.map((list) => {
              const already = items?.length === 1 ? findOnList(list, items[0].name) : undefined;
              return (
                <Pressable
                  key={list.id}
                  onPress={() => pick(list)}
                  disabled={!!busyId}
                  style={({ pressed }) => [styles.row, { borderColor: t.border, opacity: pressed ? 0.7 : 1 }]}>
                  <Icon name="list" color={t.primary} />
                  <View style={{ flex: 1 }}>
                    <T>{list.name}</T>
                    <T kind="small">
                      {already ? 'Already on this list' : `${list.items.filter((i) => !i.checked).length} items`}
                      {list.id === lastId ? ' · last used' : ''}
                    </T>
                  </View>
                  {busyId === list.id ? <ActivityIndicator color={t.primary} /> : <Icon name="add-circle-outline" color={t.textSecondary} />}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        <Button title="Cancel" variant="ghost" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  center: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl },
});
