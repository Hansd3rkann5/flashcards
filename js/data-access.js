// Client Data Access + Query Caching
// ============================================================================
/**
* @function openDB
 * @description Checks backend availability and marks the shared database connection as ready.
 */

async function openDB() {
  await loadPendingMutations();
  try {
    await apiRequest(`${API_BASE}/health`, { cache: 'no-store' });
    dbReady = true;
    setOfflineModeUi(false);
    await flushPendingMutations();
    await ensureSessionSizeModelLoadedFromServer({ uiBlocking: false, force: true });
    invalidateApiStoreCache();
    return true;
  } catch (err) {
    dbReady = false;
    setOfflineModeUi(true);
    if (!isNetworkError(err)) throw err;
    return false;
  }
}

/**
 * @function openCardBankDB
 * @description Marks the card bank API layer as available.
 */

function openCardBankDB() {
  return Promise.resolve(true);
}

/**
 * @function getStoreKeyField
 * @description Returns the store key field.
 */

function getStoreKeyField(store) {
  return STORE_KEYS[store];
}

/**
 * @function put
 * @description Handles put logic.
 */

async function put(store, value, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const skipFlushPending = !!opts.skipFlushPending;
  const invalidateScope = opts.invalidate === undefined ? store : opts.invalidate;
  const uiBlocking = opts.uiBlocking !== false;
  const loadingLabel = String(opts.loadingLabel || '').trim() || `Saving ${store}...`;
  const keyField = getStoreKeyField(store);
  if (!keyField) throw new Error(`Unknown store: ${store}`);
  const key = value?.[keyField];
  if (key === undefined || key === null || key === '') {
    throw new Error(`Missing key "${keyField}" for store "${store}"`);
  }
  try {
    await apiRequest(`${API_BASE}/${encodeURIComponent(store)}`, {
      method: 'PUT',
      body: JSON.stringify(value),
      uiBlocking,
      loadingLabel
    });
    dbReady = true;
    setOfflineModeUi(false);
    if (!skipFlushPending) await flushPendingMutations();
    if (invalidateScope !== false) {
      invalidateApiStoreCache(invalidateScope === true ? store : invalidateScope);
    }
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    dbReady = false;
    setOfflineModeUi(true);
    await queuePendingMutation('put', store, value);
    if (invalidateScope !== false) {
      invalidateApiStoreCache(invalidateScope === true ? store : invalidateScope);
    }
    await applyMutationToOfflineSnapshots(store, 'put', value);
  }
  return value;
}

/**
 * @function putCardBank
 * @description Handles put card bank logic.
 */

async function putCardBank(value, options = {}) {
  return put('cardbank', value, options);
}

/**
 * @function del
 * @description Handles del logic.
 */

async function del(store, key, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const skipFlushPending = !!opts.skipFlushPending;
  const invalidateScope = opts.invalidate === undefined ? store : opts.invalidate;
  const uiBlocking = opts.uiBlocking !== false;
  const loadingLabel = String(opts.loadingLabel || '').trim() || `Updating ${store}...`;
  const keyField = getStoreKeyField(store);
  if (!keyField) throw new Error(`Unknown store: ${store}`);
  const safeKey = String(key ?? '').trim();
  if (!safeKey) return;
  try {
    await apiRequest(`${API_BASE}/${encodeURIComponent(store)}/${encodeURIComponent(safeKey)}`, {
      method: 'DELETE',
      uiBlocking,
      loadingLabel
    });
    dbReady = true;
    setOfflineModeUi(false);
    if (!skipFlushPending) await flushPendingMutations();
    if (invalidateScope !== false) {
      invalidateApiStoreCache(invalidateScope === true ? store : invalidateScope);
    }
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    dbReady = false;
    setOfflineModeUi(true);
    await queuePendingMutation('delete', store, safeKey);
    if (invalidateScope !== false) {
      invalidateApiStoreCache(invalidateScope === true ? store : invalidateScope);
    }
    await applyMutationToOfflineSnapshots(store, 'delete', safeKey);
  }
}

/**
 * @function getAll
 * @description Returns the all.
 */

async function getAll(store, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const force = !!opts.force;
  const uiBlocking = opts.uiBlocking !== false;
  const loadingLabel = String(opts.loadingLabel || '').trim();
  const keyField = getStoreKeyField(store);
  if (!keyField) throw new Error(`Unknown store: ${store}`);
  const ttlMs = Number(API_STORE_CACHE_TTL_BY_STORE[store] ?? API_STORE_CACHE_DEFAULT_TTL_MS);
  const now = Date.now();
  const cached = apiStoreCache.get(store);
  if (!force && cached && now - cached.ts <= ttlMs) {
    return cloneData(cached.data);
  }

  if (!force && apiStoreInFlight.has(store)) {
    return cloneData(await apiStoreInFlight.get(store));
  }

  const requestPromise = (async () => {
    try {
      const data = await apiRequest(`${API_BASE}/${encodeURIComponent(store)}`, {
        uiBlocking,
        loadingLabel: loadingLabel || getLoadingLabelForApiPath(`${API_BASE}/${encodeURIComponent(store)}`)
      });
      const records = Array.isArray(data) ? data : [];
      apiStoreCache.set(store, { ts: Date.now(), data: records });
      await writeOfflineCache(getOfflineStoreCacheKey(store), records);
      dbReady = true;
      setOfflineModeUi(false);
      return records;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      const fallback = await readOfflineCache(getOfflineStoreCacheKey(store));
      if (Array.isArray(fallback)) {
        dbReady = false;
        setOfflineModeUi(true);
        apiStoreCache.set(store, { ts: Date.now(), data: fallback });
        return fallback;
      }
      dbReady = false;
      setOfflineModeUi(true);
      return [];
    }
  })();
  apiStoreInFlight.set(store, requestPromise);
  try {
    return cloneData(await requestPromise);
  } finally {
    apiStoreInFlight.delete(store);
  }
}

/**
 * @function getById
 * @description Returns one record by store key, or null if it does not exist.
 */

async function getById(store, key, options = {}) {
  const keyField = getStoreKeyField(store);
  if (!keyField) throw new Error(`Unknown store: ${store}`);
  const safeKey = String(key ?? '').trim();
  if (!safeKey) return null;
  const opts = options && typeof options === 'object' ? options : {};
  const path = `${API_BASE}/${encodeURIComponent(store)}/${encodeURIComponent(safeKey)}`;
  try {
    const data = await getCachedApiQuery(path, opts);
    return (data && typeof data === 'object') ? data : null;
  } catch (err) {
    if (/\(404\)/.test(String(err?.message || ''))) return null;
    throw err;
  }
}

/**
 * @function getApiRouteFromPath
 * @description Returns the API route from path.
 */

function getApiRouteFromPath(path = '') {
  const clean = String(path || '').split('?')[0];
  return clean || '/';
}

/**
 * @function getOfflineDefaultForRoute
 * @description Provides safe empty defaults for read-only API routes when no cached payload exists.
 */

function getOfflineDefaultForRoute(route = '') {
  const safeRoute = String(route || '');
  if (safeRoute === `${API_BASE}/health`) return undefined;
  if (safeRoute === `${API_BASE}/stats`) {
    return { subjects: 0, topics: 0, cards: 0 };
  }
  if (safeRoute.startsWith(`${API_BASE}/`)) {
    return [];
  }
  return undefined;
}

/**
 * @function getCachedApiQuery
 * @description Returns the cached API query.
 */

async function getCachedApiQuery(path, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const force = !!opts.force;
  const uiBlocking = opts.uiBlocking !== false;
  const loadingLabel = String(opts.loadingLabel || '').trim();
  const cacheKey = String(opts.cacheKey || path);
  const route = getApiRouteFromPath(path);
  const ttlMs = Number(opts.ttlMs ?? API_QUERY_CACHE_TTL_BY_ROUTE[route] ?? API_QUERY_CACHE_DEFAULT_TTL_MS);
  const now = Date.now();
  const cached = apiQueryCache.get(cacheKey);
  if (!force && cached && now - cached.ts <= ttlMs) {
    return cloneData(cached.data);
  }
  if (!force && apiQueryInFlight.has(cacheKey)) {
    return cloneData(await apiQueryInFlight.get(cacheKey));
  }
  const requestPromise = (async () => {
    try {
      const data = await apiRequest(path, {
        uiBlocking,
        loadingLabel: loadingLabel || getLoadingLabelForApiPath(path)
      });
      apiQueryCache.set(cacheKey, { ts: Date.now(), data });
      await writeOfflineCache(getOfflineQueryCacheKey(cacheKey), data);
      dbReady = true;
      setOfflineModeUi(false);
      return data;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      const fallback = await readOfflineCache(getOfflineQueryCacheKey(cacheKey));
      if (fallback !== null && fallback !== undefined) {
        dbReady = false;
        setOfflineModeUi(true);
        apiQueryCache.set(cacheKey, { ts: Date.now(), data: fallback });
        return fallback;
      }
      const offlineDefault = getOfflineDefaultForRoute(route);
      if (offlineDefault !== undefined) {
        dbReady = false;
        setOfflineModeUi(true);
        return cloneData(offlineDefault);
      }
      throw err;
    }
  })();
  apiQueryInFlight.set(cacheKey, requestPromise);
  try {
    return cloneData(await requestPromise);
  } finally {
    apiQueryInFlight.delete(cacheKey);
  }
}

/**
 * @function rebuildTopicDirectory
 * @description Handles rebuild topic directory logic.
 */

function rebuildTopicDirectory(topics = []) {
  topicDirectory = Array.isArray(topics) ? topics : [];
  const bySubject = new Map();
  const byId = new Map();
  topicDirectory.forEach(topic => {
    const topicId = String(topic?.id || '').trim();
    if (topicId) byId.set(topicId, topic);
    const subjectId = String(topic?.subjectId || '').trim();
    if (!subjectId) return;
    if (!bySubject.has(subjectId)) bySubject.set(subjectId, []);
    bySubject.get(subjectId).push(topic);
  });
  topicDirectoryBySubject = bySubject;
  topicDirectoryById = byId;
  topicDirectoryReady = true;
}

/**
 * @function rebuildSubjectDirectory
 * @description Rebuilds the in-memory subject lookup map for fast accent/name resolution.
 */

function rebuildSubjectDirectory(subjects = []) {
  const byId = new Map();
  const list = Array.isArray(subjects) ? subjects : [];
  list.forEach(subject => {
    const id = String(subject?.id || '').trim();
    if (!id) return;
    byId.set(id, {
      ...subject,
      accent: normalizeHexColor(subject?.accent || '#2dd4bf')
    });
  });
  subjectDirectoryById = byId;
}

/**
 * @function preloadTopicDirectory
 * @description Handles preload topic directory logic.
 */

async function preloadTopicDirectory(options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  if (topicDirectoryReady && !opts.force) return cloneData(topicDirectory);
  const data = await getCachedApiQuery(`${API_BASE}/topics?includeCounts=1`, opts);
  const topics = Array.isArray(data) ? data : [];
  rebuildTopicDirectory(topics);
  return cloneData(topicDirectory);
}

/**
 * @function getStats
 * @description Returns the stats.
 */

async function getStats(options = {}) {
  const data = await getCachedApiQuery(`${API_BASE}/stats`, options);
  const src = (data && typeof data === 'object') ? data : {};
  return {
    subjects: Number.isFinite(Number(src.subjects)) ? Number(src.subjects) : 0,
    topics: Number.isFinite(Number(src.topics)) ? Number(src.topics) : 0,
    cards: Number.isFinite(Number(src.cards)) ? Number(src.cards) : 0
  };
}

/**
 * @function getTopicsBySubject
 * @description Returns the topics by subject.
 */

async function getTopicsBySubject(subjectId, options = {}) {
  const id = String(subjectId || '').trim();
  if (!id) return [];
  const opts = options && typeof options === 'object' ? options : {};
  await preloadTopicDirectory({
    force: !!opts.force,
    uiBlocking: opts.uiBlocking,
    loadingLabel: opts.loadingLabel
  });
  const scoped = topicDirectoryBySubject.get(id) || [];
  return cloneData(scoped);
}

/**
 * @function getCardsByTopicIds
 * @description Loads all cards for the given topic IDs.
 */

async function getCardsByTopicIds(topicIds, options = {}) {
  const ids = Array.isArray(topicIds)
    ? Array.from(new Set(topicIds.map(topicId => String(topicId || '').trim()).filter(Boolean)))
    : [];
  if (!ids.length) return [];
  ids.sort();
  const opts = options && typeof options === 'object' ? options : {};
  const baseParams = new URLSearchParams();
  ids.forEach(topicId => baseParams.append('topicId', topicId));
  const baseQueryPath = `${API_BASE}/cards?${baseParams.toString()}`;
  const requestParams = new URLSearchParams(baseParams.toString());
  let payloadLabel = String(opts.payloadLabel || '').trim();
  if (!payloadLabel && ids.length === 1) {
    const topic = topicDirectoryById.get(ids[0]) || null;
    payloadLabel = topicTraceLabel(topic);
  }
  if (!payloadLabel && ids.length > 1) {
    payloadLabel = `topics-${ids.length}`;
  }
  if (payloadLabel) requestParams.set('payload', payloadLabel);
  const requestPath = `${API_BASE}/cards?${requestParams.toString()}`;
  const data = await getCachedApiQuery(requestPath, { ...opts, cacheKey: baseQueryPath });
  return Array.isArray(data) ? data : [];
}

/**
 * @function getCardRefsByTopicIds
 * @description Loads lightweight card references (id and topicId) for the given topic IDs.
 */

async function getCardRefsByTopicIds(topicIds, options = {}) {
  const ids = Array.isArray(topicIds)
    ? Array.from(new Set(topicIds.map(topicId => String(topicId || '').trim()).filter(Boolean)))
    : [];
  if (!ids.length) return [];

  ids.sort();
  const opts = options && typeof options === 'object' ? options : {};

  const baseParams = new URLSearchParams();
  ids.forEach(topicId => baseParams.append('topicId', topicId));
  baseParams.set('fields', 'id,topicId');
  const baseQueryPath = `${API_BASE}/cards?${baseParams.toString()}`;
  const requestParams = new URLSearchParams(baseParams.toString());
  let payloadLabel = String(opts.payloadLabel || '').trim();
  if (!payloadLabel && ids.length === 1) {
    const topic = topicDirectoryById.get(ids[0]) || null;
    payloadLabel = `${topicTraceLabel(topic)}-refs`;
  }
  if (!payloadLabel && ids.length > 1) {
    payloadLabel = `topics-${ids.length}-refs`;
  }
  if (payloadLabel) requestParams.set('payload', payloadLabel);
  const requestPath = `${API_BASE}/cards?${requestParams.toString()}`;
  const data = await getCachedApiQuery(requestPath, { ...opts, cacheKey: baseQueryPath });
  return Array.isArray(data) ? data : [];
}

/**
 * @function searchCardRefsByTopicIds
 * @description Runs one DB-side text search in question/answer fields and returns matching card refs.
 */

async function searchCardRefsByTopicIds(topicIds, searchQuery, options = {}) {
  const ids = Array.isArray(topicIds)
    ? Array.from(new Set(topicIds.map(topicId => String(topicId || '').trim()).filter(Boolean)))
    : [];
  const query = String(searchQuery || '').trim();
  if (!ids.length || !query) return [];

  ids.sort();
  const opts = options && typeof options === 'object' ? options : {};
  const baseParams = new URLSearchParams();
  ids.forEach(topicId => baseParams.append('topicId', topicId));
  baseParams.set('fields', 'id,topicId');
  baseParams.set('search', query);
  const baseQueryPath = `${API_BASE}/cards?${baseParams.toString()}`;
  const requestParams = new URLSearchParams(baseParams.toString());
  const payloadLabel = String(opts.payloadLabel || '').trim();
  if (payloadLabel) requestParams.set('payload', payloadLabel);
  const requestPath = `${API_BASE}/cards?${requestParams.toString()}`;
  const data = await getCachedApiQuery(requestPath, { ...opts, cacheKey: baseQueryPath });
  return Array.isArray(data) ? data : [];
}

/**
 * @function getCardsByCardIds
 * @description Loads full card payloads for the given card IDs.
 */

async function getCardsByCardIds(cardIds, options = {}) {
  const ids = Array.isArray(cardIds)
    ? Array.from(new Set(cardIds.map(cardId => String(cardId || '').trim()).filter(Boolean)))
    : [];
  if (!ids.length) return [];
  ids.sort();
  const opts = options && typeof options === 'object' ? options : {};
  const baseParams = new URLSearchParams();
  ids.forEach(cardId => baseParams.append('cardId', cardId));
  const baseQueryPath = `${API_BASE}/cards?${baseParams.toString()}`;
  const requestParams = new URLSearchParams(baseParams.toString());
  const payloadLabel = String(opts.payloadLabel || '').trim();
  if (payloadLabel) requestParams.set('payload', payloadLabel);
  const requestPath = `${API_BASE}/cards?${requestParams.toString()}`;
  const data = await getCachedApiQuery(requestPath, { ...opts, cacheKey: baseQueryPath });
  const rows = Array.isArray(data) ? data : [];
  const wantedIds = new Set(ids);
  return rows.filter(row => wantedIds.has(String(row?.id || '').trim()));
}

/**
 * @function getCardRefsByCardIds
 * @description Loads lightweight card references (id and topicId) for the given card IDs.
 */

async function getCardRefsByCardIds(cardIds, options = {}) {
  const ids = Array.isArray(cardIds)
    ? Array.from(new Set(cardIds.map(id => String(id || '').trim()).filter(Boolean)))
    : [];
  if (!ids.length) return [];

  ids.sort();
  const opts = options && typeof options === 'object' ? options : {};

  const baseParams = new URLSearchParams();
  ids.forEach(cardId => baseParams.append('cardId', cardId));
  baseParams.set('fields', 'id,topicId');
  const baseQueryPath = `${API_BASE}/cards?${baseParams.toString()}`;
  const requestParams = new URLSearchParams(baseParams.toString());
  const payloadLabel = String(opts.payloadLabel || '').trim();
  if (payloadLabel) requestParams.set('payload', payloadLabel);
  const requestPath = `${API_BASE}/cards?${requestParams.toString()}`;
  const data = await getCachedApiQuery(requestPath, { ...opts, cacheKey: baseQueryPath });

  return Array.isArray(data) ? data : [];
}

/**
 * @function buildTopicCardsCacheKey
 * @description Builds topic cards cache key.
 */

function buildTopicCardsCacheKey(topicId = '') {
  const id = String(topicId || '').trim();
  if (!id) return '';
  const params = new URLSearchParams();
  params.append('topicId', id);
  return `${API_BASE}/cards?${params.toString()}`;
}

/**
 * @function prefetchSessionTopicCardsInBackground
 * @description Prefetches full card payloads for selected topics without blocking session-size meta updates.
 */

function prefetchSessionTopicCardsInBackground(topicIds = [], subjectId = '') {
  const wantedSubjectId = String(subjectId || selectedSubject?.id || '').trim();
  if (!wantedSubjectId) return;
  const ids = Array.isArray(topicIds)
    ? Array.from(new Set(topicIds.map(topicId => String(topicId || '').trim()).filter(Boolean)))
    : [];
  if (!ids.length) return;

  ids.forEach(topicId => {
    if (!selectedSubject || String(selectedSubject.id || '').trim() !== wantedSubjectId) return;
    const cacheKey = buildTopicCardsCacheKey(topicId);
    if (cacheKey && apiQueryCache.has(cacheKey)) return;
    const topic = topicDirectoryById.get(topicId) || null;
    const payloadLabel = `${topicTraceLabel(topic)}-session-prefetch`;
    void getCardsByTopicIds([topicId], { payloadLabel, uiBlocking: false }).catch(() => {
      // Keep prefetch best-effort; session start can still fetch on demand.
    });
  });
}

/**
 * @function topicTraceLabel
 * @description Handles topic trace label logic.
 */

function topicTraceLabel(topic = null) {
  const raw = String(topic?.name || 'topic').trim();
  const slug = raw
    .replace(/\s+/g, '-')
    .replace(/[^0-9a-zA-Z\-_.]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `topic-${slug || 'unknown'}`;
}

/**
 * @function prefetchSubjectTopicCards
 * @description Handles prefetch subject topic cards logic.
 */

async function prefetchSubjectTopicCards(topics = [], subjectId = '') {
  const runId = ++topicPrefetchRunId;
  const wantedSubjectId = String(subjectId || '').trim();
  const topicList = Array.isArray(topics) ? topics : [];
  for (const topic of topicList) {
    if (runId !== topicPrefetchRunId) return;
    if (!selectedSubject || String(selectedSubject.id || '') !== wantedSubjectId) return;
    const topicId = String(topic?.id || '').trim();
    if (!topicId) continue;
    const cacheKey = buildTopicCardsCacheKey(topicId);
    if (cacheKey && apiQueryCache.has(cacheKey)) continue;
    try {
      await getCardsByTopicIds([topicId], { payloadLabel: topicTraceLabel(topic), uiBlocking: false });
    } catch (_) {
      // Keep prefetch best-effort to avoid blocking UI workflows.
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

// ============================================================================
