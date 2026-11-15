import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button, Field, T } from '@/components/ui';
import { Radius, Spacing, useTheme } from '@/constants/theme';

export type LineEdit = { kind: 'ingredient' | 'step'; id: string; text: string; label: string };

type Props = {
  edit: LineEdit | null;
  onSave: (edit: LineEdit, text: string) => void;
  onDelete: (edit: LineEdit) => void;
  onClose: () => void;
};

/** Small sheet for fixing one ingredient or step in place (opened by long-press). */
export function LineEditor({ edit, onSave, onDelete, onClose }: Props) {
  const t = useTheme();
  const [text, setText] = useState('');

  return (
    <Modal visible={!!edit} transparent animationType="fade" onRequestClose={onClose} onShow={() => setText(edit?.text ?? '')}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: t.card }]}>
          <T kind="heading">{edit?.label}</T>
          <Field value={text} onChangeText={setText} multiline autoFocus style={{ minHeight: edit?.kind === 'step' ? 120 : 70 }} />
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <Button
              title="Delete"
              variant="ghost"
              icon="trash-outline"
              onPress={() =>
                edit &&
                Alert.alert(`Delete this ${edit.kind}?`, undefined, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => onDelete(edit) },
                ])
              }
            />
            <View style={{ flex: 1 }} />
            <Button title="Cancel" variant="secondary" onPress={onClose} />
            <Button title="Save" onPress={() => edit && onSave(edit, text.trim())} disabled={!text.trim()} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { marginTop: 'auto', borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },
});
