import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, IconButton, T } from '@/components/ui';
import { Radius, Spacing, useTheme } from '@/constants/theme';
import { formatClock, type Duration } from '@/lib/durations';
import { addTime, removeTimer, startTimer, useNow, useTimers } from '@/lib/timers';

/** Small "⏱ 25 min" chip shown next to a recipe step; tap to start (or see) that timer. */
export function StepTimerButton({
  duration,
  recipeId,
  recipeTitle,
  step,
}: {
  duration: Duration;
  recipeId: string;
  recipeTitle: string;
  step: number;
}) {
  const t = useTheme();
  const timers = useTimers();
  const running = timers.find((x) => x.recipeId === recipeId && x.step === step && x.label === duration.label);
  const now = useNow(!!running);
  const left = running ? (running.endsAt - now) / 1000 : 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={running ? `Timer ${duration.label}, ${running.done ? 'done' : `${formatClock(left)} left`}` : `Start ${duration.label} timer`}
      onPress={() => {
        if (!running) startTimer({ label: duration.label, seconds: duration.seconds, recipeId, recipeTitle, step });
      }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: running ? (running.done ? t.accent : t.primary) : t.chip, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Icon name={running?.done ? 'alarm' : 'timer-outline'} size={15} color={running ? t.primaryText : t.primary} />
      <T style={{ fontSize: 13, fontWeight: '600', color: running ? t.primaryText : t.primary, fontVariant: ['tabular-nums'] }}>
        {running ? (running.done ? 'Done' : formatClock(left)) : duration.label}
      </T>
    </Pressable>
  );
}

/** Floating list of all running timers, shown on every screen. */
export function TimerTray() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const timers = useTimers();
  const now = useNow(timers.length > 0);
  // The crop editor and share hand-off are full-screen; keep the tray out of the way there.
  if (!timers.length || pathname === '/expo-sharing') return null;

  const sorted = [...timers].sort((a, b) => Number(b.done) - Number(a.done) || a.endsAt - b.endsAt);
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]}>
      <View style={[styles.tray, { marginBottom: insets.bottom + 84, backgroundColor: t.card, borderColor: t.border }]}>
        {sorted.map((timer) => {
          const left = (timer.endsAt - now) / 1000;
          return (
            <View key={timer.id} style={styles.row}>
              <Pressable
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}
                onPress={() => timer.recipeId && router.push(`/recipe/${timer.recipeId}`)}
                accessibilityLabel={`${timer.label} timer for ${timer.recipeTitle ?? 'recipe'}`}>
                <Icon name={timer.done ? 'alarm' : 'timer-outline'} size={18} color={timer.done ? t.accent : t.primary} />
                <View style={{ flex: 1 }}>
                  <T numberOfLines={1} style={{ fontWeight: '600' }}>
                    {timer.done ? `${timer.label} — done!` : formatClock(left)}
                  </T>
                  <T kind="small" numberOfLines={1}>
                    {[timer.recipeTitle, timer.step ? `step ${timer.step}` : null, timer.done ? null : timer.label].filter(Boolean).join(' · ')}
                  </T>
                </View>
              </Pressable>
              <Pressable onPress={() => addTime(timer.id, 60)} hitSlop={6} style={[styles.small, { backgroundColor: t.chip }]} accessibilityLabel="Add one minute">
                <T style={{ fontSize: 13, fontWeight: '600', color: t.primary }}>+1 min</T>
              </Pressable>
              <IconButton name={timer.done ? 'checkmark-circle' : 'close-circle-outline'} label={timer.done ? 'Dismiss timer' : 'Cancel timer'} color={t.textSecondary} onPress={() => removeTimer(timer.id)} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill, marginTop: Spacing.xs },
  tray: {
    marginHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
  small: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill },
});
