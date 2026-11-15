/**
 * AnyList message shapes (pure, no network). Field numbers from pcov.proto:
 *
 * PBUserDataResponse { 1: ShoppingListsResponse shoppingListsResponse }
 * ShoppingListsResponse { 1: repeated ShoppingList newLists; 5: repeated string orderedIds }
 * ShoppingList { 1: identifier; 3: name; 4: repeated ListItem items }
 * ListItem { 1: identifier; 3: listId; 4: name; 5: details; 6: bool checked; 12: userId; 21: PBItemQuantity quantityPb }
 * PBItemQuantity { 1: amount }
 * PBOperationMetadata { 1: operationId; 2: handlerId; 3: userId }
 * PBListOperation { 1: metadata; 2: listId; 3: listItemId; 6: ListItem listItem }
 * PBListOperationList { 1: repeated PBListOperation operations }
 */
import { decodeFields, encodeMessage, pb, type PbMessage } from './wire';

export type ShoppingListItem = { id: string; name: string; details: string | null; checked: boolean };
export type ShoppingList = { id: string; name: string; items: ShoppingListItem[] };

export function decodeShoppingLists(userData: Uint8Array): ShoppingList[] {
  const root = decodeFields(userData);
  const resp = pb.message(root, 1);
  if (!resp) return [];
  const lists = pb.messages(resp, 1).map((l) => ({
    id: pb.string(l, 1) ?? '',
    name: pb.string(l, 3) ?? 'Untitled list',
    items: pb.messages(l, 4).map((it) => ({
      id: pb.string(it, 1) ?? '',
      name: pb.string(it, 4) ?? '',
      details: pb.string(it, 5),
      checked: pb.bool(it, 6),
    })),
  }));
  const order = pb.strings(resp, 5);
  if (order.length) {
    const rank = new Map(order.map((id, i) => [id, i]));
    lists.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
  }
  return lists;
}

export type NewItem = { itemId: string; operationId: string; name: string; details?: string | null; quantity?: string | null };

export function encodeAddItems(listId: string, userId: string | null, items: NewItem[]): Uint8Array<ArrayBuffer> {
  const ops: PbMessage = items.map((it) => {
    const listItem: PbMessage = [
      [1, it.itemId],
      [3, listId],
      [4, it.name],
      [5, it.details || undefined],
      [6, false],
      [12, userId ?? undefined],
      [21, it.quantity ? [[1, it.quantity]] : undefined],
    ];
    const op: PbMessage = [
      [1, [[1, it.operationId], [2, 'add-shopping-list-item'], [3, userId ?? undefined]]],
      [2, listId],
      [3, it.itemId],
      [6, listItem],
    ];
    return [1, op] as [number, PbMessage];
  });
  return encodeMessage(ops);
}

/** Case/plural-insensitive check for "is this already on the list (and not crossed off)?" */
export function findOnList(list: ShoppingList, name: string): ShoppingListItem | undefined {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\b(\w+?)(es|s)\b/g, '$1')
      .trim();
  const target = norm(name);
  return list.items.find((i) => !i.checked && norm(i.name) === target);
}
