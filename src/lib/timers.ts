/**
 * Kitchen timers. Several can run at once; they're saved so they survive the app being closed.
 *
 * - When a timer is started, an alarm notification is scheduled for its end time, so it goes
 *   off even if the app is in the background or closed.
 * - While the app is in the background, each running timer also shows a pinned notification
 *   ("Bake — done at 6:42 PM"). It's cleared when the app comes back.
 */
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Platform, Vibration } from 'react-native';

import { getDb } from './db';
import { newId } from './id';

export type Timer = {
  id: string;
  label: string;
  recipeId: string | null;
  recipeTitle: string | null;
  step: number | null;
  durationSec: number;
  endsAt: number;
  done: boolean;
};

const ALARM_CHANNEL = 'timers';
const RUNNING_CHANNEL = 'timers-running';
const alarmId = (t: Timer) => `timer-${t.id}`;
const runningId = (t: Timer) => `timer-running-${t.id}`;

let timers: Timer[] = [];
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version++;
  listeners.forEach((l) => l());
  getDb()
    .runAsync('INSERT OR REPLACE INTO app_kv (key, value) VALUES (?, ?)', ['timers', JSON.stringify(timers)])
    .catch(() => {});
}

export function useTimers(): Timer[] {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return timers;
}

/** Re-renders every `ms` while `active`, for countdown displays. */
export function useNow(active: boolean, ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const h = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(h);
  }, [active, ms]);
  return now;
}

function timeOfDay(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function describe(t: Timer): string {
  return [t.recipeTitle, t.step ? `step ${t.step}` : null].filter(Boolean).join(' · ');
}

// ---------- notifications ----------

let permission: Promise<boolean> | null = null;
function ensurePermission(): Promise<boolean> {
  permission ??= (async () => {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  })().catch(() => false);
  return permission;
}

async function scheduleAlarm(t: Timer) {
  if (!(await ensurePermission())) return;
  await Notifications.scheduleNotificationAsync({
    identifier: alarmId(t),
    content: {
      title: `⏰ ${t.label} — time's up`,
      body: describe(t) || 'Timer finished',
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
      interruptionLevel: 'timeSensitive',
      data: { recipeId: t.recipeId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: t.endsAt,
      channelId: ALARM_CHANNEL,
      delivery: 'alarmClock',
    },
  });
}

async function clearNotifications(t: Timer) {
  await Promise.all([
    Notifications.cancelScheduledNotificationAsync(alarmId(t)).catch(() => {}),
    Notifications.dismissNotificationAsync(alarmId(t)).catch(() => {}),
    Notifications.dismissNotificationAsync(runningId(t)).catch(() => {}),
  ]);
}

async function showRunning() {
  for (const t of timers.filter((x) => !x.done && x.endsAt > Date.now())) {
    await Notifications.scheduleNotificationAsync({
      identifier: runningId(t),
      content: {
        title: `⏱ ${t.label} — done at ${timeOfDay(t.endsAt)}`,
        body: describe(t) || 'Timer running',
        sticky: true,
        autoDismiss: false,
        sound: false,
        interruptionLevel: 'passive',
        data: { recipeId: t.recipeId },
      },
      trigger: Platform.OS === 'android' ? { channelId: RUNNING_CHANNEL } : null,
    }).catch(() => {});
  }
}

async function hideRunning() {
  await Promise.all(timers.map((t) => Notifications.dismissNotificationAsync(runningId(t)).catch(() => {})));
}

// ---------- public API ----------

export async function startTimer(input: { label: string; seconds: number; recipeId?: string | null; recipeTitle?: string | null; step?: number | null }) {
  const t: Timer = {
    id: newId(),
    label: input.label,
    recipeId: input.recipeId ?? null,
    recipeTitle: input.recipeTitle ?? null,
    step: input.step ?? null,
    durationSec: input.seconds,
    endsAt: Date.now() + input.seconds * 1000,
    done: false,
  };
  timers = [...timers, t];
  emit();
  await scheduleAlarm(t).catch(() => {});
}

export async function addTime(id: string, seconds: number) {
  const t = timers.find((x) => x.id === id);
  if (!t) return;
  await clearNotifications(t);
  const base = t.done ? Date.now() : t.endsAt;
  const next = { ...t, endsAt: base + seconds * 1000, done: false };
  timers = timers.map((x) => (x.id === id ? next : x));
  emit();
  await scheduleAlarm(next).catch(() => {});
}

export async function removeTimer(id: string) {
  const t = timers.find((x) => x.id === id);
  timers = timers.filter((x) => x.id !== id);
  emit();
  if (t) await clearNotifications(t);
}

function checkFinished() {
  const now = Date.now();
  const finished = timers.filter((t) => !t.done && t.endsAt <= now);
  if (!finished.length) return;
  timers = timers.map((t) => (finished.includes(t) ? { ...t, done: true } : t));
  emit();
  if (AppState.currentState === 'active') Vibration.vibrate([0, 500, 300, 500, 300, 500]);
}

let started = false;
/** Call once at app start. */
export async function initTimers() {
  if (started) return;
  started = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    /* eslint-disable import/namespace -- these enums are re-exported by expo-notifications; the lint resolver misses them */
    await Notifications.setNotificationChannelAsync(ALARM_CHANNEL, {
      name: 'Timer alarms',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 500, 300, 500],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }).catch(() => {});
    await Notifications.setNotificationChannelAsync(RUNNING_CHANNEL, {
      name: 'Running timers',
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }).catch(() => {});
    /* eslint-enable import/namespace */
  }

  // Tapping a timer notification opens its recipe.
  Notifications.addNotificationResponseReceivedListener((response) => {
    const recipeId = response.notification.request.content.data?.recipeId;
    if (typeof recipeId === 'string') router.push(`/recipe/${recipeId}`);
  });

  try {
    const row = await getDb().getFirstAsync<{ value: string }>('SELECT value FROM app_kv WHERE key = ?', ['timers']);
    if (row) timers = JSON.parse(row.value) as Timer[];
  } catch {}
  checkFinished();
  emit();

  setInterval(checkFinished, 1000);
  AppState.addEventListener('change', (state) => {
    if (state === 'background') showRunning();
    else if (state === 'active') {
      hideRunning();
      checkFinished();
    }
  });
}

/** Android 12+: exact alarms need a permission the user grants in system settings. */
export async function exactAlarmsAllowed(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  return (await Notifications.getExactAlarmPermissionsAsync()).granted;
}

export async function requestExactAlarms(): Promise<boolean> {
  return (await Notifications.requestExactAlarmPermissionsAsync()).granted;
}
