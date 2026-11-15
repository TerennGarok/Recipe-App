import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';

import { Radius, Spacing, useTheme } from '@/constants/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const t = useTheme();
  return <Ionicons name={name} size={size} color={color ?? t.text} />;
}

export function T({ style, kind = 'body', ...rest }: TextProps & { kind?: 'title' | 'heading' | 'body' | 'secondary' | 'small' }) {
  const t = useTheme();
  return <Text {...rest} style={[styles[kind], { color: kind === 'secondary' || kind === 'small' ? t.textSecondary : t.text }, style]} />;
}

export function Button({
  title,
  onPress,
  icon,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.primary : variant === 'danger' ? t.danger : variant === 'secondary' ? t.chip : 'transparent';
  const fg = variant === 'primary' ? t.primaryText : variant === 'danger' ? t.card : variant === 'ghost' ? t.primary : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ name, onPress, label, color }: { name: IconName; onPress: () => void; label: string; color?: string }) {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} hitSlop={10} style={({ pressed }) => ({ padding: 6, opacity: pressed ? 0.6 : 1 })}>
      <Icon name={name} color={color} />
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const t = useTheme();
  const base = [styles.card, { backgroundColor: t.card, borderColor: t.border }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }]}>
      {children}
    </Pressable>
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: Spacing.xs }}>
      {label ? <T kind="small">{label}</T> : null}
      <TextInput
        placeholderTextColor={t.textSecondary}
        {...props}
        style={[
          styles.input,
          { color: t.text, backgroundColor: t.card, borderColor: t.border },
          props.multiline && { minHeight: 120, textAlignVertical: 'top' },
          style,
        ]}
      />
    </View>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.chip, { backgroundColor: selected ? t.primary : t.chip }]}>
      {icon ? <Ionicons name={icon} size={14} color={selected ? t.primaryText : t.textSecondary} /> : null}
      <Text style={{ color: selected ? t.primaryText : t.text, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

/** Full-screen blocking spinner for multi-second Claude calls. */
export function BusyOverlay({ message }: { message: string | null }) {
  const t = useTheme();
  return (
    <Modal transparent visible={!!message} animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.overlayBox, { backgroundColor: t.card }]}>
          <ActivityIndicator size="large" color={t.primary} />
          <T style={{ textAlign: 'center' }}>{message}</T>
        </View>
      </View>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '700' },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 23 },
  secondary: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  card: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.lg },
  input: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.pill },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  overlayBox: { borderRadius: Radius.lg, padding: Spacing.xl, gap: Spacing.lg, alignItems: 'center', maxWidth: 320 },
});

/** Cross-platform single-line prompt (Alert.prompt is iOS-only). */
export function PromptModal({
  visible,
  title,
  message,
  placeholder,
  onSubmit,
  onCancel,
  keyboardType = 'url',
  submitLabel = 'Add',
  initialValue = '',
}: {
  visible: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  keyboardType?: TextInputProps['keyboardType'];
  submitLabel?: string;
  initialValue?: string;
}) {
  const t = useTheme();
  const [value, setValue] = useState('');
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel} onShow={() => setValue(initialValue)}>
      <View style={styles.overlay}>
        <View style={[styles.overlayBox, { backgroundColor: t.card, alignItems: 'stretch', width: '100%' }]}>
          <T kind="heading">{title}</T>
          {message ? <T kind="secondary">{message}</T> : null}
          <Field value={value} onChangeText={setValue} placeholder={placeholder} autoCapitalize="none" autoCorrect={false} keyboardType={keyboardType} autoFocus />
          <View style={{ flexDirection: 'row', gap: Spacing.sm, justifyContent: 'flex-end' }}>
            <Button title="Cancel" variant="ghost" onPress={onCancel} />
            <Button title={submitLabel} onPress={() => onSubmit(value.trim())} disabled={!value.trim()} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
