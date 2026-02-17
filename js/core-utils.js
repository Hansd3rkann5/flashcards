// ============================================================================
// Core Utilities + Shared State
// ============================================================================
/**
* @function cloneData
 * @description Creates a deep copy to avoid accidental mutation of shared state.
 */

function cloneData(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

/**
 * @function isNetworkError
 * @description Returns true if the error indicates an unreachable backend/network path.
 */

function isNetworkError(err) {
  if (!err) return false;
  if (err.isNetworkError) return true;
  const message = String(err?.message || err || '').toLowerCase();
  return message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('network error')
    || message.includes('offline-no-cache')
    || message.includes('could not connect')
    || message.includes('the internet connection appears to be offline');
}

/**
 * @function getOfflineStoreCacheKey
 * @description Returns the persistent cache key for a full store snapshot.
 */

function getOfflineStoreCacheKey(store = '') {
  return `${OFFLINE_STORE_PREFIX}${String(store || '').trim()}`;
}

/**
 * @function getOfflineQueryCacheKey
 * @description Returns the persistent cache key for a query cache entry.
 */

function getOfflineQueryCacheKey(cacheKey = '') {
  return `${OFFLINE_QUERY_PREFIX}${String(cacheKey || '').trim()}`;
}

/**
 * @function openOfflineCacheDb
 * @description Opens the local IndexedDB used for offline snapshots and queued mutations.
 */

function openOfflineCacheDb() {
  if (offlineCacheDbPromise) return offlineCacheDbPromise;
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  offlineCacheDbPromise = new Promise(resolve => {
    const req = indexedDB.open(OFFLINE_CACHE_DB_NAME, OFFLINE_CACHE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OFFLINE_CACHE_STORE)) {
        db.createObjectStore(OFFLINE_CACHE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      console.warn('Offline cache DB unavailable:', req.error);
      resolve(null);
    };
  });
  return offlineCacheDbPromise;
}

/**
 * @function readOfflineCache
 * @description Reads a value from the persistent offline cache.
 */

async function readOfflineCache(key = '') {
  const cacheKey = String(key || '').trim();
  if (!cacheKey) return null;
  const db = await openOfflineCacheDb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(OFFLINE_CACHE_STORE, 'readonly');
      const store = tx.objectStore(OFFLINE_CACHE_STORE);
      const req = store.get(cacheKey);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
}

/**
 * @function writeOfflineCache
 * @description Writes a value into the persistent offline cache.
 */

async function writeOfflineCache(key = '', value = null) {
  const cacheKey = String(key || '').trim();
  if (!cacheKey) return;
  const db = await openOfflineCacheDb();
  if (!db) return;
  await new Promise(resolve => {
    try {
      const tx = db.transaction(OFFLINE_CACHE_STORE, 'readwrite');
      tx.objectStore(OFFLINE_CACHE_STORE).put(cloneData(value), cacheKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch (_) {
      resolve();
    }
  });
}

/**
 * @function removeOfflineCache
 * @description Removes a value from the persistent offline cache.
 */

async function removeOfflineCache(key = '') {
  const cacheKey = String(key || '').trim();
  if (!cacheKey) return;
  const db = await openOfflineCacheDb();
  if (!db) return;
  await new Promise(resolve => {
    try {
      const tx = db.transaction(OFFLINE_CACHE_STORE, 'readwrite');
      tx.objectStore(OFFLINE_CACHE_STORE).delete(cacheKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch (_) {
      resolve();
    }
  });
}

/**
 * @function loadPendingMutations
 * @description Loads pending offline write operations from local persistent cache.
 */

async function loadPendingMutations() {
  if (pendingMutationsLoaded) return cloneData(pendingMutations);
  const cached = await readOfflineCache(OFFLINE_MUTATION_QUEUE_KEY);
  pendingMutations = Array.isArray(cached) ? cached : [];
  pendingMutationsLoaded = true;
  return cloneData(pendingMutations);
}

/**
 * @function persistPendingMutations
 * @description Persists pending offline write operations.
 */

async function persistPendingMutations() {
  await writeOfflineCache(OFFLINE_MUTATION_QUEUE_KEY, pendingMutations);
}

/**
 * @function queuePendingMutation
 * @description Queues a write operation when backend is unreachable.
 */

async function queuePendingMutation(op = 'put', store = '', payload = null) {
  await loadPendingMutations();
  pendingMutations.push({
    op: op === 'delete' ? 'delete' : 'put',
    store: String(store || '').trim(),
    payload: cloneData(payload),
    queuedAt: new Date().toISOString()
  });
  await persistPendingMutations();
}

/**
 * @function applyMutationToRecordList
 * @description Applies a PUT/DELETE operation to an array of keyed records.
 */

function applyMutationToRecordList(records = [], store = '', op = 'put', payload = null) {
  const keyField = getStoreKeyField(store);
  if (!keyField) return Array.isArray(records) ? records : [];
  const current = Array.isArray(records) ? cloneData(records) : [];
  if (op === 'put') {
    const next = payload && typeof payload === 'object' ? cloneData(payload) : null;
    if (!next) return current;
    const key = String(next[keyField] ?? '').trim();
    if (!key) return current;
    const idx = current.findIndex(item => String(item?.[keyField] ?? '').trim() === key);
    if (idx >= 0) current[idx] = next;
    else current.push(next);
    return current;
  }
  const key = String(payload ?? '').trim();
  if (!key) return current;
  return current.filter(item => String(item?.[keyField] ?? '').trim() !== key);
}

/**
 * @function applyMutationToOfflineSnapshots
 * @description Updates in-memory and persistent snapshots so UI stays consistent in offline mode.
 */

async function applyMutationToOfflineSnapshots(store = '', op = 'put', payload = null) {
  const storeKey = getOfflineStoreCacheKey(store);
  const existing = await readOfflineCache(storeKey);
  if (Array.isArray(existing)) {
    const next = applyMutationToRecordList(existing, store, op, payload);
    await writeOfflineCache(storeKey, next);
    apiStoreCache.set(store, { ts: Date.now(), data: cloneData(next) });
  } else if (apiStoreCache.has(store)) {
    const cached = apiStoreCache.get(store)?.data;
    const next = applyMutationToRecordList(cached, store, op, payload);
    apiStoreCache.set(store, { ts: Date.now(), data: cloneData(next) });
    await writeOfflineCache(storeKey, next);
  } else {
    const seed = applyMutationToRecordList([], store, op, payload);
    await writeOfflineCache(storeKey, seed);
    apiStoreCache.set(store, { ts: Date.now(), data: cloneData(seed) });
  }
}

/**
 * @function flushPendingMutations
 * @description Replays queued offline writes once the backend is reachable again.
 */

async function flushPendingMutations() {
  if (mutationFlushPromise) return mutationFlushPromise;
  mutationFlushPromise = (async () => {
    const queue = await loadPendingMutations();
    if (!queue.length) return;
    const remaining = [];
    let hadFailures = false;
    for (let idx = 0; idx < queue.length; idx++) {
      const entry = queue[idx];
      const store = String(entry?.store || '').trim();
      if (!store) continue;
      try {
        if (entry.op === 'delete') {
          await apiRequest(`${API_BASE}/${encodeURIComponent(store)}/${encodeURIComponent(String(entry.payload ?? ''))}`, {
            method: 'DELETE'
          });
        } else {
          await apiRequest(`${API_BASE}/${encodeURIComponent(store)}`, {
            method: 'PUT',
            body: JSON.stringify(entry.payload)
          });
        }
      } catch (err) {
        if (isNetworkError(err)) {
          hadFailures = true;
          remaining.push(...queue.slice(idx));
          break;
        }
        console.warn('Skipping failed queued mutation:', err);
      }
    }
    pendingMutations = remaining;
    await persistPendingMutations();
    if (!hadFailures) invalidateApiStoreCache();
  })();
  try {
    await mutationFlushPromise;
  } finally {
    mutationFlushPromise = null;
  }
}

/**
 * @function setOfflineModeUi
 * @description Sets a body class and one-time console hint for offline mode.
 */

function setOfflineModeUi(active = false) {
  document.body.classList.toggle('offline-mode', !!active);
  if (active && !offlineModeBannerShown) {
    console.info('Offline mode active: using cached local data until backend is reachable.');
    offlineModeBannerShown = true;
  }
}

/**
 * @function invalidateApiStoreCache
 * @description Clears API/query caches and resets topic directory indexes after data changes.
 */

function invalidateApiStoreCache(store = null) {
  const scopedStore = String(store || '').trim();
  if (!scopedStore) {
    apiStoreCache.clear();
    apiStoreInFlight.clear();
    apiQueryCache.clear();
    apiQueryInFlight.clear();
    topicDirectory = [];
    topicDirectoryBySubject = new Map();
    topicDirectoryById = new Map();
    subjectDirectoryById = new Map();
    topicDirectoryReady = false;
    return;
  }

  apiStoreCache.delete(scopedStore);
  apiStoreInFlight.delete(scopedStore);

  const shouldDropQueryCache = cacheKey => {
    const route = getApiRouteFromPath(cacheKey);
    if (!route) return false;
    if (route === `${API_BASE}/${scopedStore}`) return true;
    if (route === `${API_BASE}/stats`) {
      return scopedStore === 'subjects' || scopedStore === 'topics' || scopedStore === 'cards';
    }
    if (route === `${API_BASE}/topics`) {
      return scopedStore === 'topics' || scopedStore === 'cards';
    }
    return false;
  };

  Array.from(apiQueryCache.keys()).forEach(cacheKey => {
    if (shouldDropQueryCache(cacheKey)) apiQueryCache.delete(cacheKey);
  });
  Array.from(apiQueryInFlight.keys()).forEach(cacheKey => {
    if (shouldDropQueryCache(cacheKey)) apiQueryInFlight.delete(cacheKey);
  });

  if (scopedStore === 'topics' || scopedStore === 'cards') {
    topicDirectory = [];
    topicDirectoryBySubject = new Map();
    topicDirectoryById = new Map();
    topicDirectoryReady = false;
  }
  if (scopedStore === 'subjects') {
    subjectDirectoryById = new Map();
  }
}

/**
 * @function setDeckTitle
 * @description Sets the deck title.
 */

function setDeckTitle(title = 'Deck') {
  const titleEl = el('deckTitle');
  if (!titleEl) return;
  const text = String(title || 'Deck').trim() || 'Deck';
  titleEl.textContent = text;
  titleEl.classList.toggle('is-long', text.length > 22);
  titleEl.classList.toggle('is-very-long', text.length > 36);
  titleEl.setAttribute('title', text);
}

/**
 * @function setDeckTopicCardCount
 * @description Sets the deck topic card count.
 */

function setDeckTopicCardCount(count = null) {
  const countEl = el('deckTopicCardCount');
  if (!countEl) return;
  if (!Number.isFinite(count)) {
    countEl.textContent = '';
    countEl.classList.add('hidden');
    return;
  }
  const safeCount = Math.max(0, Math.trunc(count));
  countEl.textContent = `${safeCount} ${safeCount === 1 ? 'card' : 'cards'}`;
  countEl.classList.remove('hidden');
}

/**
 * @function bumpDeckTopicCardCount
 * @description Adjusts the rendered topic card count badge by delta without reloading the full deck.
 */

function bumpDeckTopicCardCount(delta = 0) {
  const countEl = el('deckTopicCardCount');
  if (!countEl || countEl.classList.contains('hidden')) return;
  const match = String(countEl.textContent || '').match(/^(\d+)/);
  if (!match) return;
  const current = Number(match[1]);
  if (!Number.isFinite(current)) return;
  const next = Math.max(0, current + Math.trunc(Number(delta) || 0));
  setDeckTopicCardCount(next);
}

// ============================================================================
