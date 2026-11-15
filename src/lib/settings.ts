import * as SecureStore from 'expo-secure-store';
import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Secrets live in the iOS Keychain / Android Keystore via expo-secure-store,
 * never in the recipe database or in shared files.
 */
const KEYS = {
  anthropicKey: 'anthropic_api_key',
  anylist: 'anylist_session',
  lastListId: 'anylist_last_list',
} as const;

let version = 0;
const listeners = new Set<() => void>();
function notify() {
  version++;
  listeners.forEach((l) => l());
}
function useSettingsVersion() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
}

export async function getAnthropicKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.anthropicKey);
}

export async function setAnthropicKey(key: string | null): Promise<void> {
  if (key) await SecureStore.setItemAsync(KEYS.anthropicKey, key.trim());
  else await SecureStore.deleteItemAsync(KEYS.anthropicKey);
  notify();
}

export function useHasAnthropicKey(): boolean | null {
  const v = useSettingsVersion();
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    getAnthropicKey().then((k) => setHas(!!k));
  }, [v]);
  return has;
}

export type AnyListSession = {
  email: string;
  /** Kept so the app can sign in again if AnyList revokes the refresh token. */
  password: string;
  clientId: string;
  accessToken: string;
  refreshToken: string;
  userId: string | null;
};

// Stored as three entries: Android's secure store can reject values over ~2 KB, and tokens are long.
export async function getAnyListSession(): Promise<AnyListSession | null> {
  const [raw, accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(KEYS.anylist),
    SecureStore.getItemAsync(`${KEYS.anylist}_access`),
    SecureStore.getItemAsync(`${KEYS.anylist}_refresh`),
  ]);
  if (!raw || !accessToken || !refreshToken) return null;
  return { ...(JSON.parse(raw) as Omit<AnyListSession, 'accessToken' | 'refreshToken'>), accessToken, refreshToken };
}

export async function setAnyListSession(s: AnyListSession | null): Promise<void> {
  if (s) {
    const { accessToken, refreshToken, ...rest } = s;
    await SecureStore.setItemAsync(KEYS.anylist, JSON.stringify(rest));
    await SecureStore.setItemAsync(`${KEYS.anylist}_access`, accessToken);
    await SecureStore.setItemAsync(`${KEYS.anylist}_refresh`, refreshToken);
  } else {
    await SecureStore.deleteItemAsync(KEYS.anylist);
    await SecureStore.deleteItemAsync(`${KEYS.anylist}_access`);
    await SecureStore.deleteItemAsync(`${KEYS.anylist}_refresh`);
  }
  notify();
}

export function useAnyListSession(): AnyListSession | null | undefined {
  const v = useSettingsVersion();
  const [s, setS] = useState<AnyListSession | null | undefined>(undefined);
  useEffect(() => {
    getAnyListSession().then(setS);
  }, [v]);
  return s;
}

export async function getLastListId(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.lastListId);
}

export async function setLastListId(id: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.lastListId, id);
}
