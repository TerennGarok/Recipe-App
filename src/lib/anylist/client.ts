/**
 * AnyList client (unofficial). AnyList has no public API; this mirrors the requests made by
 * AnyList's own web app, as documented by the open-source `anylist` Node library. It may stop
 * working if AnyList changes their backend.
 */
import { fetch } from 'expo/fetch';

import { newId } from '../id';
import { getAnyListSession, setAnyListSession, type AnyListSession } from '../settings';
import { decodeShoppingLists, encodeAddItems, type ShoppingList } from './protocol';
import { multipartBody } from './wire';

const BASE = 'https://www.anylist.com';

/** AnyList identifiers are UUIDs without dashes. */
const anyId = () => newId().replace(/-/g, '');

export class AnyListError extends Error {}

async function postForm(
  path: string,
  parts: { name: string; value: string | Uint8Array }[],
  session?: Pick<AnyListSession, 'clientId' | 'accessToken'>,
) {
  const boundary = `----RecipeBox${anyId()}`;
  const headers: Record<string, string> = {
    'X-AnyLeaf-API-Version': '3',
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
  };
  if (session) {
    headers['X-AnyLeaf-Client-Identifier'] = session.clientId;
    headers.Authorization = `Bearer ${session.accessToken}`;
  }
  return fetch(`${BASE}/${path}`, { method: 'POST', headers, body: multipartBody(parts, boundary) });
}

type TokenResponse = { access_token: string; refresh_token: string; user_id?: string };

export async function signIn(email: string, password: string): Promise<AnyListSession> {
  const res = await postForm('auth/token', [
    { name: 'email', value: email.trim() },
    { name: 'password', value: password },
  ]);
  if (res.status === 401 || res.status === 400) throw new AnyListError('AnyList rejected that email or password.');
  if (!res.ok) throw new AnyListError(`AnyList sign-in failed (HTTP ${res.status}).`);
  const t = (await res.json()) as TokenResponse;
  const session: AnyListSession = {
    email: email.trim(),
    password,
    clientId: (await getAnyListSession())?.clientId ?? anyId(),
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    userId: t.user_id ?? null,
  };
  await setAnyListSession(session);
  return session;
}

async function refresh(s: AnyListSession): Promise<AnyListSession> {
  const res = await postForm('auth/token/refresh', [{ name: 'refresh_token', value: s.refreshToken }]);
  if (res.status === 401) return signIn(s.email, s.password);
  if (!res.ok) throw new AnyListError(`Could not refresh AnyList sign-in (HTTP ${res.status}).`);
  const t = (await res.json()) as TokenResponse;
  const next = { ...s, accessToken: t.access_token, refreshToken: t.refresh_token, userId: t.user_id ?? s.userId };
  await setAnyListSession(next);
  return next;
}

/** POST an authenticated data request, refreshing the token once on 401. */
async function dataRequest(path: string, parts: { name: string; value: string | Uint8Array }[]) {
  let s = await getAnyListSession();
  if (!s) throw new AnyListError('Connect your AnyList account in Settings first.');
  let res = await postForm(path, parts, s);
  if (res.status === 401) {
    s = await refresh(s);
    res = await postForm(path, parts, s);
  }
  if (!res.ok) throw new AnyListError(`AnyList request failed (HTTP ${res.status}).`);
  return { res, session: s };
}

export async function getShoppingLists(): Promise<ShoppingList[]> {
  const { res } = await dataRequest('data/user-data/get', []);
  return decodeShoppingLists(new Uint8Array(await res.arrayBuffer()));
}

export type ShoppingItemInput = { name: string; quantity?: string | null; details?: string | null };

export async function addItemsToList(listId: string, items: ShoppingItemInput[]): Promise<void> {
  const s = await getAnyListSession();
  const ops = encodeAddItems(
    listId,
    s?.userId ?? null,
    items.map((i) => ({ ...i, itemId: anyId(), operationId: anyId() })),
  );
  await dataRequest('data/shopping-lists/update', [{ name: 'operations', value: ops }]);
}

export async function signOut(): Promise<void> {
  await setAnyListSession(null);
}
