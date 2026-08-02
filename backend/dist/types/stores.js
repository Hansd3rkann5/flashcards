export const KEY_FIELDS = {
    subjects: 'id',
    topics: 'id',
    cards: 'id',
    progress: 'cardId',
    settings: 'id',
    cardbank: 'id'
};
export function isStoreName(value) {
    return Object.hasOwn(KEY_FIELDS, value);
}
export function getStoreKeyField(store) {
    return KEY_FIELDS[store];
}
