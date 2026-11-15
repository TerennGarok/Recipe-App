/**
 * Verifies our hand-rolled protobuf messages against AnyList's schema, using the same
 * protobufjs 5 + pcov.proto definitions as the open-source `anylist` library (MIT,
 * fixture copied from anylist@0.8.6 lib/definitions.json).
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import { decodeShoppingLists, encodeAddItems, findOnList } from '../src/lib/anylist/protocol';
import { decodeFields, multipartBody } from '../src/lib/anylist/wire';

const require = createRequire(import.meta.url);
const protobuf = require('protobufjs');
const definitions = require('./fixtures/anylist-pcov.json');
const proto = protobuf.newBuilder({}).import(definitions).build('pcov.proto');

describe('AnyList protocol', () => {
  it('encodes add-item operations that the reference schema decodes', () => {
    const bytes = encodeAddItems('list-1', 'user-9', [
      { itemId: 'item-a', operationId: 'op-a', name: 'yellow onion', details: 'For: Chili', quantity: '2' },
      { itemId: 'item-b', operationId: 'op-b', name: 'cumin', details: null, quantity: null },
    ]);
    const decoded = proto.PBListOperationList.decode(Buffer.from(bytes));
    expect(decoded.operations).toHaveLength(2);
    const [a, b] = decoded.operations;
    expect(a.metadata.operationId).toBe('op-a');
    expect(a.metadata.handlerId).toBe('add-shopping-list-item');
    expect(a.metadata.userId).toBe('user-9');
    expect(a.listId).toBe('list-1');
    expect(a.listItemId).toBe('item-a');
    expect(a.listItem.identifier).toBe('item-a');
    expect(a.listItem.listId).toBe('list-1');
    expect(a.listItem.name).toBe('yellow onion');
    expect(a.listItem.details).toBe('For: Chili');
    expect(a.listItem.checked).toBe(false);
    expect(a.listItem.quantityPb.amount).toBe('2');
    expect(b.listItem.name).toBe('cumin');
    expect(b.listItem.details).toBeNull();
    expect(b.listItem.quantityPb).toBeNull();
  });

  it('matches the reference encoder byte-for-byte for the same fields', () => {
    const ours = encodeAddItems('L', null, [{ itemId: 'I', operationId: 'O', name: 'milk' }]);
    const op = new proto.PBListOperation();
    op.setMetadata({ operationId: 'O', handlerId: 'add-shopping-list-item' });
    op.setListId('L');
    op.setListItemId('I');
    op.setListItem(new proto.ListItem({ identifier: 'I', listId: 'L', name: 'milk', checked: false }));
    const list = new proto.PBListOperationList();
    list.setOperations([op]);
    expect(Buffer.from(ours).toString('hex')).toBe(list.toBuffer().toString('hex'));
  });

  it('decodes shopping lists from a user-data response', () => {
    const response = new proto.PBUserDataResponse({
      shoppingListsResponse: {
        newLists: [
          {
            identifier: 'l2',
            name: 'Costco',
            timestamp: 1731600000.5,
            logicalClockTime: 9007199254740993,
            items: [],
          },
          {
            identifier: 'l1',
            name: 'Groceries',
            items: [
              { identifier: 'i1', name: 'Eggs', checked: false, serverModTime: 123.25 },
              { identifier: 'i2', name: 'Butter', checked: true, details: 'salted' },
            ],
          },
        ],
        orderedIds: ['l1', 'l2'],
      },
      recipeDataResponse: { recipeDataId: 'x', recipes: [] },
    });
    const lists = decodeShoppingLists(new Uint8Array(response.toBuffer()));
    expect(lists.map((l) => l.name)).toEqual(['Groceries', 'Costco']);
    expect(lists[0].items).toEqual([
      { id: 'i1', name: 'Eggs', details: null, checked: false },
      { id: 'i2', name: 'Butter', details: 'salted', checked: true },
    ]);
    expect(findOnList(lists[0], 'egg')?.id).toBe('i1');
    expect(findOnList(lists[0], 'butter')).toBeUndefined(); // crossed off
  });

  it('builds a multipart body with a binary part', () => {
    const body = new TextDecoder().decode(multipartBody([{ name: 'email', value: 'a@b.c' }], 'XYZ'));
    expect(body).toBe('--XYZ\r\nContent-Disposition: form-data; name="email"\r\n\r\na@b.c\r\n--XYZ--\r\n');
    const bin = multipartBody([{ name: 'operations', value: new Uint8Array([0, 255]) }], 'B');
    expect(Array.from(bin.slice(-11, -9))).toEqual([0, 255]);
  });

  it('rejects truncated input instead of looping', () => {
    expect(() => decodeFields(new Uint8Array([0x0a, 0x05, 0x61]))).toThrow();
  });
});
