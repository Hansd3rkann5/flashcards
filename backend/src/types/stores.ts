export const KEY_FIELDS = {
  subjects: 'id',
  topics: 'id',
  cards: 'id',
  progress: 'cardId',
  settings: 'id',
  cardbank: 'id'
} as const;

export type StoreName = keyof typeof KEY_FIELDS;
export type StoreKeyField = (typeof KEY_FIELDS)[StoreName];

export function isStoreName(value: string): value is StoreName {
  return Object.hasOwn(KEY_FIELDS, value);
}

export function getStoreKeyField(store: StoreName): StoreKeyField {
  return KEY_FIELDS[store];
}
