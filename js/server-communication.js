// ServerCommunication (Client API Layer)
// ============================================================================
/**
 * @function registerOfflineServiceWorker
 * @description Registers the service worker that caches app shell + GET API responses for offline usage.
 */

async function registerOfflineServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!window.isSecureContext) return;
  try {
    const registration = await navigator.serviceWorker.register('sw.js');
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  } catch (err) {
    console.warn('Service worker registration failed:', err);
  }
}

/**
 * @function initSupabaseBackend
 * @description Initializes Supabase client for browser usage.
 */

async function initSupabaseBackend() {
  if (supabaseClient) return true;
  if (supabaseInitPromise) return supabaseInitPromise;
  supabaseInitPromise = (async () => {
    if (!window.supabase?.createClient) {
      const err = new Error('Supabase SDK not loaded.');
      err.isNetworkError = false;
      throw err;
    }
    const url = String(SUPABASE_URL || '').trim();
    const key = String(SUPABASE_ANON_KEY || '').trim();
    if (!url || !key) {
      const err = new Error('Missing Supabase configuration (SUPABASE_URL / SUPABASE_ANON_KEY).');
      err.isNetworkError = false;
      throw err;
    }
    supabaseClient = window.supabase.createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return true;
  })();
  try {
    return await supabaseInitPromise;
  } finally {
    supabaseInitPromise = null;
  }
}

/**
 * @function toNetworkError
 * @description Normalizes Supabase/network errors into app-level network errors.
 */

function toNetworkError(err, fallback = 'Network error: backend unreachable.') {
  const safeErr = err instanceof Error ? err : new Error(String(err || fallback));
  const code = String(safeErr?.code || '').toLowerCase();
  const message = String(safeErr?.message || '').toLowerCase();
  const looksLikeNetwork =
    code.includes('network')
    || code.includes('fetch')
    || code.includes('unavailable')
    || code.includes('timeout')
    || message.includes('network')
    || message.includes('offline')
    || message.includes('failed to fetch');
  if (looksLikeNetwork) {
    const wrapped = new Error(fallback);
    wrapped.isNetworkError = true;
    wrapped.cause = safeErr;
    return wrapped;
  }
  return safeErr;
}

/**
 * @function parseApiPath
 * @description Parses a /api path into route parts and query params.
 */

function parseApiPath(path = '') {
  const url = new URL(String(path || ''), window.location.origin);
  const segments = url.pathname.split('/').filter(Boolean);
  if (!segments.length || segments[0] !== 'api') return null;
  return {
    parts: segments.slice(1),
    searchParams: url.searchParams
  };
}

/**
 * @function parseApiBody
 * @description Safely parses JSON request bodies passed to apiRequest.
 */

function parseApiBody(raw = null) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }
  if (typeof raw === 'object') return raw;
  return null;
}

/**
 * @function getLoadingLabelForApiPath
 * @description Returns a human-readable loading label for a given API route.
 */

function getLoadingLabelForApiPath(path = '') {
  const route = getApiRouteFromPath(path);
  if (route === `${API_BASE}/subjects`) return 'Loading subjects...';
  if (route === `${API_BASE}/topics`) return 'Loading topics...';
  if (route === `${API_BASE}/cards`) return 'Loading cards...';
  if (route === `${API_BASE}/progress`) return 'Loading progress...';
  if (route === `${API_BASE}/stats`) return 'Loading overview...';
  if (route === `${API_BASE}/health`) return 'Connecting...';
  return 'Loading...';
}

/**
 * @function assertSupabaseSuccess
 * @description Throws a normalized error when a Supabase response contains an error object.
 */

function assertSupabaseSuccess(error, fallback = 'Backend request failed.') {
  if (!error) return;
  const err = new Error(String(error.message || fallback));
  err.code = String(error.code || '');
  err.details = error.details;
  err.hint = error.hint;
  throw err;
}

/**
 * @function isMissingColumnError
 * @description Returns true when Supabase reports an unknown/missing column.
 */

function isMissingColumnError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return code === '42703' || (message.includes('column') && (message.includes('does not exist') || message.includes('unknown')));
}

/**
 * @function resolveSupabaseTenantColumn
 * @description Detects which tenant column exists in `records` (`uid`, `UID`, or `owner_id`).
 */

async function resolveSupabaseTenantColumn() {
  if (supabaseTenantColumn) return supabaseTenantColumn;
  const candidates = ['uid', 'UID', 'owner_id'];
  for (const column of candidates) {
    const { error } = await supabaseClient
      .from(SUPABASE_TABLE)
      .select(column)
      .limit(1);
    if (!error) {
      supabaseTenantColumn = column;
      return supabaseTenantColumn;
    }
    if (!isMissingColumnError(error)) {
      assertSupabaseSuccess(error, 'Failed to inspect Supabase tenant column.');
    }
  }
  throw new Error('Missing tenant column in Supabase table `records`. Add `uid` (text) and retry.');
}

/**
 * @function withTenantScope
 * @description Applies user scoping to a Supabase query using the active tenant column.
 */

function withTenantScope(query, ownerId = '') {
  const safeOwnerId = String(ownerId || '').trim();
  if (!query || !safeOwnerId || !supabaseTenantColumn) return query;
  return query.eq(supabaseTenantColumn, safeOwnerId);
}

/**
 * @function withTenantValue
 * @description Adds the active tenant value to a row payload before insert/upsert.
 */

function withTenantValue(row = {}, ownerId = '') {
  const safeOwnerId = String(ownerId || '').trim();
  if (!safeOwnerId || !supabaseTenantColumn) return row;
  return {
    ...row,
    [supabaseTenantColumn]: safeOwnerId
  };
}

/**
 * @function getSupabaseOwnerId
 * @description Returns the authenticated Supabase user id used to isolate per-user data.
 */

async function getSupabaseOwnerId() {
  await resolveSupabaseTenantColumn();
  if (supabaseOwnerId) return supabaseOwnerId;
  const { data, error } = await supabaseClient.auth.getUser();
  assertSupabaseSuccess(error, 'Failed to load authenticated user.');
  const ownerId = String(data?.user?.id || '').trim();
  if (!ownerId) {
    const err = new Error('Authentication required.');
    err.status = 401;
    throw err;
  }
  supabaseOwnerId = ownerId;
  return ownerId;
}

/**
 * @function supabaseHealthcheck
 * @description Executes a lightweight query to confirm backend connectivity.
 */

async function supabaseHealthcheck() {
  if (!supabaseClient) throw new Error('Supabase client is not initialized.');
  const { error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select('store', { head: true, count: 'exact' })
    .limit(1);
  assertSupabaseSuccess(error, 'Supabase healthcheck failed.');
}

/**
 * @function listStoreRecordsSupabase
 * @description Reads all records for a store from the Supabase `records` table.
 */

async function listStoreRecordsSupabase(store = '', ownerId = '') {
  const safeStore = String(store || '').trim();
  const safeOwnerId = String(ownerId || '').trim();
  const keyField = getStoreKeyField(safeStore);
  if (!safeStore || !keyField || !safeOwnerId || !supabaseClient) return [];
  const { data, error } = await withTenantScope(supabaseClient
    .from(SUPABASE_TABLE)
    .select('record_key,payload,updated_at'), safeOwnerId)
    .eq('store', safeStore)
    .order('updated_at', { ascending: true });
  assertSupabaseSuccess(error, `Failed to list records for store "${safeStore}".`);
  const rows = Array.isArray(data) ? data : [];
  return rows.map(row => {
    const payload = (row?.payload && typeof row.payload === 'object') ? { ...row.payload } : {};
    if (!(keyField in payload) || payload[keyField] === undefined || payload[keyField] === null || payload[keyField] === '') {
      payload[keyField] = String(row?.record_key || '').trim();
    }
    return payload;
  });
}

/**
 * @function getStoreRecordSupabase
 * @description Reads one keyed record from Supabase.
 */

async function getStoreRecordSupabase(store = '', key = '', ownerId = '') {
  const safeStore = String(store || '').trim();
  const safeKey = String(key || '').trim();
  const safeOwnerId = String(ownerId || '').trim();
  const keyField = getStoreKeyField(safeStore);
  if (!safeStore || !safeKey || !safeOwnerId || !keyField || !supabaseClient) return null;
  const { data, error } = await withTenantScope(supabaseClient
    .from(SUPABASE_TABLE)
    .select('record_key,payload'), safeOwnerId)
    .eq('store', safeStore)
    .eq('record_key', safeKey)
    .maybeSingle();
  assertSupabaseSuccess(error, `Failed to read record "${safeStore}/${safeKey}".`);
  if (!data) return null;
  const payload = (data.payload && typeof data.payload === 'object') ? { ...data.payload } : {};
  if (!(keyField in payload) || payload[keyField] === undefined || payload[keyField] === null || payload[keyField] === '') {
    payload[keyField] = safeKey;
  }
  return payload;
}

/**
 * @function upsertStoreRecordSupabase
 * @description Inserts or updates one store record in Supabase.
 */

async function upsertStoreRecordSupabase(store = '', payload = null, ownerId = '') {
  const safeStore = String(store || '').trim();
  const safeOwnerId = String(ownerId || '').trim();
  const keyField = getStoreKeyField(safeStore);
  if (!safeStore || !safeOwnerId || !keyField || !supabaseClient) return null;
  const row = (payload && typeof payload === 'object') ? payload : null;
  const key = String(row?.[keyField] ?? '').trim();
  if (!row || !key) {
    const error = new Error(`Missing key "${keyField}" for store "${safeStore}"`);
    error.status = 400;
    throw error;
  }
  const writeRow = withTenantValue({
    store: safeStore,
    record_key: key,
    payload: row,
    updated_at: new Date().toISOString()
  }, safeOwnerId);
  let error = null;
  ({ error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .upsert(writeRow, { onConflict: `${supabaseTenantColumn},store,record_key` }));
  if (error && String(error.message || '').toLowerCase().includes('no unique or exclusion constraint')) {
    // Backward-compatible fallback for schemas that still use unique(store,record_key).
    ({ error } = await supabaseClient
      .from(SUPABASE_TABLE)
      .upsert(writeRow, { onConflict: 'store,record_key' }));
  }
  assertSupabaseSuccess(error, `Failed to upsert record "${safeStore}/${key}".`);
  return row;
}

/**
 * @function deleteStoreRecordSupabase
 * @description Deletes one store record in Supabase by key.
 */

async function deleteStoreRecordSupabase(store = '', key = '', ownerId = '') {
  const safeStore = String(store || '').trim();
  const safeKey = String(key || '').trim();
  const safeOwnerId = String(ownerId || '').trim();
  if (!safeStore || !safeKey || !safeOwnerId || !supabaseClient) return;
  const { error } = await withTenantScope(supabaseClient
    .from(SUPABASE_TABLE)
    .delete(), safeOwnerId)
    .eq('store', safeStore)
    .eq('record_key', safeKey);
  assertSupabaseSuccess(error, `Failed to delete record "${safeStore}/${safeKey}".`);
}

/**
 * @function parseApiFilterValues
 * @description Parses repeated query values (`?x=a&x=b`) into unique trimmed strings.
 */

function parseApiFilterValues(searchParams, key) {
  if (!searchParams || !key) return [];
  const values = searchParams.getAll(key)
    .map(value => String(value || '').trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

/**
 * @function sanitizeCardSearchInput
 * @description Sanitizes a search term for PostgREST `ilike` filter expressions.
 */

function sanitizeCardSearchInput(value = '') {
  return String(value || '')
    // Keep only letters/numbers/space to avoid PostgREST filter-parser edge cases.
    .replace(/[^0-9A-Za-zÀ-ÖØ-öø-ÿ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @function buildCardSearchOrFilter
 * @description Builds one PostgREST `or` filter expression for card question/answer lookup.
 */

function buildCardSearchOrFilter(searchValue = '') {
  const safe = sanitizeCardSearchInput(searchValue);
  if (!safe) return '';
  const pattern = `*${safe}*`;
  return [
    `payload->>prompt.ilike.${pattern}`,
    `payload->>question.ilike.${pattern}`,
    `payload->>answer.ilike.${pattern}`
  ].join(',');
}

/**
 * @function normalizeSearchComparableText
 * @description Normalizes text to lowercase accent-insensitive tokens for local fallback matching.
 */

function normalizeSearchComparableText(value = '') {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * @function cardPayloadMatchesSearch
 * @description Checks whether a card payload matches a search string (fallback path).
 */

function cardPayloadMatchesSearch(payload = null, searchValue = '') {
  const needle = normalizeSearchComparableText(searchValue);
  if (!needle) return false;
  const safePayload = (payload && typeof payload === 'object') ? payload : {};
  const optionText = Array.isArray(safePayload.options)
    ? safePayload.options.map(option => String(option?.text || '')).join('\n')
    : '';
  const haystack = normalizeSearchComparableText([
    safePayload.prompt,
    safePayload.question,
    safePayload.answer,
    optionText
  ].join('\n'));
  return haystack.includes(needle);
}

/**
 * @function normalizeStorePayloadRow
 * @description Normalizes one Supabase records row into plain payload shape with key fallback.
 */

function normalizeStorePayloadRow(row, keyField = 'id') {
  const payload = (row?.payload && typeof row.payload === 'object') ? { ...row.payload } : {};
  const keyValue = String(row?.record_key || '').trim();
  if (!(keyField in payload) || payload[keyField] === undefined || payload[keyField] === null || payload[keyField] === '') {
    payload[keyField] = keyValue;
  }
  return payload;
}

/**
 * @function queryStoreCountSupabase
 * @description Returns exact record count for one store without loading payload rows.
 */

async function queryStoreCountSupabase(store = '', ownerId = '') {
  const safeStore = String(store || '').trim();
  const safeOwnerId = String(ownerId || '').trim();
  if (!safeStore || !safeOwnerId || !supabaseClient) return 0;
  const { count, error } = await withTenantScope(supabaseClient
    .from(SUPABASE_TABLE)
    .select('record_key', { head: true, count: 'exact' }), safeOwnerId)
    .eq('store', safeStore);
  assertSupabaseSuccess(error, `Failed to count records for store "${safeStore}".`);
  return Number(count || 0);
}

/**
 * @function queryCardsSupabase
 * @description Reads cards and applies API-compatible query filters.
 */

async function queryCardsSupabase(searchParams, ownerId = '') {
  const safeOwnerId = String(ownerId || '').trim();
  if (!safeOwnerId) return [];
  const topicIds = parseApiFilterValues(searchParams, 'topicId');
  const cardIds = parseApiFilterValues(searchParams, 'cardId');
  const searchRaw = String(searchParams.get('search') || '').trim();
  const searchFilter = buildCardSearchOrFilter(searchRaw);
  const searchRequested = searchRaw.length > 0;
  const hasSearch = !!searchFilter;
  if (searchRequested && !hasSearch) return [];
  const fieldsRaw = String(searchParams.get('fields') || '').trim();
  const fields = fieldsRaw
    .split(',')
    .map(field => field.trim())
    .filter(Boolean);
  const lightweightFields = new Set(['id', 'topicId']);
  const useLightweightProjection = fields.length > 0 && fields.every(field => lightweightFields.has(field)) && !hasSearch;

  let query = withTenantScope(supabaseClient
    .from(SUPABASE_TABLE)
    .select(useLightweightProjection ? 'record_key,topic_id' : 'record_key,payload,topic_id'), safeOwnerId)
    .eq('store', 'cards');

  if (cardIds.length === 1) query = query.eq('record_key', cardIds[0]);
  else if (cardIds.length > 1) query = query.in('record_key', cardIds);

  // For plain topic/card lookups we use indexed `topic_id`.
  // For search lookups we filter by topic on mapped payload to stay robust if topic_id is not backfilled yet.
  if (!hasSearch) {
    if (topicIds.length === 1) query = query.eq('topic_id', topicIds[0]);
    else if (topicIds.length > 1) query = query.in('topic_id', topicIds);
  }

  const runOrderedQuery = async request => {
    const { data, error } = await request.order('updated_at', { ascending: true });
    assertSupabaseSuccess(error, 'Failed to query cards.');
    return Array.isArray(data) ? data : [];
  };

  let rows = [];
  if (hasSearch) {
    try {
      rows = await runOrderedQuery(query.or(searchFilter));
    } catch (searchErr) {
      // Some user inputs still trigger PostgREST/DB parser errors.
      // Fallback: fetch scoped rows and match locally to keep search usable.
      console.warn('Card search fallback: DB-side search failed, switching to local match.', searchErr);
      let fallbackQuery = withTenantScope(supabaseClient
        .from(SUPABASE_TABLE)
        .select('record_key,payload,topic_id'), safeOwnerId)
        .eq('store', 'cards');
      if (cardIds.length === 1) fallbackQuery = fallbackQuery.eq('record_key', cardIds[0]);
      else if (cardIds.length > 1) fallbackQuery = fallbackQuery.in('record_key', cardIds);
      const fallbackRows = await runOrderedQuery(fallbackQuery);
      rows = fallbackRows.filter(row => cardPayloadMatchesSearch(row?.payload, searchRaw));
    }
  } else {
    rows = await runOrderedQuery(query);
  }

  const scopedRows = (hasSearch && topicIds.length)
    ? rows.filter(row => {
      const payloadTopicId = String(row?.payload?.topicId || '').trim();
      const indexedTopicId = String(row?.topic_id || '').trim();
      return topicIds.includes(payloadTopicId || indexedTopicId);
    })
    : rows;

  if (useLightweightProjection) {
    return scopedRows.map(row => {
      const next = {};
      if (fields.includes('id')) next.id = String(row?.record_key || '').trim();
      if (fields.includes('topicId')) next.topicId = String(row?.topic_id || '').trim();
      return next;
    });
  }

  const cards = scopedRows.map(row => normalizeStorePayloadRow(row, 'id'));
  if (!fields.length) return cards;
  return cards.map(card => {
    const scoped = {};
    fields.forEach(field => {
      if (field in card) scoped[field] = card[field];
    });
    return scoped;
  });
}

/**
 * @function queryProgressSupabase
 * @description Reads progress records and applies API-compatible cardId filters.
 */

async function queryProgressSupabase(searchParams, ownerId = '') {
  const safeOwnerId = String(ownerId || '').trim();
  if (!safeOwnerId) return [];
  const cardIds = parseApiFilterValues(searchParams, 'cardId');
  let query = withTenantScope(supabaseClient
    .from(SUPABASE_TABLE)
    .select('record_key,payload'), safeOwnerId)
    .eq('store', 'progress');
  if (cardIds.length === 1) query = query.eq('record_key', cardIds[0]);
  else if (cardIds.length > 1) query = query.in('record_key', cardIds);
  const { data, error } = await query.order('updated_at', { ascending: true });
  assertSupabaseSuccess(error, 'Failed to query progress.');
  const rows = Array.isArray(data) ? data : [];
  return rows.map(row => normalizeStorePayloadRow(row, 'cardId'));
}

/**
 * @function queryTopicsSupabase
 * @description Reads topics and optionally augments with card counts.
 */

async function queryTopicsSupabase(searchParams, ownerId = '') {
  const safeOwnerId = String(ownerId || '').trim();
  if (!safeOwnerId) return [];
  const includeCounts = String(searchParams.get('includeCounts') || '') === '1';
  const subjectIds = parseApiFilterValues(searchParams, 'subjectId');
  const rows = await listStoreRecordsSupabase('topics', safeOwnerId);
  const topics = subjectIds.length
    ? rows.filter(topic => subjectIds.includes(String(topic?.subjectId || '').trim()))
    : rows;
  if (!includeCounts) return topics;

  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select('topic_id')
    .eq(supabaseTenantColumn, safeOwnerId)
    .eq('store', 'cards');
  assertSupabaseSuccess(error, 'Failed to load topic card counts.');
  const cards = Array.isArray(data) ? data : [];
  const counts = new Map();
  cards.forEach(card => {
    const topicId = String(card?.topic_id || '').trim();
    if (!topicId) return;
    counts.set(topicId, (counts.get(topicId) || 0) + 1);
  });
  return topics.map(topic => {
    const topicId = String(topic?.id || '').trim();
    return {
      ...topic,
      cardCount: counts.get(topicId) || 0
    };
  });
}

/**
 * @function queryStatsSupabase
 * @description Returns app stats from Supabase records.
 */

async function queryStatsSupabase(ownerId = '') {
  const safeOwnerId = String(ownerId || '').trim();
  if (!safeOwnerId) {
    return { subjects: 0, topics: 0, cards: 0 };
  }
  const [subjects, topics, cards] = await Promise.all([
    queryStoreCountSupabase('subjects', safeOwnerId),
    queryStoreCountSupabase('topics', safeOwnerId),
    queryStoreCountSupabase('cards', safeOwnerId)
  ]);
  return {
    subjects,
    topics,
    cards
  };
}

/**
* @function apiRequest
 * @description Executes a JSON API request with unified error handling and payload parsing.
 */

async function apiRequest(path, options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const uiBlocking = opts.uiBlocking === true && !appLoadingDebugPinned;
  const loadingLabel = String(opts.loadingLabel || '').trim() || getLoadingLabelForApiPath(path);
  let loadingTimer = null;
  let loadingShown = false;
  if (uiBlocking) {
    loadingTimer = setTimeout(() => {
      loadingShown = true;
      setAppLoadingState(true, loadingLabel);
    }, 140);
  }
  try {
    await initSupabaseBackend();
  } catch (err) {
    throw toNetworkError(err, 'Network error: Supabase unavailable.');
  }

  const parsed = parseApiPath(path);
  if (!parsed) {
    const error = new Error('Request failed (404)');
    error.status = 404;
    throw error;
  }

  const { parts, searchParams } = parsed;
  const method = String(options?.method || 'GET').toUpperCase();
  const needsOwnerScope = !(method === 'GET' && (!parts.length || parts[0] === 'health'));
  const ownerId = needsOwnerScope ? await getSupabaseOwnerId() : '';

  try {
    if (method === 'GET') {
      if (!parts.length || parts[0] === 'health') {
        await supabaseHealthcheck();
        return { ok: true };
      }
      if (parts.length === 1 && parts[0] === 'stats') {
        return await queryStatsSupabase(ownerId);
      }
      if (parts.length === 1) {
        const store = parts[0];
        if (!getStoreKeyField(store)) {
          const error = new Error('Request failed (404)');
          error.status = 404;
          throw error;
        }
        if (store === 'topics') return await queryTopicsSupabase(searchParams, ownerId);
        if (store === 'cards') return await queryCardsSupabase(searchParams, ownerId);
        if (store === 'progress') return await queryProgressSupabase(searchParams, ownerId);
        return await listStoreRecordsSupabase(store, ownerId);
      }
      if (parts.length === 2) {
        const [store, key] = parts;
        if (!getStoreKeyField(store)) {
          const error = new Error('Request failed (404)');
          error.status = 404;
          throw error;
        }
        const row = await getStoreRecordSupabase(store, key, ownerId);
        if (!row) {
          const error = new Error('Request failed (404)');
          error.status = 404;
          throw error;
        }
        return row;
      }
      const error = new Error('Request failed (404)');
      error.status = 404;
      throw error;
    }

    if (method === 'PUT') {
      if (parts.length !== 1) {
        const error = new Error('Request failed (404)');
        error.status = 404;
        throw error;
      }
      const store = parts[0];
      const keyField = getStoreKeyField(store);
      if (!keyField) {
        const error = new Error('Request failed (404)');
        error.status = 404;
        throw error;
      }
      const payload = parseApiBody(options?.body);
      const key = String(payload?.[keyField] ?? '').trim();
      if (!payload || !key) {
        const error = new Error(`Missing key "${keyField}" for store "${store}"`);
        error.status = 400;
        throw error;
      }
      return await upsertStoreRecordSupabase(store, payload, ownerId);
    }

    if (method === 'DELETE') {
      if (parts.length !== 2) {
        const error = new Error('Request failed (404)');
        error.status = 404;
        throw error;
      }
      const [store, keyRaw] = parts;
      if (!getStoreKeyField(store)) {
        const error = new Error('Request failed (404)');
        error.status = 404;
        throw error;
      }
      const key = String(keyRaw || '').trim();
      if (!key) return null;
      await deleteStoreRecordSupabase(store, key, ownerId);
      return null;
    }

    const error = new Error('Request failed (405)');
    error.status = 405;
    throw error;
  } catch (err) {
    throw toNetworkError(err, 'Network error: Supabase request failed.');
  } finally {
    if (loadingTimer) clearTimeout(loadingTimer);
    if (loadingShown) setAppLoadingState(false);
  }
}

// ============================================================================
