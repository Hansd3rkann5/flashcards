/**
 * Flashcards application client logic.
 * Navigation tip: search for `@function <name>` to jump directly to a function.
 */
const API_BASE = '/api';
const SUPABASE_URL = String(window.__SUPABASE_URL__ || '').trim();
const SUPABASE_ANON_KEY = String(window.__SUPABASE_ANON_KEY__ || '').trim();
const SUPABASE_TABLE = 'records';
const STORE_KEYS = {
  subjects: 'id',
  topics: 'id',
  cards: 'id',
  progress: 'cardId',
  cardbank: 'id'
};
let dbReady = false;
let selectedSubject = null;
let selectedTopic = null;
let selectedTopicIds = new Set();
let sessionSize = 15;
let availableSessionCards = 0;
let session = { active: false, activeQueue: [], mastered: [], counts: {}, gradeMap: {}, mode: 'default' };
const SESSION_IMAGE_PRELOAD_CACHE_MAX = 256;
const sessionImagePreloadCache = new Map();
let editingCardId = null;
let editingCardSnapshot = null;
let editingSubjectId = null;
let sessionStartInFlight = false;
let mcqMode = false;
let editMcqMode = false;
let createQuestionTextAlign = 'center';
let createAnswerTextAlign = 'center';
let editQuestionTextAlign = 'center';
let editAnswerTextAlign = 'center';
let createOptionsTextAlign = 'center';
let editOptionsTextAlign = 'center';
let formulaTarget = null;
let tableTarget = null;
let tableEditRange = null;
let tableBuilderState = {
  rows: 3,
  cols: 3,
  withHeader: true,
  header: [],
  body: [],
  headerAlign: [],
  bodyAlign: [],
  mergeRegions: []
};
let tableBuilderSelection = null;
let tableBuilderHasUserSelection = false;
let suppressTableBuilderFocusSelection = false;
let suppressTableBuilderProgrammaticFocusSelection = false;
const INLINE_TEXT_COLOR_SWATCHES = Object.freeze([
  { name: 'Red', value: '#ff6b6b' },
  { name: 'Orange', value: '#f59e0b' },
  { name: 'Yellow', value: '#facc15' },
  { name: 'Green', value: '#4ade80' },
  { name: 'Cyan', value: '#22d3ee' },
  { name: 'Blue', value: '#60a5fa' },
  { name: 'Violet', value: '#a78bfa' },
  { name: 'Pink', value: '#f472b6' }
]);
const INLINE_TEXT_COLOR_TOOLBAR_TARGETS = Object.freeze({
  'create-question': 'cardPrompt',
  'create-answer': 'cardAnswer',
  'edit-question': 'editCardPrompt',
  'edit-answer': 'editCardAnswer'
});
let inlineColorMenuListenersWired = false;
let suppressFlashcardTapUntil = 0;
let deckSelectionMode = false;
let deckSelectedCardIds = new Set();
let topicSelectionMode = false;
let topicSelectedIds = new Set();
const SESSION_FILTER_DEFAULT = Object.freeze({
  all: false,
  correct: false,
  wrong: false,
  partial: false,
  notAnswered: false,
  notAnsweredYet: false
});
const SUBJECT_SESSION_FILTER_DEFAULT = Object.freeze({
  ...SESSION_FILTER_DEFAULT,
  notAnsweredYet: true
});
let sessionFilterState = { ...SUBJECT_SESSION_FILTER_DEFAULT };
let progressByCardId = new Map();
let lastProgressForceRefreshAt = 0;
let sessionRunState = {
  startedAt: 0,
  topicIds: [],
  cardIds: [],
  filters: { ...SESSION_FILTER_DEFAULT },
  mode: 'default'
};
let sessionRepeatState = {
  remaining: 0,
  size: 0,
  topicIds: [],
  cardIds: [],
  filters: { ...SESSION_FILTER_DEFAULT },
  mode: 'default'
};
let sessionCompleteConfettiEmitter = null;
const DAILY_REVIEW_DEFAULT_SIZE = 15;
const DAILY_REVIEW_STATUS_FILTER_DEFAULT = Object.freeze({
  green: true,
  yellow: false,
  red: false
});
let dailyReviewState = {
  ready: false,
  hasReviewCards: false,
  yesterdayKey: '',
  cardsByTopicId: new Map(),
  topics: [],
  expandedSubjectKeys: new Set(),
  selectedTopicIds: new Set(),
  statusByCardId: new Map(),
  dateByCardId: new Map(),
  dateKeys: [],
  selectedDateStart: 0,
  selectedDateEnd: 0,
  statusFilter: { ...DAILY_REVIEW_STATUS_FILTER_DEFAULT },
  todayStats: {
    answeredCards: 0,
    masteredCards: 0,
    attempts: 0,
    correct: 0,
    partial: 0,
    wrong: 0
  },
  totalCards: 0,
  size: 0
};
const PROGRESS_CHECK_COLUMN_KEYS = Object.freeze([
  'subject',
  'topic',
  'question',
  'current',
  'streak',
  'lastGrade',
  'lastAnsweredAt',
  'totals',
  'history'
]);
const PROGRESS_CHECK_COLUMN_LABELS = Object.freeze({
  subject: 'Subject',
  topic: 'Topic',
  question: 'Question',
  current: 'Current',
  streak: 'Streak',
  lastGrade: 'Last Grade',
  lastAnsweredAt: 'Last Answered',
  totals: 'Totals (C/P/W)',
  history: 'History'
});
let progressCheckRowsCache = [];
let progressCheckFilterState = {
  sortColumn: 'subject',
  sortDirection: 'asc',
  selectedValuesByColumn: {}
};
let progressCheckAllValuesByColumn = {};
let progressCheckHeaderMenuState = {
  column: '',
  search: '',
  trigger: null
};
const KATEX_CSS_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css';
const KATEX_JS_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.js';
const KATEX_AUTORENDER_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/contrib/auto-render.min.js';
const KATEX_RENDER_OPTIONS = Object.freeze({
  delimiters: [
    { left: '$$', right: '$$', display: true },
    { left: '$', right: '$', display: false },
    { left: '\\(', right: '\\)', display: false },
    { left: '\\[', right: '\\]', display: true }
  ],
  throwOnError: false
});
let katexLoading = null;
const scriptLoadCache = new Map();
const API_STORE_CACHE_DEFAULT_TTL_MS = 5000;
const API_STORE_CACHE_TTL_BY_STORE = Object.freeze({
  subjects: 15000,
  topics: 15000,
  cards: 30000,
  progress: 4000,
  cardbank: 30000
});
const API_QUERY_CACHE_DEFAULT_TTL_MS = 5000;
const API_QUERY_CACHE_TTL_BY_ROUTE = Object.freeze({
  '/api/stats': 10000,
  '/api/topics': 60000,
  // Topic card payloads should stay cached until app data changes.
  '/api/cards': 86400000,
  '/api/progress': 4000
});
const apiStoreCache = new Map();
const apiStoreInFlight = new Map();
const apiQueryCache = new Map();
const apiQueryInFlight = new Map();
const OFFLINE_CACHE_DB_NAME = 'flashcards-offline-cache';
const OFFLINE_CACHE_DB_VERSION = 1;
const OFFLINE_CACHE_STORE = 'kv';
const OFFLINE_STORE_PREFIX = 'store:';
const OFFLINE_QUERY_PREFIX = 'query:';
const OFFLINE_MUTATION_QUEUE_KEY = 'queue:mutations';
let offlineCacheDbPromise = null;
let pendingMutations = [];
let pendingMutationsLoaded = false;
let mutationFlushPromise = null;
let offlineModeBannerShown = false;
let topicDirectory = [];
let topicDirectoryBySubject = new Map();
let topicDirectoryById = new Map();
let subjectDirectoryById = new Map();
let topicDirectoryReady = false;
let topicPrefetchRunId = 0;
let sessionMetaRefreshRunId = 0;
let sessionMetaLoadingCount = 0;
let supabaseInitPromise = null;
let supabaseClient = null;
const progressPersistInFlightByCardId = new Map();
let appLoadingOverlayCount = 0;
let appLoadingDebugPinned = false;
let reviewTraceRunCounter = 0;

const el = id => document.getElementById(id);

/**
 * @function setAppLoadingState
 * @description Toggles the global loading overlay with reference counting so overlapping async flows do not flicker.
 */

function setAppLoadingState(active = false, label = 'Loading...') {
  const overlay = el('appLoadingOverlay');
  if (!overlay) return;
  const nextLabel = String(label || '').trim();
  const labelEl = el('appLoadingLabel');
  if (active) {
    appLoadingOverlayCount += 1;
    if (labelEl && nextLabel) labelEl.textContent = nextLabel;
    overlay.classList.add('is-visible');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('app-loading');
    return;
  }
  appLoadingOverlayCount = Math.max(0, appLoadingOverlayCount - 1);
  if (appLoadingOverlayCount > 0) return;
  overlay.classList.remove('is-visible');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('app-loading');
}

/**
 * @function openDebugLoadingOverlay
 * @description Shows the loader overlay in pinned debug mode until manually dismissed.
 */

function openDebugLoadingOverlay() {
  if (appLoadingDebugPinned) return;
  appLoadingDebugPinned = true;
  setAppLoadingState(true, 'Loader debug (Esc to close)');
}

/**
 * @function closeDebugLoadingOverlay
 * @description Closes the pinned loader debug overlay.
 */

function closeDebugLoadingOverlay() {
  if (!appLoadingDebugPinned) return;
  appLoadingDebugPinned = false;
  setAppLoadingState(false);
}

/**
 * @function logReviewTrace
 * @description Logs structured timing output for daily review loading/debug.
 */

function logReviewTrace(runId, step, startedAtMs, extra = {}) {
  const durationMs = Math.max(0, performance.now() - startedAtMs);
  const payload = {
    run: runId,
    step,
    ms: Number(durationMs.toFixed(1)),
    ...extra
  };
  console.log('[REVIEW-TRACE]', payload);
}

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
// ReviewPanel + Progress Logic
// ============================================================================
/**
* @function normalizeSessionFilters
 * @description Normalizes session filters.
 */

function normalizeSessionFilters(state = null) {
  const raw = (state && typeof state === 'object') ? state : SESSION_FILTER_DEFAULT;
  const normalized = {
    all: !!raw.all,
    correct: !!raw.correct,
    wrong: !!raw.wrong,
    partial: !!raw.partial,
    notAnswered: !!raw.notAnswered,
    notAnsweredYet: !!raw.notAnsweredYet
  };
  if (normalized.all) {
    normalized.correct = false;
    normalized.wrong = false;
    normalized.partial = false;
    normalized.notAnswered = false;
    normalized.notAnsweredYet = false;
  }
  return normalized;
}

/**
 * @function getTodayKey
 * @description Returns the today key.
 */

function getTodayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * @function getDayKeyByOffset
 * @description Returns a YYYY-MM-DD key shifted by the given day offset.
 */

function getDayKeyByOffset(offsetDays = 0, date = new Date()) {
  const base = new Date(date);
  base.setDate(base.getDate() + Math.trunc(Number(offsetDays) || 0));
  return getTodayKey(base);
}

/**
 * @function createEmptyDailyReviewTodayStats
 * @description Builds an empty "today achievement" stats object for the review home panel.
 */

function createEmptyDailyReviewTodayStats() {
  return {
    answeredCards: 0,
    masteredCards: 0,
    attempts: 0,
    correct: 0,
    partial: 0,
    wrong: 0
  };
}

/**
 * @function resetDailyReviewState
 * @description Resets daily review state.
 */

function resetDailyReviewState() {
  dailyReviewState = {
    ready: false,
    hasReviewCards: false,
    yesterdayKey: getDayKeyByOffset(-1),
    cardsByTopicId: new Map(),
    topics: [],
    expandedSubjectKeys: new Set(),
    selectedTopicIds: new Set(),
    statusByCardId: new Map(),
    dateByCardId: new Map(),
    dateKeys: [],
    selectedDateStart: 0,
    selectedDateEnd: 0,
    statusFilter: { ...DAILY_REVIEW_STATUS_FILTER_DEFAULT },
    todayStats: createEmptyDailyReviewTodayStats(),
    totalCards: 0,
    size: 0
  };
}

/**
 * @function normalizeDayProgress
 * @description Normalizes day progress.
 */

function normalizeDayProgress(raw = null) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const dayLastGrade = typeof src.lastGrade === 'string' ? src.lastGrade : '';
  const correctStreakRaw = Number(src.correctStreak);
  const correctStreak = Number.isFinite(correctStreakRaw) ? Math.max(0, Math.trunc(correctStreakRaw)) : 0;
  const legacyMastered = Number(src.correct) >= 3 && dayLastGrade === 'correct';
  const explicitMastered = src.mastered === true && dayLastGrade === 'correct';
  const derivedStreak = correctStreak > 0
    ? correctStreak
    : legacyMastered
      ? 3
      : dayLastGrade === 'correct'
        ? 1
        : 0;
  return {
    correct: Number.isFinite(Number(src.correct)) ? Number(src.correct) : 0,
    wrong: Number.isFinite(Number(src.wrong)) ? Number(src.wrong) : 0,
    partial: Number.isFinite(Number(src.partial)) ? Number(src.partial) : 0,
    correctStreak: derivedStreak,
    mastered: explicitMastered || derivedStreak >= 3 || legacyMastered,
    lastGrade: dayLastGrade,
    lastAnsweredAt: typeof src.lastAnsweredAt === 'string' ? src.lastAnsweredAt : ''
  };
}

/**
 * @function normalizeProgressRecord
 * @description Normalizes progress record.
 */

function normalizeProgressRecord(record, cardId) {
  const src = (record && typeof record === 'object') ? record : {};
  const byDay = {};
  if (src.byDay && typeof src.byDay === 'object') {
    Object.keys(src.byDay).forEach(dayKey => {
      byDay[dayKey] = normalizeDayProgress(src.byDay[dayKey]);
    });
  }
  const totalsSrc = (src.totals && typeof src.totals === 'object') ? src.totals : {};
  const persistedTotals = {
    correct: Number.isFinite(Number(totalsSrc.correct)) ? Number(totalsSrc.correct) : 0,
    wrong: Number.isFinite(Number(totalsSrc.wrong)) ? Number(totalsSrc.wrong) : 0,
    partial: Number.isFinite(Number(totalsSrc.partial)) ? Number(totalsSrc.partial) : 0
  };
  const derivedTotals = { correct: 0, wrong: 0, partial: 0 };
  Object.values(byDay).forEach(rawDay => {
    const day = normalizeDayProgress(rawDay);
    derivedTotals.correct += toCounterInt(day.correct);
    derivedTotals.wrong += toCounterInt(day.wrong);
    derivedTotals.partial += toCounterInt(day.partial);
  });
  return {
    cardId,
    byDay,
    totals: {
      // Keep legacy totals if present, but never lower than what byDay proves.
      correct: Math.max(persistedTotals.correct, derivedTotals.correct),
      wrong: Math.max(persistedTotals.wrong, derivedTotals.wrong),
      partial: Math.max(persistedTotals.partial, derivedTotals.partial)
    },
    lastGrade: typeof src.lastGrade === 'string' ? src.lastGrade : '',
    lastAnsweredAt: typeof src.lastAnsweredAt === 'string' ? src.lastAnsweredAt : ''
  };
}

/**
 * @function getProgressByCardIds
 * @description Returns the progress by card IDs.
 */

async function getProgressByCardIds(cardIds, options = {}) {
  const ids = Array.isArray(cardIds)
    ? Array.from(new Set(cardIds.map(cardId => String(cardId || '').trim()).filter(Boolean)))
    : [];
  if (!ids.length) return [];
  ids.sort();
  const opts = options && typeof options === 'object' ? options : {};
  const baseParams = new URLSearchParams();
  ids.forEach(cardId => baseParams.append('cardId', cardId));
  const baseQueryPath = `${API_BASE}/progress?${baseParams.toString()}`;
  const requestParams = new URLSearchParams(baseParams.toString());
  const payloadLabel = String(opts.payloadLabel || '').trim();
  if (payloadLabel) requestParams.set('payload', payloadLabel);
  const requestPath = `${API_BASE}/progress?${requestParams.toString()}`;
  const data = await getCachedApiQuery(requestPath, { ...opts, cacheKey: baseQueryPath });
  const rows = Array.isArray(data) ? data : [];
  const wantedIds = new Set(ids);
  return rows.filter(row => wantedIds.has(String(row?.cardId || '').trim()));
}

/**
 * @function ensureProgressForCardIds
 * @description Ensures progress for card IDs.
 */

async function ensureProgressForCardIds(cardIds, options = {}) {
  const ids = Array.isArray(cardIds)
    ? Array.from(new Set(cardIds.map(cardId => String(cardId || '').trim()).filter(Boolean)))
    : [];
  if (!ids.length) return;
  const opts = options && typeof options === 'object' ? options : {};
  const force = !!opts.force;
  const toLoad = force ? ids : ids.filter(cardId => !progressByCardId.has(cardId));
  if (!toLoad.length) return;
  const records = await getProgressByCardIds(toLoad, opts);
  const loaded = new Set();
  records.forEach(record => {
    const key = String(record?.cardId || '').trim();
    if (!key) return;
    progressByCardId.set(key, normalizeProgressRecord(record, key));
    loaded.add(key);
  });
  toLoad.forEach(cardId => {
    if (loaded.has(cardId)) return;
    progressByCardId.set(cardId, normalizeProgressRecord(null, cardId));
  });
}

/**
 * @function getCardDayProgress
 * @description Returns the card day progress.
 */

function getCardDayProgress(cardId, dayKey = getTodayKey()) {
  const record = progressByCardId.get(cardId);
  return normalizeDayProgress(record?.byDay?.[dayKey]);
}

/**
 * @function queueProgressRecordPersist
 * @description Persists one progress record in the background and serializes writes per card to avoid out-of-order updates.
 */

function queueProgressRecordPersist(record = null) {
  const payload = (record && typeof record === 'object') ? cloneData(record) : null;
  const cardId = String(payload?.cardId || '').trim();
  if (!cardId) return Promise.resolve();
  const previous = progressPersistInFlightByCardId.get(cardId) || Promise.resolve();
  const next = previous
    .catch(() => { })
    .then(async () => {
      try {
        await put('progress', payload, {
          skipFlushPending: true,
          invalidate: 'progress',
          uiBlocking: false
        });
      } catch (err) {
        console.warn('Failed to persist progress update:', err);
      }
    });
  progressPersistInFlightByCardId.set(cardId, next);
  next.finally(() => {
    if (progressPersistInFlightByCardId.get(cardId) === next) {
      progressPersistInFlightByCardId.delete(cardId);
    }
  });
  return next;
}

/**
 * @function recordCardProgress
 * @description Handles record card progress logic.
 */

async function recordCardProgress(cardId, grade, options = {}) {
  if (!cardId) return;
  if (!['correct', 'wrong', 'partial'].includes(grade)) return;
  const opts = options && typeof options === 'object' ? options : {};
  const masteryTargetRaw = Number(opts.masteryTarget);
  const masteryTarget = Number.isFinite(masteryTargetRaw)
    ? Math.max(1, Math.trunc(masteryTargetRaw))
    : 3;
  await ensureProgressForCardIds([cardId], {
    payloadLabel: 'progress-update',
    uiBlocking: false
  });
  const nowIso = new Date().toISOString();
  const todayKey = getTodayKey();
  const record = normalizeProgressRecord(progressByCardId.get(cardId), cardId);
  const day = normalizeDayProgress(record.byDay[todayKey]);
  day[grade] += 1;
  if (grade === 'correct') {
    day.correctStreak += 1;
    day.mastered = day.correctStreak >= masteryTarget;
  } else {
    day.correctStreak = 0;
    day.mastered = false;
  }
  day.lastGrade = grade;
  day.lastAnsweredAt = nowIso;
  record.byDay[todayKey] = day;
  record.totals[grade] += 1;
  record.lastGrade = grade;
  record.lastAnsweredAt = nowIso;
  progressByCardId.set(cardId, record);
  void queueProgressRecordPersist(record);
}

/**
 * @function cardMatchesSessionFilter
 * @description Checks whether card matches session filter.
 */

function cardMatchesSessionFilter(cardId, filters = sessionFilterState, dayKey = getTodayKey()) {
  const config = normalizeSessionFilters(filters);
  const day = getCardDayProgress(cardId, dayKey);
  const record = normalizeProgressRecord(progressByCardId.get(cardId), cardId);
  let attemptsEver = toCounterInt(record?.totals?.correct) + toCounterInt(record?.totals?.wrong) + toCounterInt(record?.totals?.partial);
  if (attemptsEver <= 0) {
    const hasLegacyAttempt = String(record?.lastGrade || '').trim().length > 0
      || String(record?.lastAnsweredAt || '').trim().length > 0;
    if (hasLegacyAttempt) attemptsEver = 1;
  }
  const notAnsweredYet = attemptsEver <= 0;
  const answeredToday = (day.correct + day.wrong + day.partial) > 0;
  let lastGradeToday = typeof day.lastGrade === 'string' ? day.lastGrade : '';
  if (!lastGradeToday && answeredToday) {
    const recordLastGrade = typeof record?.lastGrade === 'string' ? record.lastGrade : '';
    const recordDayKey = typeof record?.lastAnsweredAt === 'string' ? record.lastAnsweredAt.slice(0, 10) : '';
    if (recordLastGrade && recordDayKey === dayKey) lastGradeToday = recordLastGrade;
  }
  const masteredToday = day.mastered === true
    || day.correctStreak >= 3
    || (day.correct >= 3 && lastGradeToday === 'correct');
  const state = !answeredToday
    ? 'notAnsweredToday'
    : masteredToday
      ? 'correct'
      : lastGradeToday === 'wrong'
        ? 'wrong'
        : 'partial';
  if (config.all) {
    return state !== 'correct';
  }
  const hasSpecificFilter = config.correct || config.wrong || config.partial || config.notAnswered || config.notAnsweredYet;
  if (!hasSpecificFilter) {
    return true;
  }
  const matchCorrect = config.correct && state === 'correct';
  const matchWrong = config.wrong && state === 'wrong';
  const matchPartial = config.partial && state === 'partial';
  const matchNotAnswered = config.notAnswered && state === 'notAnsweredToday';
  const matchNotAnsweredYet = config.notAnsweredYet && notAnsweredYet;
  return matchCorrect || matchWrong || matchPartial || matchNotAnswered || matchNotAnsweredYet;
}

/**
 * @function ensureSessionProgressForCards
 * @description Ensures session progress for cards.
 */

async function ensureSessionProgressForCards(cards = [], payloadLabel = 'session-progress') {
  const cardList = Array.isArray(cards) ? cards : [];
  if (!cardList.length) return;
  const now = Date.now();
  const shouldForceProgressRefresh = now - lastProgressForceRefreshAt >= 5000;
  await ensureProgressForCardIds(
    cardList.map(card => card.id),
    { force: shouldForceProgressRefresh, payloadLabel }
  );
  if (shouldForceProgressRefresh) lastProgressForceRefreshAt = now;
}

/**
 * @function requiresProgressForSessionFilter
 * @description Returns true when evaluating the filter requires persisted progress records.
 */

function requiresProgressForSessionFilter(filters = sessionFilterState) {
  const config = normalizeSessionFilters(filters);
  return !!(config.all || config.correct || config.wrong || config.partial || config.notAnswered || config.notAnsweredYet);
}

/**
 * @function getEligibleSessionCardIdsByTopicIds
 * @description Returns eligible card IDs (stats-only path) for selected topics without loading full card payloads.
 */

async function getEligibleSessionCardIdsByTopicIds(topicIds, filters = sessionFilterState, options = {}) {
  if (!Array.isArray(topicIds) || !topicIds.length) return [];
  const opts = options && typeof options === 'object' ? options : {};
  const refs = await getCardRefsByTopicIds(topicIds, {
    ...opts,
    payloadLabel: String(opts.payloadLabel || 'session-refs')
  });
  if (!refs.length) return [];
  const ids = Array.from(new Set(
    refs.map(ref => String(ref?.id || '').trim()).filter(Boolean)
  ));
  if (!ids.length) return [];
  if (!requiresProgressForSessionFilter(filters)) {
    return ids;
  }
  await ensureProgressForCardIds(ids, {
    ...opts,
    payloadLabel: String(opts.progressPayloadLabel || 'session-progress')
  });
  return ids.filter(cardId => cardMatchesSessionFilter(cardId, filters));
}

/**
 * @function getEligibleSessionCardIdsByCardIds
 * @description Returns eligible card IDs for an explicit card list without loading full card payloads.
 */

async function getEligibleSessionCardIdsByCardIds(cardIds, filters = sessionFilterState, options = {}) {
  const ids = Array.isArray(cardIds)
    ? Array.from(new Set(cardIds.map(cardId => String(cardId || '').trim()).filter(Boolean)))
    : [];
  if (!ids.length) return [];
  const opts = options && typeof options === 'object' ? options : {};
  const refs = await getCardRefsByCardIds(ids, opts);
  if (!refs.length) return [];
  const refIds = Array.from(new Set(
    refs.map(ref => String(ref?.id || '').trim()).filter(Boolean)
  ));
  if (!refIds.length) return [];
  if (!requiresProgressForSessionFilter(filters)) {
    return refIds;
  }
  await ensureProgressForCardIds(refIds, { payloadLabel: 'session-progress' });
  return refIds.filter(cardId => cardMatchesSessionFilter(cardId, filters));
}

/**
 * @function getEligibleSessionCardsByTopicIds
 * @description Returns the eligible session cards by topic IDs.
 */

async function getEligibleSessionCardsByTopicIds(topicIds, filters = sessionFilterState) {
  if (!Array.isArray(topicIds) || !topicIds.length) return [];
  const cards = await getCardsByTopicIds(topicIds);
  if (!cards.length) return [];
  await ensureSessionProgressForCards(cards, 'session-progress');
  return cards.filter(card => cardMatchesSessionFilter(card.id, filters));
}

/**
 * @function getEligibleSessionCardsByCardIds
 * @description Returns the eligible session cards by card IDs.
 */

async function getEligibleSessionCardsByCardIds(cardIds, filters = sessionFilterState, options = {}) {
  const ids = Array.isArray(cardIds)
    ? Array.from(new Set(cardIds.map(cardId => String(cardId || '').trim()).filter(Boolean)))
    : [];
  if (!ids.length) return [];
  const opts = options && typeof options === 'object' ? options : {};
  const cards = await getCardsByCardIds(ids, opts);
  if (!cards.length) return [];
  await ensureSessionProgressForCards(cards, 'session-progress');
  return cards.filter(card => cardMatchesSessionFilter(card.id, filters));
}

/**
 * @function getSessionFilterSummaryText
 * @description Returns the session filter summary text.
 */

function getSessionFilterSummaryText(filters = sessionFilterState) {
  const config = normalizeSessionFilters(filters);
  if (config.all) {
    return 'Filter: All remaining cards (excluding cards mastered today: 3x correct in a row).';
  }
  const hasSpecificFilter = config.correct || config.wrong || config.partial || config.notAnswered || config.notAnsweredYet;
  if (!hasSpecificFilter) {
    return 'Filter: None (all cards in selected topics).';
  }
  const labels = [];
  if (config.correct) labels.push('Correctly answered (mastered)');
  if (config.wrong) labels.push('Wrong');
  if (config.partial) labels.push('Not quite / In progress');
  if (config.notAnswered) labels.push('Not answered today');
  if (config.notAnsweredYet) labels.push('Not answered yet');
  return `Filter: ${labels.join(', ')}`;
}

/**
 * @function renderSessionFilterSummary
 * @description Renders session filter summary.
 */

function renderSessionFilterSummary() {
  const summary = el('sessionFilterSummary');
  if (!summary) return;
  summary.textContent = getSessionFilterSummaryText(sessionFilterState);
}

/**
 * @function setSessionFilterState
 * @description Sets the session filter state.
 */

async function setSessionFilterState(nextState, options = {}) {
  const { refresh = true } = options;
  sessionFilterState = normalizeSessionFilters(nextState);
  renderSessionFilterSummary();
  if (refresh && selectedSubject) {
    await refreshTopicSessionMeta();
  }
}

/**
 * @function syncSessionFilterDialogControls
 * @description Synchronizes session filter dialog controls.
 */

function syncSessionFilterDialogControls() {
  const all = el('sessionFilterAll');
  const correct = el('sessionFilterCorrect');
  const wrong = el('sessionFilterWrong');
  const partial = el('sessionFilterPartial');
  const notAnswered = el('sessionFilterNotAnswered');
  const notAnsweredYet = el('sessionFilterNotAnsweredYet');
  if (!all || !correct || !wrong || !partial || !notAnswered || !notAnsweredYet) return;
  const locked = all.checked;
  correct.disabled = locked;
  wrong.disabled = locked;
  partial.disabled = locked;
  notAnswered.disabled = locked;
  notAnsweredYet.disabled = locked;
}

/**
 * @function fillSessionFilterDialogFromState
 * @description Builds fill session filter dialog from state.
 */

function fillSessionFilterDialogFromState() {
  const config = normalizeSessionFilters(sessionFilterState);
  const all = el('sessionFilterAll');
  const correct = el('sessionFilterCorrect');
  const wrong = el('sessionFilterWrong');
  const partial = el('sessionFilterPartial');
  const notAnswered = el('sessionFilterNotAnswered');
  const notAnsweredYet = el('sessionFilterNotAnsweredYet');
  if (!all || !correct || !wrong || !partial || !notAnswered || !notAnsweredYet) return;
  all.checked = config.all;
  correct.checked = config.correct;
  wrong.checked = config.wrong;
  partial.checked = config.partial;
  notAnswered.checked = config.notAnswered;
  notAnsweredYet.checked = config.notAnsweredYet;
  syncSessionFilterDialogControls();
}

/**
 * @function pullSessionFiltersFromDialog
 * @description Builds pull session filters from dialog.
 */

function pullSessionFiltersFromDialog() {
  const all = el('sessionFilterAll');
  const correct = el('sessionFilterCorrect');
  const wrong = el('sessionFilterWrong');
  const partial = el('sessionFilterPartial');
  const notAnswered = el('sessionFilterNotAnswered');
  const notAnsweredYet = el('sessionFilterNotAnsweredYet');
  if (!all || !correct || !wrong || !partial || !notAnswered || !notAnsweredYet) {
    return normalizeSessionFilters(sessionFilterState);
  }
  return normalizeSessionFilters({
    all: all.checked,
    correct: correct.checked,
    wrong: wrong.checked,
    partial: partial.checked,
    notAnswered: notAnswered.checked,
    notAnsweredYet: notAnsweredYet.checked
  });
}

/**
 * @function isDayMastered
 * @description Returns whether day mastered.
 */

function isDayMastered(day) {
  const safeDay = normalizeDayProgress(day);
  const attempts = Number(safeDay.correct || 0) + Number(safeDay.wrong || 0) + Number(safeDay.partial || 0);
  if (attempts <= 0) return false;
  if (safeDay.lastGrade !== 'correct') return false;
  // Normal mastery requires 3 correct in a row (and at least 3 correct answers on that day).
  const streakMastered = safeDay.correctStreak >= 3 && Number(safeDay.correct || 0) >= 3;
  // Review-mode mastery can legitimately be 1x correct if the card was persisted as mastered.
  const reviewMastered = safeDay.mastered === true && Number(safeDay.correct || 0) >= 1;
  return streakMastered || reviewMastered;
}

/**
 * @function normalizeDailyReviewStatusFilter
 * @description Normalizes daily review status filter.
 */

function normalizeDailyReviewStatusFilter(state = null) {
  const raw = (state && typeof state === 'object') ? state : DAILY_REVIEW_STATUS_FILTER_DEFAULT;
  return {
    green: !!raw.green,
    yellow: !!raw.yellow,
    red: !!raw.red
  };
}

/**
 * @function getDailyReviewCardStatus
 * @description Returns the daily review card status.
 */

function getDailyReviewCardStatus(cardId) {
  const key = String(cardId || '').trim();
  if (!key) return '';
  return String(dailyReviewState.statusByCardId.get(key) || '');
}

/**
 * @function cardMatchesDailyReviewStatus
 * @description Checks whether card matches daily review status.
 */

function cardMatchesDailyReviewStatus(cardId, statusFilter = dailyReviewState.statusFilter) {
  const status = getDailyReviewCardStatus(cardId);
  if (!status) return false;
  const filter = normalizeDailyReviewStatusFilter(statusFilter);
  if (!filter.green && !filter.yellow && !filter.red) return false;
  return status === 'green'
    ? filter.green
    : status === 'yellow'
      ? filter.yellow
      : status === 'red'
        ? filter.red
        : false;
}

/**
 * @function normalizeDailyReviewDayKey
 * @description Normalizes a value to YYYY-MM-DD for daily-review date filtering.
 */

function normalizeDailyReviewDayKey(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return '';
  return getTodayKey(new Date(parsed));
}

/**
 * @function formatDailyReviewDayLabel
 * @description Formats a YYYY-MM-DD key as a locale date label.
 */

function formatDailyReviewDayLabel(dayKey = '') {
  const safe = normalizeDailyReviewDayKey(dayKey);
  if (!safe) return '—';
  const dt = new Date(`${safe}T00:00:00`);
  if (!Number.isFinite(dt.getTime())) return '—';
  return formatDateAsDdMmYy(dt);
}

/**
 * @function getDailyReviewStatusFilteredCardIds
 * @description Returns all daily-review card IDs that match the current status filter.
 */

function getDailyReviewStatusFilteredCardIds() {
  if (!dailyReviewState.ready) return [];
  const seen = new Set();
  const ids = [];
  dailyReviewState.cardsByTopicId.forEach(cardIds => {
    (cardIds || []).forEach(cardId => {
      const key = String(cardId || '').trim();
      if (!key || seen.has(key)) return;
      if (!cardMatchesDailyReviewStatus(key)) return;
      seen.add(key);
      ids.push(key);
    });
  });
  return ids;
}

/**
 * @function getDailyReviewDateScopeCardIds
 * @description Returns card IDs from currently selected review topics for date range calculation.
 */

function getDailyReviewDateScopeCardIds() {
  if (!dailyReviewState.ready) return [];
  const selectedTopics = dailyReviewState.selectedTopicIds instanceof Set
    ? dailyReviewState.selectedTopicIds
    : new Set();
  if (!selectedTopics.size) return [];
  const seen = new Set();
  const ids = [];
  dailyReviewState.topics.forEach(topic => {
    if (!selectedTopics.has(topic.topicId)) return;
    const topicCardIds = dailyReviewState.cardsByTopicId.get(topic.topicId) || [];
    topicCardIds.forEach(cardId => {
      const key = String(cardId || '').trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      ids.push(key);
    });
  });
  return ids;
}

/**
 * @function syncDailyReviewDateKeysFromStatus
 * @description Rebuilds available date keys from selected-topic cards and keeps slider selection clamped.
 */

function syncDailyReviewDateKeysFromStatus() {
  const previousKeys = Array.isArray(dailyReviewState.dateKeys) ? dailyReviewState.dateKeys : [];
  const previousStartKey = previousKeys[dailyReviewState.selectedDateStart] || '';
  const previousEndKey = previousKeys[dailyReviewState.selectedDateEnd] || '';
  const scopedCardIds = getDailyReviewDateScopeCardIds();
  const nextDateKeys = Array.from(new Set(
    scopedCardIds
      .map(cardId => normalizeDailyReviewDayKey(dailyReviewState.dateByCardId.get(cardId)))
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
  dailyReviewState.dateKeys = nextDateKeys;
  if (!nextDateKeys.length) {
    dailyReviewState.selectedDateStart = 0;
    dailyReviewState.selectedDateEnd = 0;
    return;
  }
  const startIdx = previousStartKey ? nextDateKeys.indexOf(previousStartKey) : -1;
  const endIdx = previousEndKey ? nextDateKeys.indexOf(previousEndKey) : -1;
  dailyReviewState.selectedDateStart = startIdx >= 0 ? startIdx : 0;
  dailyReviewState.selectedDateEnd = endIdx >= 0 ? endIdx : (nextDateKeys.length - 1);
}

/**
 * @function getDailyReviewSelectedDateRange
 * @description Returns selected date range keys from the current daily-review slider state.
 */

function getDailyReviewSelectedDateRange() {
  const keys = Array.isArray(dailyReviewState.dateKeys) ? dailyReviewState.dateKeys : [];
  if (!keys.length) return { startKey: '', endKey: '' };
  const maxIdx = keys.length - 1;
  const startRaw = Number(dailyReviewState.selectedDateStart);
  const endRaw = Number(dailyReviewState.selectedDateEnd);
  const startIdx = Math.max(0, Math.min(maxIdx, Number.isFinite(startRaw) ? startRaw : 0));
  const endIdx = Math.max(0, Math.min(maxIdx, Number.isFinite(endRaw) ? endRaw : maxIdx));
  const safeStartIdx = Math.min(startIdx, endIdx);
  const safeEndIdx = Math.max(startIdx, endIdx);
  return {
    startKey: keys[safeStartIdx] || '',
    endKey: keys[safeEndIdx] || ''
  };
}

/**
 * @function cardMatchesDailyReviewDate
 * @description Checks whether a card matches the currently selected daily-review date range.
 */

function cardMatchesDailyReviewDate(cardId) {
  const dayKey = normalizeDailyReviewDayKey(dailyReviewState.dateByCardId.get(String(cardId || '').trim()));
  if (!dayKey) return false;
  const { startKey, endKey } = getDailyReviewSelectedDateRange();
  if (!startKey || !endKey) return false;
  return dayKey >= startKey && dayKey <= endKey;
}

/**
 * @function renderDailyReviewDateSlider
 * @description Renders slider values, labels, and visual track state for daily-review date filtering.
 */

function renderDailyReviewDateSlider(previewRange = null) {
  const filterWrap = el('dailyReviewDateFilter');
  const sliderWrap = el('dailyReviewDateSliderWrap');
  const startInput = el('dailyReviewDateStart');
  const endInput = el('dailyReviewDateEnd');
  const ticksEl = el('dailyReviewDateTicks');
  if (!filterWrap || !sliderWrap || !startInput || !endInput) return;

  const keys = Array.isArray(dailyReviewState.dateKeys) ? dailyReviewState.dateKeys : [];
  const hasDates = keys.length > 0;
  const hasRangeSlider = keys.length > 1;
  filterWrap.classList.toggle('is-empty', !hasDates);
  filterWrap.classList.toggle('is-single', hasDates && !hasRangeSlider);
  const maxIdx = Math.max(0, keys.length - 1);
  startInput.min = '0';
  endInput.min = '0';
  startInput.max = String(maxIdx);
  endInput.max = String(maxIdx);
  startInput.step = 'any';
  endInput.step = 'any';
  startInput.disabled = !hasRangeSlider;
  endInput.disabled = !hasRangeSlider;
  if (!hasDates) {
    startInput.value = '0';
    endInput.value = '0';
    sliderWrap.style.setProperty('--start-ratio', '0');
    sliderWrap.style.setProperty('--end-ratio', '1');
    sliderWrap.classList.remove('is-overlapping');
    setDailyReviewActiveRangeHandle('');
    if (ticksEl) ticksEl.innerHTML = '';
    return;
  }
  if (!hasRangeSlider) {
    dailyReviewState.selectedDateStart = 0;
    dailyReviewState.selectedDateEnd = 0;
    startInput.value = '0';
    endInput.value = '0';
    sliderWrap.style.setProperty('--start-ratio', '0');
    sliderWrap.style.setProperty('--end-ratio', '0');
    sliderWrap.classList.remove('is-overlapping');
    setDailyReviewActiveRangeHandle('');
    if (ticksEl) ticksEl.innerHTML = '';
    return;
  }

  const clampRaw = value => Math.max(0, Math.min(maxIdx, Number(value) || 0));
  const stateStart = clampRaw(dailyReviewState.selectedDateStart);
  const stateEnd = clampRaw(dailyReviewState.selectedDateEnd);

  const previewStartRaw = Number(previewRange?.start);
  const previewEndRaw = Number(previewRange?.end);
  const hasPreview = Number.isFinite(previewStartRaw) && Number.isFinite(previewEndRaw);
  const rawStart = hasPreview ? clampRaw(previewStartRaw) : stateStart;
  const rawEnd = hasPreview ? clampRaw(previewEndRaw) : stateEnd;

  if (!hasPreview) {
    dailyReviewState.selectedDateStart = stateStart;
    dailyReviewState.selectedDateEnd = stateEnd;
  }
  startInput.value = String(rawStart);
  endInput.value = String(rawEnd);

  const visualStart = Math.min(rawStart, rawEnd);
  const visualEnd = Math.max(rawStart, rawEnd);
  const startRatio = maxIdx > 0 ? (visualStart / maxIdx) : 0;
  const endRatio = maxIdx > 0 ? (visualEnd / maxIdx) : 1;
  sliderWrap.style.setProperty('--start-ratio', String(startRatio));
  sliderWrap.style.setProperty('--end-ratio', String(endRatio));

  const snapStart = Math.round(visualStart);
  const snapEnd = Math.round(visualEnd);
  sliderWrap.classList.toggle('is-overlapping', snapStart === snapEnd);

  if (!ticksEl) return;
  ticksEl.innerHTML = '';
  keys.forEach((dayKey, idx) => {
    const tick = document.createElement('span');
    tick.className = 'daily-review-date-tick';
    if (idx === 0 && maxIdx === 0) tick.classList.add('only');
    if (idx === 0) tick.classList.add('is-first');
    if (idx === maxIdx) tick.classList.add('is-last');
    if (idx >= snapStart && idx <= snapEnd) tick.classList.add('in-range');
    if (idx === snapStart || idx === snapEnd) tick.classList.add('is-edge');
    const pct = maxIdx > 0 ? (idx / maxIdx) * 100 : 0;
    tick.style.left = `${pct}%`;
    tick.textContent = formatDailyReviewDayLabel(dayKey);
    ticksEl.appendChild(tick);
  });
}

/**
 * @function setDailyReviewActiveRangeHandle
 * @description Sets which date-range handle should be layered on top when handles overlap.
 */

function setDailyReviewActiveRangeHandle(handle = '') {
  const sliderWrap = el('dailyReviewDateSliderWrap');
  if (!sliderWrap) return;
  sliderWrap.classList.toggle('active-start', handle === 'start');
  sliderWrap.classList.toggle('active-end', handle === 'end');
}

/**
 * @function applyDailyReviewDateRangeFromControls
 * @description Applies slider values to daily-review date range and refreshes dependent UI.
 */

function applyDailyReviewDateRangeFromControls(changed = 'start', options = {}) {
  const opts = (options && typeof options === 'object') ? options : {};
  const startInput = el('dailyReviewDateStart');
  const endInput = el('dailyReviewDateEnd');
  const keys = Array.isArray(dailyReviewState.dateKeys) ? dailyReviewState.dateKeys : [];
  if (!startInput || !endInput || !keys.length) return;
  if (keys.length <= 1) {
    dailyReviewState.selectedDateStart = 0;
    dailyReviewState.selectedDateEnd = 0;
    renderDailyReviewDateSlider();
    renderDailyReviewFilterSummary();
    if (!opts.preview) {
      updateDailyReviewSizeCounter();
      renderDailyReviewTopicList();
    }
    return;
  }
  const maxIdx = Math.max(0, keys.length - 1);
  const clampRaw = value => Math.max(0, Math.min(maxIdx, Number(value) || 0));
  let startRaw = clampRaw(startInput.value);
  let endRaw = clampRaw(endInput.value);
  let activeHandle = changed;
  if (startRaw > endRaw) {
    // Keep semantic roles stable: left thumb always represents range start.
    // If handles cross, swap values and switch active handle accordingly.
    [startRaw, endRaw] = [endRaw, startRaw];
    activeHandle = changed === 'start' ? 'end' : 'start';
  }
  startInput.value = String(startRaw);
  endInput.value = String(endRaw);
  setDailyReviewActiveRangeHandle(activeHandle);

  if (opts.preview) {
    // Keep filter state in sync during drag so release-event quirks on mobile
    // cannot leave an outdated date range active.
    dailyReviewState.selectedDateStart = Math.round(startRaw);
    dailyReviewState.selectedDateEnd = Math.round(endRaw);
    renderDailyReviewDateSlider({ start: startRaw, end: endRaw });
    renderDailyReviewFilterSummary();
    updateDailyReviewSizeCounter();
    return;
  }

  const startIdx = Math.round(startRaw);
  const endIdx = Math.round(endRaw);
  dailyReviewState.selectedDateStart = startIdx;
  dailyReviewState.selectedDateEnd = endIdx;
  renderDailyReviewDateSlider();
  renderDailyReviewFilterSummary();
  renderDailyReviewTopicList();
}

/**
 * @function getDailyReviewFilterSummaryText
 * @description Returns the daily review filter summary text.
 */

function getDailyReviewFilterSummaryText(filter = dailyReviewState.statusFilter) {
  const statusFilter = normalizeDailyReviewStatusFilter(filter);
  const labels = [];
  if (statusFilter.green) labels.push('Green');
  if (statusFilter.yellow) labels.push('Yellow');
  if (statusFilter.red) labels.push('Red');
  const statusText = labels.length ? labels.join(', ') : 'None selected';
  const { startKey, endKey } = getDailyReviewSelectedDateRange();
  if (!startKey || !endKey) return `Status: ${statusText} • Date: None`;
  return `Status: ${statusText} • Date: ${formatDailyReviewDayLabel(startKey)} to ${formatDailyReviewDayLabel(endKey)}`;
}

/**
 * @function renderDailyReviewFilterSummary
 * @description Renders daily review filter summary.
 */

function renderDailyReviewFilterSummary() {
  const metaEl = el('dailyReviewFilterMeta');
  if (!metaEl) return;
  metaEl.textContent = getDailyReviewFilterSummaryText();
}

/**
 * @function pullDailyReviewStatusFilterFromControls
 * @description Builds pull daily review status filter from controls.
 */

function pullDailyReviewStatusFilterFromControls() {
  const green = el('dailyReviewFilterGreen');
  const yellow = el('dailyReviewFilterYellow');
  const red = el('dailyReviewFilterRed');
  return normalizeDailyReviewStatusFilter({
    green: !!green?.checked,
    yellow: !!yellow?.checked,
    red: !!red?.checked
  });
}

/**
 * @function fillDailyReviewStatusFilterControls
 * @description Handles fill daily review status filter controls logic.
 */

function fillDailyReviewStatusFilterControls() {
  const filter = normalizeDailyReviewStatusFilter(dailyReviewState.statusFilter);
  const green = el('dailyReviewFilterGreen');
  const yellow = el('dailyReviewFilterYellow');
  const red = el('dailyReviewFilterRed');
  if (green) green.checked = filter.green;
  if (yellow) yellow.checked = filter.yellow;
  if (red) red.checked = filter.red;
}

/**
 * @function getDailyReviewFilteredCardIdsByTopic
 * @description Returns the daily review filtered card IDs by topic.
 */

function getDailyReviewFilteredCardIdsByTopic(topicId) {
  const key = String(topicId || '').trim();
  if (!key) return [];
  const cardIds = dailyReviewState.cardsByTopicId.get(key) || [];
  return cardIds.filter(cardId => (
    cardMatchesDailyReviewStatus(cardId)
    && cardMatchesDailyReviewDate(cardId)
  ));
}

/**
 * @function getDailyReviewSelectedCardIds
 * @description Returns the daily review selected card IDs.
 */

function getDailyReviewSelectedCardIds() {
  if (!dailyReviewState.ready) return [];
  const selected = dailyReviewState.selectedTopicIds;
  const seen = new Set();
  const ids = [];
  dailyReviewState.topics.forEach(topic => {
    if (!selected.has(topic.topicId)) return;
    const cardIds = getDailyReviewFilteredCardIdsByTopic(topic.topicId);
    cardIds.forEach(cardId => {
      if (seen.has(cardId)) return;
      seen.add(cardId);
      ids.push(cardId);
    });
  });
  return ids;
}

/**
 * @function updateDailyReviewSizeCounter
 * @description Updates daily review size counter.
 */

function updateDailyReviewSizeCounter() {
  const selectedCardIds = getDailyReviewSelectedCardIds();
  const available = selectedCardIds.length;
  if (available <= 0) {
    dailyReviewState.size = 0;
  } else if (dailyReviewState.size <= 0) {
    dailyReviewState.size = Math.min(DAILY_REVIEW_DEFAULT_SIZE, available);
  } else {
    dailyReviewState.size = Math.min(dailyReviewState.size, available);
  }

  const valueEl = el('dailyReviewSizeValue');
  const minusBtn = el('dailyReviewMinus');
  const plusBtn = el('dailyReviewPlus');
  const startBtn = el('startDailyReviewBtn');
  const selectedMetaEl = el('dailyReviewSelectionMeta');
  if (valueEl) {
    const current = available > 0 ? dailyReviewState.size : 0;
    valueEl.textContent = `${current} / ${available}`;
  }
  if (minusBtn) minusBtn.disabled = available <= 0 || dailyReviewState.size <= 1;
  if (plusBtn) plusBtn.disabled = available <= 0 || dailyReviewState.size >= available;
  if (startBtn) startBtn.disabled = available <= 0;
  if (selectedMetaEl) {
    const selectedTopics = dailyReviewState.topics.filter(topic => (
      dailyReviewState.selectedTopicIds.has(topic.topicId)
      && getDailyReviewFilteredCardIdsByTopic(topic.topicId).length > 0
    )).length;
    const topicWord = selectedTopics === 1 ? 'topic' : 'topics';
    const cardWord = available === 1 ? 'card' : 'cards';
    selectedMetaEl.textContent = `${selectedTopics} ${topicWord} selected • ${available} ${cardWord}`;
  }
}

/**
 * @function groupDailyReviewTopicsBySubject
 * @description Groups daily review topics by subject for collapsible review list sections.
 */

function groupDailyReviewTopicsBySubject() {
  const groupsByKey = new Map();
  dailyReviewState.topics.forEach(topic => {
    const subjectId = String(topic?.subjectId || '').trim();
    const subjectName = String(topic?.subjectName || '').trim() || 'Unknown subject';
    const subjectAccent = normalizeHexColor(topic?.subjectAccent || '#2dd4bf');
    const subjectKey = subjectId || `subject:${subjectName.toLowerCase()}`;
    if (!groupsByKey.has(subjectKey)) {
      groupsByKey.set(subjectKey, { subjectKey, subjectName, subjectAccent, topics: [] });
    }
    const group = groupsByKey.get(subjectKey);
    if (!group.subjectAccent && subjectAccent) group.subjectAccent = subjectAccent;
    groupsByKey.get(subjectKey).topics.push(topic);
  });
  const groups = Array.from(groupsByKey.values());
  groups.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  groups.forEach(group => {
    group.topics.sort((a, b) => a.topicName.localeCompare(b.topicName));
  });
  return groups;
}

/**
 * @function renderDailyReviewTopicList
 * @description Renders daily review topic list.
 */

function renderDailyReviewTopicList() {
  const listEl = el('dailyReviewTopicList');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (!dailyReviewState.ready || !dailyReviewState.topics.length) {
    const todayAnswered = Number(dailyReviewState.todayStats?.answeredCards || 0);
    listEl.innerHTML = todayAnswered > 0
      ? '<div class="tiny">No cards are due from yesterday. Nice progress today.</div>'
      : '<div class="tiny">No answered cards from yesterday are available for review yet.</div>';
    updateDailyReviewSizeCounter();
    return;
  }

  const subjectGroups = groupDailyReviewTopicsBySubject();
  subjectGroups.forEach(group => {
    const groupEl = document.createElement('section');
    groupEl.className = 'daily-review-subject-group';
    const subjectAccent = normalizeHexColor(group.subjectAccent || '#2dd4bf');
    groupEl.style.setProperty('--daily-review-subject-accent', subjectAccent);
    groupEl.style.setProperty('--daily-review-subject-accent-bg', hexToRgba(subjectAccent, 0.14));
    groupEl.style.setProperty('--daily-review-subject-accent-glow', hexToRgba(subjectAccent, 0.36));
    groupEl.style.setProperty('--daily-review-subject-accent-glow-soft', hexToRgba(subjectAccent, 0.2));
    const isExpanded = dailyReviewState.expandedSubjectKeys.has(group.subjectKey);
    groupEl.classList.toggle('is-expanded', isExpanded);

    const headerBtn = document.createElement('button');
    headerBtn.type = 'button';
    headerBtn.className = 'daily-review-subject-toggle';
    headerBtn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    headerBtn.addEventListener('click', () => {
      let nextExpanded = false;
      if (dailyReviewState.expandedSubjectKeys.has(group.subjectKey)) {
        dailyReviewState.expandedSubjectKeys.delete(group.subjectKey);
        nextExpanded = false;
      } else {
        dailyReviewState.expandedSubjectKeys.add(group.subjectKey);
        nextExpanded = true;
      }
      groupEl.classList.toggle('is-expanded', nextExpanded);
      headerBtn.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
    });

    const titleWrap = document.createElement('div');
    titleWrap.className = 'daily-review-subject-title-wrap';
    const titleEl = document.createElement('div');
    titleEl.className = 'daily-review-subject-title';
    titleEl.textContent = group.subjectName;
    const metaEl = document.createElement('div');
    metaEl.className = 'tiny';
    const availableForSubject = group.topics.reduce((sum, topic) => {
      return sum + getDailyReviewFilteredCardIdsByTopic(topic.topicId).length;
    }, 0);
    const totalForSubject = group.topics.reduce((sum, topic) => sum + topic.count, 0);
    const subjectCardWord = totalForSubject === 1 ? 'card' : 'cards';
    metaEl.textContent = `${availableForSubject} / ${totalForSubject} ${subjectCardWord}`;
    titleWrap.append(titleEl, metaEl);

    const chevronEl = document.createElement('span');
    chevronEl.className = 'daily-review-subject-chevron';
    chevronEl.setAttribute('aria-hidden', 'true');
    chevronEl.textContent = '▾';

    headerBtn.append(titleWrap, chevronEl);
    groupEl.appendChild(headerBtn);

    const topicsEl = document.createElement('div');
    topicsEl.className = 'daily-review-subject-topics';
    group.topics.forEach(topic => {
      const filteredCardIds = getDailyReviewFilteredCardIdsByTopic(topic.topicId);
      const availableCount = filteredCardIds.length;
      const option = document.createElement('label');
      option.className = 'session-filter-option daily-review-topic-option';
      if (availableCount <= 0) option.classList.add('is-disabled');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.disabled = false;
      checkbox.checked = dailyReviewState.selectedTopicIds.has(topic.topicId);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) dailyReviewState.selectedTopicIds.add(topic.topicId);
        else dailyReviewState.selectedTopicIds.delete(topic.topicId);
        syncDailyReviewDateKeysFromStatus();
        renderDailyReviewDateSlider();
        renderDailyReviewFilterSummary();
        renderDailyReviewTopicList();
      });

      const textWrap = document.createElement('div');
      textWrap.className = 'daily-review-topic-text';
      const nameEl = document.createElement('div');
      nameEl.className = 'daily-review-topic-name';
      nameEl.textContent = topic.topicName;
      const topicMetaEl = document.createElement('div');
      topicMetaEl.className = 'tiny';
      const countWord = availableCount === 1 ? 'card' : 'cards';
      topicMetaEl.textContent = `${availableCount} / ${topic.count} ${countWord}`;
      textWrap.append(nameEl, topicMetaEl);

      option.append(checkbox, textWrap);
      topicsEl.appendChild(option);
    });
    groupEl.appendChild(topicsEl);
    listEl.appendChild(groupEl);
  });

  updateDailyReviewSizeCounter();
}

/**
 * @function buildDailyReviewTodayStats
 * @description Aggregates today's answered/mastered/grade counts for motivational review-home stats.
 */

function buildDailyReviewTodayStats(progressRecords = [], todayKey = getTodayKey()) {
  const stats = createEmptyDailyReviewTodayStats();
  const rows = Array.isArray(progressRecords) ? progressRecords : [];
  rows.forEach(row => {
    const cardId = String(row?.cardId || '').trim();
    if (!cardId) return;
    const record = normalizeProgressRecord(row, cardId);
    const day = normalizeDayProgress(record.byDay?.[todayKey]);
    const correct = toCounterInt(day.correct);
    const partial = toCounterInt(day.partial);
    const wrong = toCounterInt(day.wrong);
    const attempts = correct + partial + wrong;
    if (attempts <= 0) return;
    stats.answeredCards += 1;
    stats.masteredCards += isDayMastered(day) ? 1 : 0;
    stats.attempts += attempts;
    stats.correct += correct;
    stats.partial += partial;
    stats.wrong += wrong;
  });
  return stats;
}

/**
 * @function renderDailyReviewPanelSummary
 * @description Renders daily review panel summary.
 */

function renderDailyReviewPanelSummary() {
  const messageEl = el('dailyReviewMessage');
  const todayStatsEl = el('dailyReviewTodayStats');
  const cardsEl = el('dailyReviewTotalCards');
  const topicsEl = el('dailyReviewTotalTopics');
  const cardWord = dailyReviewState.totalCards === 1 ? 'card' : 'cards';
  if (messageEl) {
    const dayLabel = formatDailyReviewDayLabel(dailyReviewState.yesterdayKey);
    if (dailyReviewState.totalCards > 0) {
      messageEl.textContent = `You have ${dailyReviewState.totalCards} answered ${cardWord} from ${dayLabel}. Select status and topics for review.`;
    } else if ((dailyReviewState.todayStats?.answeredCards || 0) > 0) {
      messageEl.textContent = 'Great work today. There are no cards left to review from yesterday.';
    } else {
      messageEl.textContent = `No cards from ${dayLabel} are available for review yet.`;
    }
  }
  if (todayStatsEl) {
    const todayLabel = formatDailyReviewDayLabel(getTodayKey());
    const todayStats = dailyReviewState.todayStats || createEmptyDailyReviewTodayStats();
    if (todayStats.answeredCards > 0) {
      const cardLabel = todayStats.answeredCards === 1 ? 'card' : 'cards';
      todayStatsEl.textContent = `Today (${todayLabel}): ${todayStats.answeredCards} ${cardLabel} answered • ${todayStats.masteredCards} mastered • C/P/W: ${todayStats.correct}/${todayStats.partial}/${todayStats.wrong}`;
    } else {
      todayStatsEl.textContent = `Today (${todayLabel}): no saved answers yet.`;
    }
  }
  if (cardsEl) cardsEl.textContent = String(dailyReviewState.totalCards);
  if (topicsEl) topicsEl.textContent = String(dailyReviewState.topics.length);
  fillDailyReviewStatusFilterControls();
  syncDailyReviewDateKeysFromStatus();
  renderDailyReviewDateSlider();
  renderDailyReviewFilterSummary();
  renderDailyReviewTopicList();
}

/**
 * @function prepareDailyReviewState
 * @description Builds Daily Review panel data (counts, topic groups, and status filters).
 */

async function prepareDailyReviewState(options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const uiBlocking = opts.uiBlocking === true;
  const traceRunId = Number(opts.traceRunId || 0);
  const traceStartedAt = Number(opts.traceStartedAt || 0);
  const traceEnabled = traceRunId > 0 && Number.isFinite(traceStartedAt) && traceStartedAt > 0;
  resetDailyReviewState();
  if (traceEnabled) logReviewTrace(traceRunId, 'reset-state', traceStartedAt);
  const yesterdayKey = getDayKeyByOffset(-1);
  const todayKey = getTodayKey();
  const progressRecords = await getAll('progress', {
    uiBlocking,
    loadingLabel: 'Loading review progress...'
  });
  if (traceEnabled) {
    logReviewTrace(traceRunId, 'progress-loaded', traceStartedAt, {
      rows: Array.isArray(progressRecords) ? progressRecords.length : 0
    });
  }
  const rows = Array.isArray(progressRecords) ? progressRecords : [];
  const todayStats = buildDailyReviewTodayStats(rows, todayKey);

  const answeredCardIds = [];
  const statusByCardId = new Map();
  const dateByCardId = new Map();
  rows.forEach(row => {
    const cardId = String(row?.cardId || '').trim();
    if (!cardId) return;
    const state = getCurrentProgressState(row, cardId);
    if (state.attemptsTotal <= 0) return;
    const latestEntry = getLatestProgressDayEntry(row, cardId);
    const latestDayKey = normalizeDailyReviewDayKey(
      latestEntry?.dayKey
      || latestEntry?.day?.lastAnsweredAt
      || row?.lastAnsweredAt
    );
    if (!latestDayKey) return;
    // Daily review is based on cards whose latest saved state is from yesterday.
    if (latestDayKey !== yesterdayKey) return;
    let status = '';
    if (state.key === 'mastered' || state.key === 'correct') {
      status = 'green';
    } else if (state.key === 'partial' || state.key === 'in-progress') {
      status = 'yellow';
    } else if (state.key === 'wrong') {
      status = 'red';
    }
    if (!status) return;
    statusByCardId.set(cardId, status);
    dateByCardId.set(cardId, latestDayKey);
    answeredCardIds.push(cardId);
  });

  const uniqueCardIds = Array.from(new Set(answeredCardIds));
  if (traceEnabled) {
    logReviewTrace(traceRunId, 'review-candidates-derived', traceStartedAt, {
      uniqueCardIds: uniqueCardIds.length
    });
  }
  const cardsByTopicId = new Map();
  let topics = [];
  if (uniqueCardIds.length) {
    await preloadTopicDirectory({
      uiBlocking,
      loadingLabel: 'Loading topics...'
    });
    if (traceEnabled) logReviewTrace(traceRunId, 'topic-directory-loaded', traceStartedAt);
    const cardRefs = await getCardRefsByCardIds(uniqueCardIds, {
      payloadLabel: 'daily-review-candidate-refs',
      uiBlocking,
      loadingLabel: 'Loading review cards...'
    });
    if (traceEnabled) {
      logReviewTrace(traceRunId, 'card-refs-loaded', traceStartedAt, {
        refs: cardRefs.length
      });
    }
    if (cardRefs.length) {
      const subjects = await getAll('subjects', {
        uiBlocking,
        loadingLabel: 'Loading subjects...'
      });
      if (traceEnabled) {
        logReviewTrace(traceRunId, 'subjects-loaded', traceStartedAt, {
          subjects: Array.isArray(subjects) ? subjects.length : 0
        });
      }
      const subjectMetaById = new Map(
        subjects.map(subject => {
          const id = String(subject?.id || '').trim();
          const name = String(subject?.name || 'Unknown subject').trim() || 'Unknown subject';
          const accent = normalizeHexColor(subject?.accent || '#2dd4bf');
          return [id, { name, accent }];
        })
      );
      cardRefs.forEach(card => {
        const cardId = String(card?.id || '').trim();
        const topicId = String(card?.topicId || '').trim();
        if (!cardId || !topicId || !statusByCardId.has(cardId)) return;
        if (!dateByCardId.has(cardId)) return;
        if (!cardsByTopicId.has(topicId)) cardsByTopicId.set(topicId, []);
        cardsByTopicId.get(topicId).push(cardId);
      });
      topics = Array.from(cardsByTopicId.entries()).map(([topicId, cardIds]) => {
        const topic = topicDirectoryById.get(topicId) || {};
        const subjectId = String(topic?.subjectId || '').trim();
        const subjectMeta = subjectMetaById.get(subjectId);
        const topicName = String(topic?.name || '').trim() || 'Unknown topic';
        const subjectName = subjectMeta?.name || 'Unknown subject';
        const subjectAccent = subjectMeta?.accent || '#2dd4bf';
        return {
          topicId,
          subjectId,
          topicName,
          subjectName,
          subjectAccent,
          count: cardIds.length
        };
      });
      topics.sort((a, b) => {
        const subjectDiff = a.subjectName.localeCompare(b.subjectName);
        if (subjectDiff !== 0) return subjectDiff;
        return a.topicName.localeCompare(b.topicName);
      });
    }
  }

  const selectedTopicIds = new Set(topics.map(topic => topic.topicId));
  const totalCards = topics.reduce((sum, topic) => sum + topic.count, 0);
  const dateKeys = Array.from(new Set(Array.from(dateByCardId.values()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  dailyReviewState = {
    ready: true,
    hasReviewCards: totalCards > 0,
    yesterdayKey,
    cardsByTopicId,
    topics,
    expandedSubjectKeys: new Set(),
    selectedTopicIds,
    statusByCardId,
    dateByCardId,
    dateKeys,
    selectedDateStart: 0,
    selectedDateEnd: Math.max(0, dateKeys.length - 1),
    statusFilter: { ...DAILY_REVIEW_STATUS_FILTER_DEFAULT },
    todayStats,
    totalCards,
    size: totalCards > 0 ? Math.min(DAILY_REVIEW_DEFAULT_SIZE, totalCards) : 0
  };
  if (traceEnabled) {
    logReviewTrace(traceRunId, 'state-ready', traceStartedAt, {
      topics: topics.length,
      totalCards
    });
  }
  return true;
}

/**
 * @function refreshDailyReviewHomePanel
 * @description Refreshes daily review home panel.
 */

async function refreshDailyReviewHomePanel(options = {}) {
  const panel = el('dailyReviewHomePanel');
  if (!panel) return;
  const opts = options && typeof options === 'object' ? options : {};
  const traceEnabled = opts.trace !== false;
  const traceRunId = traceEnabled ? ++reviewTraceRunCounter : 0;
  const traceStartedAt = performance.now();
  const shouldReuseExisting = !!opts.useExisting && dailyReviewState.ready;
  let localLoaderShown = false;
  if (traceEnabled) {
    logReviewTrace(traceRunId, 'refresh-start', traceStartedAt, {
      useExisting: !!opts.useExisting,
      hasCachedState: !!dailyReviewState.ready
    });
  }
  if (!shouldReuseExisting && !appLoadingDebugPinned) {
    setAppLoadingState(true, 'Loading daily review...');
    localLoaderShown = true;
    if (traceEnabled) logReviewTrace(traceRunId, 'overlay-shown', traceStartedAt);
  }
  try {
    if (!shouldReuseExisting) {
      const ready = await prepareDailyReviewState({
        uiBlocking: false,
        traceRunId,
        traceStartedAt
      });
      panel.classList.toggle('hidden', !ready);
      if (!ready) {
        if (traceEnabled) logReviewTrace(traceRunId, 'not-ready', traceStartedAt);
        return;
      }
    } else {
      panel.classList.remove('hidden');
      if (traceEnabled) {
        logReviewTrace(traceRunId, 'reuse-existing-state', traceStartedAt, {
          topics: dailyReviewState.topics.length,
          totalCards: dailyReviewState.totalCards
        });
      }
    }
    renderDailyReviewPanelSummary();
    if (traceEnabled) {
      logReviewTrace(traceRunId, 'summary-rendered', traceStartedAt, {
        selectedTopics: dailyReviewState.selectedTopicIds?.size || 0,
        visibleCards: getDailyReviewSelectedCardIds().length
      });
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (traceEnabled) {
      logReviewTrace(traceRunId, 'panel-fully-displayed', traceStartedAt, {
        isHidden: panel.classList.contains('hidden'),
        totalCards: dailyReviewState.totalCards,
        topics: dailyReviewState.topics.length
      });
    }
  } finally {
    if (localLoaderShown) {
      setAppLoadingState(false);
      localLoaderShown = false;
      if (traceEnabled) logReviewTrace(traceRunId, 'overlay-hidden', traceStartedAt);
    }
  }
}

/**
 * @function startDailyReviewFromHomePanel
 * @description Starts a review session from the currently selected Daily Review filters.
 */

async function startDailyReviewFromHomePanel() {
  if (!dailyReviewState.ready) return;
  const topicIds = dailyReviewState.topics
    .filter(topic => dailyReviewState.selectedTopicIds.has(topic.topicId))
    .map(topic => topic.topicId);
  if (!topicIds.length) {
    alert('Select at least one topic.');
    return;
  }
  const cardIds = getDailyReviewSelectedCardIds();
  if (!cardIds.length) {
    alert('No review cards match the selected topics/status/date filter.');
    return;
  }
  const forcedSize = Math.min(Math.max(dailyReviewState.size, 1), cardIds.length);
  await startSession({
    topicIds,
    cardIds,
    // Use explicit review card IDs as-is (no second session-filter pass).
    filters: { ...SESSION_FILTER_DEFAULT },
    forcedSize,
    reviewMode: true
  });
}

/**
 * @function toCounterInt
 * @description Handles to counter int logic.
 */

function toCounterInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : 0;
}

/**
 * @function formatDateAsDdMmYy
 * @description Formats a Date object as DD.MM.YY.
 */

function formatDateAsDdMmYy(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return '—';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

/**
 * @function formatProgressTimestamp
 * @description Formats progress timestamp.
 */

function formatProgressTimestamp(iso = '') {
  const raw = String(iso || '').trim();
  if (!raw) return '—';
  const dt = new Date(raw);
  if (!Number.isFinite(dt.getTime())) return '—';
  return formatDateAsDdMmYy(dt);
}

/**
 * @function getQuestionPreviewText
 * @description Returns the question preview text.
 */

function getQuestionPreviewText(card) {
  const raw = String(card?.prompt || '');
  let text = '';
  if (raw.trim()) {
    const parser = document.createElement('div');
    parser.innerHTML = markdownToHtml(raw);
    text = String(parser.textContent || '').replace(/\s+/g, ' ').trim();
  }
  if (!text && getCardImageList(card, 'Q').length > 0) {
    text = '[Image question]';
  }
  if (!text) text = '(empty)';
  if (text.length > 140) text = `${text.slice(0, 137)}...`;
  return text;
}

/**
 * @function getLatestProgressDayEntry
 * @description Returns the latest progress day entry.
 */

function getLatestProgressDayEntry(record, fallbackCardId = '') {
  const safeRecord = normalizeProgressRecord(record, String(record?.cardId || fallbackCardId || ''));
  const entries = Object.entries(safeRecord.byDay || {})
    .map(([dayKey, rawDay]) => {
      const day = normalizeDayProgress(rawDay);
      const attempts = toCounterInt(day.correct) + toCounterInt(day.wrong) + toCounterInt(day.partial);
      if (attempts <= 0) return null;
      const parsedTs = Date.parse(String(day.lastAnsweredAt || ''));
      const ts = Number.isFinite(parsedTs) ? parsedTs : Date.parse(`${dayKey}T23:59:59`);
      return { dayKey, day, ts: Number.isFinite(ts) ? ts : 0 };
    })
    .filter(Boolean);
  if (!entries.length) return null;
  entries.sort((a, b) => b.ts - a.ts || b.dayKey.localeCompare(a.dayKey));
  return entries[0];
}

/**
 * @function getCurrentProgressState
 * @description Returns the current progress state.
 */

function getCurrentProgressState(record, fallbackCardId = '') {
  const safeRecord = normalizeProgressRecord(record, String(record?.cardId || fallbackCardId || ''));
  const totals = {
    correct: toCounterInt(safeRecord.totals?.correct),
    partial: toCounterInt(safeRecord.totals?.partial),
    wrong: toCounterInt(safeRecord.totals?.wrong)
  };
  const attemptsTotal = totals.correct + totals.partial + totals.wrong;
  if (attemptsTotal <= 0) {
    return {
      key: 'not-answered',
      label: 'Not answered',
      streak: 0,
      lastGrade: '—',
      lastAnsweredAt: '—',
      attemptsTotal,
      totals
    };
  }

  const latest = getLatestProgressDayEntry(safeRecord, fallbackCardId);
  const day = latest?.day || normalizeDayProgress(null);
  const lastGradeRaw = String(day.lastGrade || safeRecord.lastGrade || '').trim();
  const streak = toCounterInt(day.correctStreak);
  let key = 'in-progress';
  let label = 'In progress';
  if (lastGradeRaw === 'correct' && (day.mastered || streak >= 3)) {
    key = 'mastered';
    label = 'Mastered';
  } else if (lastGradeRaw === 'correct') {
    key = 'correct';
    label = 'Correct';
  } else if (lastGradeRaw === 'partial') {
    key = 'partial';
    label = 'Not quite';
  } else if (lastGradeRaw === 'wrong') {
    key = 'wrong';
    label = 'Wrong';
  }

  const lastGrade = lastGradeRaw
    ? (lastGradeRaw === 'partial' ? 'Not quite' : `${lastGradeRaw.charAt(0).toUpperCase()}${lastGradeRaw.slice(1)}`)
    : '—';
  const lastAnsweredAt = formatProgressTimestamp(day.lastAnsweredAt || safeRecord.lastAnsweredAt || '');
  return { key, label, streak, lastGrade, lastAnsweredAt, attemptsTotal, totals };
}

/**
 * @function getProgressHistoryLines
 * @description Returns the progress history lines.
 */

function getProgressHistoryLines(record, fallbackCardId = '', limit = 8) {
  const safeRecord = normalizeProgressRecord(record, String(record?.cardId || fallbackCardId || ''));
  const entries = Object.entries(safeRecord.byDay || {})
    .map(([dayKey, rawDay]) => {
      const day = normalizeDayProgress(rawDay);
      const attempts = toCounterInt(day.correct) + toCounterInt(day.wrong) + toCounterInt(day.partial);
      if (attempts <= 0) return null;
      const parsedTs = Date.parse(String(day.lastAnsweredAt || ''));
      const ts = Number.isFinite(parsedTs) ? parsedTs : Date.parse(`${dayKey}T23:59:59`);
      return {
        dayKey,
        day,
        ts: Number.isFinite(ts) ? ts : 0
      };
    })
    .filter(Boolean);
  if (!entries.length) return '—';
  entries.sort((a, b) => b.ts - a.ts || b.dayKey.localeCompare(a.dayKey));

  const shown = entries.slice(0, Math.max(1, toCounterInt(limit)));
  const lines = shown.map(({ dayKey, day }) => {
    const correct = toCounterInt(day.correct);
    const partial = toCounterInt(day.partial);
    const wrong = toCounterInt(day.wrong);
    const streak = toCounterInt(day.correctStreak);
    const masteredFlag = day.mastered || streak >= 3 ? ' M' : '';
    return `${formatDailyReviewDayLabel(dayKey)}: C${correct}/P${partial}/W${wrong} · S${streak}${masteredFlag}`;
  });
  if (entries.length > shown.length) {
    lines.push(`+${entries.length - shown.length} more`);
  }
  return lines.join('\n');
}

/**
 * @function buildProgressStateChip
 * @description Builds progress state chip.
 */

function buildProgressStateChip(state) {
  const chip = document.createElement('span');
  chip.className = `progress-state-chip progress-state-${state.key || 'in-progress'}`;
  chip.textContent = state.label || 'In progress';
  return chip;
}

/**
 * @function normalizeProgressCheckColumnKey
 * @description Normalizes a table column key for progress check filters.
 */

function normalizeProgressCheckColumnKey(value = '', fallback = 'subject') {
  const key = String(value || '').trim();
  return PROGRESS_CHECK_COLUMN_KEYS.includes(key) ? key : fallback;
}

/**
 * @function normalizeProgressCheckFilterValue
 * @description Normalizes cell values for stable checkbox filtering.
 */

function normalizeProgressCheckFilterValue(value = '') {
  const text = String(value || '').trim();
  return text || '—';
}

/**
 * @function getProgressCheckRowValue
 * @description Returns the display value for one progress check row and column key.
 */

function getProgressCheckRowValue(row, columnKey = 'subject') {
  const safeRow = (row && typeof row === 'object') ? row : {};
  const key = normalizeProgressCheckColumnKey(columnKey, 'subject');
  if (key === 'subject') return String(safeRow.subject || '');
  if (key === 'topic') return String(safeRow.topic || '');
  if (key === 'question') return String(safeRow.question || '');
  if (key === 'current') return String(safeRow.currentLabel || '');
  if (key === 'streak') return String(Number.isFinite(Number(safeRow.streak)) ? Number(safeRow.streak) : '');
  if (key === 'lastGrade') return String(safeRow.lastGrade || '');
  if (key === 'lastAnsweredAt') return String(safeRow.lastAnsweredAt || '');
  if (key === 'totals') return String(safeRow.totalsText || '');
  if (key === 'history') return String(safeRow.history || '');
  return '';
}

/**
 * @function getProgressCheckDistinctValues
 * @description Returns sorted distinct values for a given progress-check column.
 */

function getProgressCheckDistinctValues(rows = [], column = 'subject') {
  const safeRows = Array.isArray(rows) ? rows : [];
  const key = normalizeProgressCheckColumnKey(column, 'subject');
  return Array.from(new Set(
    safeRows.map(row => normalizeProgressCheckFilterValue(getProgressCheckRowValue(row, key)))
  )).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

/**
 * @function initProgressCheckFilterState
 * @description Initializes filter sets for each progress-check column.
 */

function initProgressCheckFilterState() {
  const prevSelected = (progressCheckFilterState?.selectedValuesByColumn && typeof progressCheckFilterState.selectedValuesByColumn === 'object')
    ? progressCheckFilterState.selectedValuesByColumn
    : {};
  const prevAllValues = (progressCheckAllValuesByColumn && typeof progressCheckAllValuesByColumn === 'object')
    ? progressCheckAllValuesByColumn
    : {};
  const nextSelected = {};
  const nextAllValues = {};

  PROGRESS_CHECK_COLUMN_KEYS.forEach(column => {
    const allValues = getProgressCheckDistinctValues(progressCheckRowsCache, column);
    nextAllValues[column] = allValues;
    const prevSet = prevSelected[column] instanceof Set ? prevSelected[column] : null;
    const prevAll = Array.isArray(prevAllValues[column]) ? prevAllValues[column] : [];
    const prevWasAll = !!prevSet
      && prevAll.length > 0
      && prevSet.size === prevAll.length
      && prevAll.every(value => prevSet.has(value));
    if (!prevSet || prevWasAll) {
      nextSelected[column] = new Set(allValues);
      return;
    }
    const intersected = new Set(allValues.filter(value => prevSet.has(value)));
    nextSelected[column] = intersected.size ? intersected : new Set(allValues);
  });

  progressCheckAllValuesByColumn = nextAllValues;
  progressCheckFilterState = {
    sortColumn: normalizeProgressCheckColumnKey(progressCheckFilterState?.sortColumn, 'subject'),
    sortDirection: progressCheckFilterState?.sortDirection === 'desc' ? 'desc' : 'asc',
    selectedValuesByColumn: nextSelected
  };
}

/**
 * @function getProgressCheckSelectedSet
 * @description Returns the selected value set for a column.
 */

function getProgressCheckSelectedSet(column = 'subject') {
  const key = normalizeProgressCheckColumnKey(column, 'subject');
  const selected = progressCheckFilterState?.selectedValuesByColumn || {};
  const existing = selected[key];
  if (existing instanceof Set) return existing;
  const allValues = Array.isArray(progressCheckAllValuesByColumn[key]) ? progressCheckAllValuesByColumn[key] : [];
  const created = new Set(allValues);
  if (!progressCheckFilterState.selectedValuesByColumn) progressCheckFilterState.selectedValuesByColumn = {};
  progressCheckFilterState.selectedValuesByColumn[key] = created;
  return created;
}

/**
 * @function isProgressCheckColumnFiltered
 * @description Returns whether a specific column currently has an active value filter.
 */

function isProgressCheckColumnFiltered(column = 'subject') {
  const key = normalizeProgressCheckColumnKey(column, 'subject');
  const allValues = Array.isArray(progressCheckAllValuesByColumn[key]) ? progressCheckAllValuesByColumn[key] : [];
  const selected = getProgressCheckSelectedSet(key);
  if (!allValues.length) return false;
  if (selected.size !== allValues.length) return true;
  return allValues.some(value => !selected.has(value));
}

/**
 * @function doesProgressCheckRowMatchFilters
 * @description Checks row match against all active checkbox filters (AND logic).
 */

function doesProgressCheckRowMatchFilters(row, options = {}) {
  const exclude = normalizeProgressCheckColumnKey(options.excludeColumn || '', '');
  return PROGRESS_CHECK_COLUMN_KEYS.every(column => {
    if (exclude && column === exclude) return true;
    const selected = getProgressCheckSelectedSet(column);
    const value = normalizeProgressCheckFilterValue(getProgressCheckRowValue(row, column));
    return selected.has(value);
  });
}

/**
 * @function getProgressCheckFilteredRows
 * @description Returns rows filtered by all selected checkbox filters.
 */

function getProgressCheckFilteredRows(options = {}) {
  const rows = Array.isArray(progressCheckRowsCache) ? progressCheckRowsCache : [];
  return rows.filter(row => doesProgressCheckRowMatchFilters(row, options));
}

/**
 * @function compareProgressCheckRows
 * @description Compares two progress-check rows using active sort settings.
 */

function compareProgressCheckRows(a, b, sortColumn = 'subject', sortDirection = 'asc') {
  const key = normalizeProgressCheckColumnKey(sortColumn, 'subject');
  const dir = sortDirection === 'desc' ? -1 : 1;
  if (key === 'streak') {
    const av = Number(a?.streak || 0);
    const bv = Number(b?.streak || 0);
    if (av !== bv) return (av - bv) * dir;
  } else if (key === 'lastAnsweredAt') {
    const av = Number(a?.lastAnsweredTs || 0);
    const bv = Number(b?.lastAnsweredTs || 0);
    if (av !== bv) return (av - bv) * dir;
  } else {
    const av = normalizeProgressCheckFilterValue(getProgressCheckRowValue(a, key)).toLocaleLowerCase();
    const bv = normalizeProgressCheckFilterValue(getProgressCheckRowValue(b, key)).toLocaleLowerCase();
    const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
    if (cmp !== 0) return cmp * dir;
  }
  return String(a?.cardId || '').localeCompare(String(b?.cardId || '')) * dir;
}

/**
 * @function filterAndSortProgressCheckRows
 * @description Applies checkbox filters and active sorting to progress-check rows.
 */

function filterAndSortProgressCheckRows() {
  const rows = getProgressCheckFilteredRows();
  rows.sort((a, b) => compareProgressCheckRows(
    a,
    b,
    progressCheckFilterState.sortColumn,
    progressCheckFilterState.sortDirection
  ));
  return rows;
}

/**
 * @function renderProgressCheckHeaderStates
 * @description Updates header filter/sort button visuals.
 */

function renderProgressCheckHeaderStates() {
  document.querySelectorAll('.progress-check-table th[data-col]').forEach(th => {
    const column = normalizeProgressCheckColumnKey(th.getAttribute('data-col') || '', '');
    if (!column) return;
    const btn = th.querySelector('.progress-check-header-btn');
    const hasFilter = isProgressCheckColumnFiltered(column);
    const isSorted = progressCheckFilterState.sortColumn === column;
    th.classList.toggle('active-filter', hasFilter || isSorted);
    if (btn) {
      btn.classList.toggle('is-filtered', hasFilter);
      btn.classList.toggle('is-sorted', isSorted);
      const dirHint = isSorted ? ` (${String(progressCheckFilterState.sortDirection || 'asc').toUpperCase()})` : '';
      btn.title = `${PROGRESS_CHECK_COLUMN_LABELS[column] || column}: Filter/Sort${dirHint}`;
    }
  });
}

/**
 * @function setProgressCheckSort
 * @description Sets sort column and direction, then re-renders rows and header states.
 */

function setProgressCheckSort(column = 'subject', direction = 'asc') {
  progressCheckFilterState.sortColumn = normalizeProgressCheckColumnKey(column, 'subject');
  progressCheckFilterState.sortDirection = direction === 'desc' ? 'desc' : 'asc';
  renderProgressCheckRows();
  renderProgressCheckHeaderStates();
}

/**
 * @function toggleProgressCheckSortForColumn
 * @description Toggles ASC/DESC sorting for a clicked table header column.
 */

function toggleProgressCheckSortForColumn(column = 'subject') {
  const key = normalizeProgressCheckColumnKey(column, 'subject');
  if (progressCheckFilterState.sortColumn !== key) {
    setProgressCheckSort(key, 'asc');
    return;
  }
  const nextDirection = progressCheckFilterState.sortDirection === 'asc' ? 'desc' : 'asc';
  setProgressCheckSort(key, nextDirection);
}

/**
 * @function getHeaderMenuContextValues
 * @description Returns available and visible values for current header menu column.
 */

function getHeaderMenuContextValues(column = '', search = '') {
  const key = normalizeProgressCheckColumnKey(column, '');
  if (!key) return { all: [], visible: [] };
  const baseRows = getProgressCheckFilteredRows({ excludeColumn: key });
  const all = getProgressCheckDistinctValues(baseRows, key);
  const searchLower = String(search || '').trim().toLocaleLowerCase();
  const visible = searchLower
    ? all.filter(value => value.toLocaleLowerCase().includes(searchLower))
    : all;
  return { all, visible };
}

/**
 * @function closeProgressCheckHeaderMenu
 * @description Closes the Excel-style header filter dropdown menu.
 */

function closeProgressCheckHeaderMenu() {
  const menu = el('progressCheckHeaderMenu');
  if (!menu) return;
  menu.classList.add('hidden');
  progressCheckHeaderMenuState = {
    column: '',
    search: '',
    trigger: null
  };
}

/**
 * @function positionProgressCheckHeaderMenu
 * @description Positions the header filter menu near its trigger button.
 */

function positionProgressCheckHeaderMenu() {
  const menu = el('progressCheckHeaderMenu');
  const trigger = progressCheckHeaderMenuState.trigger;
  if (!menu || !trigger) return;
  const rect = trigger.getBoundingClientRect();
  const spacing = 6;
  const menuRect = menu.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + spacing;
  if (left + menuRect.width > window.innerWidth - spacing) {
    left = Math.max(spacing, window.innerWidth - menuRect.width - spacing);
  }
  if (top + menuRect.height > window.innerHeight - spacing) {
    top = Math.max(spacing, rect.top - menuRect.height - spacing);
  }
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

/**
 * @function renderProgressCheckHeaderMenu
 * @description Renders dropdown content for the currently open header column.
 */

function renderProgressCheckHeaderMenu() {
  const menu = el('progressCheckHeaderMenu');
  const titleEl = el('progressCheckHeaderMenuTitle');
  const valuesWrap = el('progressCheckHeaderMenuValues');
  const selectAll = el('progressCheckSelectAllValues');
  const valueSearch = el('progressCheckValueSearch');
  const sortAscBtn = el('progressCheckSortAscBtn');
  const sortDescBtn = el('progressCheckSortDescBtn');
  const key = normalizeProgressCheckColumnKey(progressCheckHeaderMenuState.column, '');
  if (!menu || !titleEl || !valuesWrap || !selectAll || !valueSearch || !sortAscBtn || !sortDescBtn || !key) return;

  const label = PROGRESS_CHECK_COLUMN_LABELS[key] || key;
  titleEl.textContent = `Filter: ${label}`;
  valueSearch.value = String(progressCheckHeaderMenuState.search || '');
  const { all, visible } = getHeaderMenuContextValues(key, progressCheckHeaderMenuState.search);
  const selected = getProgressCheckSelectedSet(key);
  const allChecked = all.length > 0 && all.every(value => selected.has(value));
  selectAll.checked = allChecked;

  sortAscBtn.classList.toggle('active', progressCheckFilterState.sortColumn === key && progressCheckFilterState.sortDirection === 'asc');
  sortDescBtn.classList.toggle('active', progressCheckFilterState.sortColumn === key && progressCheckFilterState.sortDirection === 'desc');
  sortAscBtn.dataset.column = key;
  sortDescBtn.dataset.column = key;

  valuesWrap.innerHTML = '';
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'tiny';
    empty.textContent = 'No values available.';
    valuesWrap.appendChild(empty);
  } else {
    visible.forEach(value => {
      const option = document.createElement('label');
      option.className = 'progress-check-value-option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = selected.has(value);
      input.dataset.column = key;
      input.value = value;
      const text = document.createElement('span');
      text.textContent = value;
      option.append(input, text);
      valuesWrap.appendChild(option);
    });
  }
  menu.classList.remove('hidden');
  positionProgressCheckHeaderMenu();
}

/**
 * @function openProgressCheckHeaderMenu
 * @description Opens the Excel-style header menu for a specific column.
 */

function openProgressCheckHeaderMenu(column = '', trigger = null) {
  const key = normalizeProgressCheckColumnKey(column, '');
  if (!key || !trigger) return;
  progressCheckHeaderMenuState = {
    column: key,
    search: '',
    trigger
  };
  renderProgressCheckHeaderMenu();
}

/**
 * @function renderProgressCheckRows
 * @description Renders filtered rows into the progress check table and updates metadata.
 */

function renderProgressCheckRows() {
  const meta = el('progressCheckMeta');
  const body = el('progressCheckTableBody');
  if (!meta || !body) return;
  const allRows = Array.isArray(progressCheckRowsCache) ? progressCheckRowsCache : [];
  const rows = filterAndSortProgressCheckRows();

  body.innerHTML = '';
  if (!allRows.length) {
    body.innerHTML = '<tr><td colspan="9" class="tiny">No cards available.</td></tr>';
    meta.textContent = '0 cards';
    renderProgressCheckHeaderStates();
    return;
  }
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="9" class="tiny">No cards match the current filters.</td></tr>';
    meta.textContent = `0 / ${allRows.length} cards`;
    renderProgressCheckHeaderStates();
    return;
  }

  let answeredCount = 0;
  let masteredCount = 0;
  rows.forEach(row => {
    if (row.attemptsTotal > 0) answeredCount += 1;
    if (row.currentKey === 'mastered') masteredCount += 1;

    const tr = document.createElement('tr');
    const questionCell = document.createElement('td');
    questionCell.className = 'progress-question-cell';
    questionCell.textContent = row.question;

    const currentCell = document.createElement('td');
    currentCell.className = 'progress-current-cell';
    currentCell.appendChild(buildProgressStateChip({ key: row.currentKey, label: row.currentLabel }));

    const historyCell = document.createElement('td');
    historyCell.className = 'progress-history-cell';
    historyCell.textContent = row.history;

    const totalsCell = document.createElement('td');
    totalsCell.textContent = row.totalsText;

    const streakCell = document.createElement('td');
    streakCell.textContent = String(row.streak);

    const lastGradeCell = document.createElement('td');
    lastGradeCell.textContent = row.lastGrade;

    const lastAnsweredCell = document.createElement('td');
    lastAnsweredCell.textContent = row.lastAnsweredAt;

    const subjectCell = document.createElement('td');
    subjectCell.textContent = row.subject;
    const topicCell = document.createElement('td');
    topicCell.textContent = row.topic;

    tr.append(
      subjectCell,
      topicCell,
      questionCell,
      currentCell,
      streakCell,
      lastGradeCell,
      lastAnsweredCell,
      totalsCell,
      historyCell
    );
    body.appendChild(tr);
  });

  const filteredCardWord = rows.length === 1 ? 'card' : 'cards';
  meta.textContent = `${rows.length} / ${allRows.length} ${filteredCardWord} • ${answeredCount} answered • ${masteredCount} mastered`;
  renderProgressCheckHeaderStates();
}

/**
 * @function renderProgressCheckTable
 * @description Renders progress check table.
 */

async function renderProgressCheckTable() {
  const meta = el('progressCheckMeta');
  const body = el('progressCheckTableBody');
  if (!meta || !body) return;
  meta.textContent = 'Loading...';
  body.innerHTML = '<tr><td colspan="9" class="tiny">Loading...</td></tr>';

  const [subjects, topics, cards, progressRows] = await Promise.all([
    getAll('subjects'),
    getAll('topics'),
    getAll('cards'),
    getAll('progress')
  ]);
  const subjectById = new Map(
    (subjects || []).map(subject => [String(subject?.id || '').trim(), String(subject?.name || '').trim()])
  );
  const topicById = new Map(
    (topics || []).map(topic => [String(topic?.id || '').trim(), topic])
  );
  const progressByCardId = new Map(
    (progressRows || []).map(row => [String(row?.cardId || '').trim(), row])
  );

  const cardRows = Array.isArray(cards) ? cards : [];
  progressCheckRowsCache = cardRows.map(card => {
    const cardId = String(card?.id || '').trim();
    const topic = topicById.get(String(card?.topicId || '').trim()) || {};
    const subjectName = String(subjectById.get(String(topic?.subjectId || '').trim()) || 'Unknown subject');
    const topicName = String(topic?.name || 'Unknown topic');
    const record = progressByCardId.get(cardId) || null;
    const current = getCurrentProgressState(record, cardId);
    const history = getProgressHistoryLines(record, cardId);
    const latest = getLatestProgressDayEntry(record, cardId);
    const rawLastAnswered = String(latest?.day?.lastAnsweredAt || record?.lastAnsweredAt || '').trim();
    const parsedTs = Date.parse(rawLastAnswered);
    const lastAnsweredTs = Number.isFinite(parsedTs) ? parsedTs : 0;
    return {
      cardId,
      subject: subjectName,
      topic: topicName,
      question: getQuestionPreviewText(card),
      currentKey: current.key,
      currentLabel: current.label,
      streak: current.streak,
      lastGrade: current.lastGrade,
      lastAnsweredAt: current.lastAnsweredAt,
      lastAnsweredTs,
      totalsText: `${current.totals.correct}/${current.totals.partial}/${current.totals.wrong}`,
      history,
      attemptsTotal: current.attemptsTotal
    };
  });
  initProgressCheckFilterState();
  renderProgressCheckRows();
  if (progressCheckHeaderMenuState.column) renderProgressCheckHeaderMenu();
}

/**
 * @function openProgressCheckDialog
 * @description Opens the progress check dialog.
 */

async function openProgressCheckDialog() {
  const dialog = el('progressCheckDialog');
  if (!dialog) return;
  closeProgressCheckHeaderMenu();
  await renderProgressCheckTable();
  showDialog(dialog);
}

/**
 * @function wireProgressCheckHeaderMenus
 * @description Wires Excel-style header sort/filter menus for the progress table.
 */

function wireProgressCheckHeaderMenus() {
  const table = el('progressCheckTable');
  const menu = el('progressCheckHeaderMenu');
  const valueSearch = el('progressCheckValueSearch');
  const selectAll = el('progressCheckSelectAllValues');
  const sortAscBtn = el('progressCheckSortAscBtn');
  const sortDescBtn = el('progressCheckSortDescBtn');
  if (!table || !menu || !valueSearch || !selectAll || !sortAscBtn || !sortDescBtn) return;

  table.querySelectorAll('th[data-col]').forEach(th => {
    const column = normalizeProgressCheckColumnKey(th.getAttribute('data-col') || '', '');
    if (!column) return;
    const btn = th.querySelector('.progress-check-header-btn');
    if (btn) {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const isSameColumn = progressCheckHeaderMenuState.column === column && !menu.classList.contains('hidden');
        if (isSameColumn) {
          closeProgressCheckHeaderMenu();
          return;
        }
        openProgressCheckHeaderMenu(column, btn);
      });
    }
    th.addEventListener('click', e => {
      if (e.target instanceof Element && e.target.closest('.progress-check-header-btn')) return;
      toggleProgressCheckSortForColumn(column);
      if (progressCheckHeaderMenuState.column) renderProgressCheckHeaderMenu();
    });
  });

  sortAscBtn.addEventListener('click', () => {
    const column = normalizeProgressCheckColumnKey(progressCheckHeaderMenuState.column, '');
    if (!column) return;
    setProgressCheckSort(column, 'asc');
    renderProgressCheckHeaderMenu();
  });

  sortDescBtn.addEventListener('click', () => {
    const column = normalizeProgressCheckColumnKey(progressCheckHeaderMenuState.column, '');
    if (!column) return;
    setProgressCheckSort(column, 'desc');
    renderProgressCheckHeaderMenu();
  });

  valueSearch.addEventListener('input', () => {
    progressCheckHeaderMenuState.search = String(valueSearch.value || '').trim();
    renderProgressCheckHeaderMenu();
  });

  selectAll.addEventListener('change', () => {
    const column = normalizeProgressCheckColumnKey(progressCheckHeaderMenuState.column, '');
    if (!column) return;
    const selected = getProgressCheckSelectedSet(column);
    const { all } = getHeaderMenuContextValues(column, '');
    if (selectAll.checked) {
      selected.clear();
      all.forEach(value => selected.add(value));
    } else {
      selected.clear();
    }
    renderProgressCheckRows();
    renderProgressCheckHeaderMenu();
  });

  menu.addEventListener('change', e => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type !== 'checkbox') return;
    if (!target.dataset.column) return;
    const column = normalizeProgressCheckColumnKey(target.dataset.column || '', '');
    if (!column) return;
    const value = normalizeProgressCheckFilterValue(target.value || '');
    const selected = getProgressCheckSelectedSet(column);
    if (target.checked) selected.add(value);
    else selected.delete(value);
    renderProgressCheckRows();
    renderProgressCheckHeaderMenu();
  });

  document.addEventListener('click', e => {
    if (menu.classList.contains('hidden')) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest('#progressCheckHeaderMenu')) return;
    if (target.closest('.progress-check-header-btn')) return;
    closeProgressCheckHeaderMenu();
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (menu.classList.contains('hidden')) return;
    closeProgressCheckHeaderMenu();
  });

  window.addEventListener('resize', () => {
    if (!menu.classList.contains('hidden')) positionProgressCheckHeaderMenu();
  });
}

/**
 * @function formatDurationLabel
 * @description Formats duration label.
 */

function formatDurationLabel(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * @function updateSessionRepeatCounter
 * @description Updates session repeat counter.
 */

function updateSessionRepeatCounter() {
  const valueEl = el('sessionRepeatSizeValue');
  const minusBtn = el('sessionRepeatMinus');
  const plusBtn = el('sessionRepeatPlus');
  const startBtn = el('startAnotherSessionBtn');
  if (valueEl) {
    const current = sessionRepeatState.remaining > 0 ? sessionRepeatState.size : 0;
    valueEl.textContent = `${current} / ${sessionRepeatState.remaining}`;
  }
  if (minusBtn) minusBtn.disabled = sessionRepeatState.remaining <= 0 || sessionRepeatState.size <= 1;
  if (plusBtn) plusBtn.disabled = sessionRepeatState.remaining <= 0 || sessionRepeatState.size >= sessionRepeatState.remaining;
  if (startBtn) startBtn.disabled = sessionRepeatState.remaining <= 0;
}

/**
 * @function getSessionCompleteConfettiEmitter
 * @description Returns a canvas-confetti emitter bound to the session-complete dialog canvas.
 */

function getSessionCompleteConfettiEmitter() {
  if (typeof window.confetti !== 'function') return null;
  const canvas = el('sessionCompleteConfettiCanvas');
  if (!(canvas instanceof HTMLCanvasElement)) return null;
  if (!sessionCompleteConfettiEmitter) {
    sessionCompleteConfettiEmitter = window.confetti.create(canvas, {
      resize: true,
      useWorker: true
    });
  }
  return sessionCompleteConfettiEmitter;
}

/**
 * @function playSessionCompleteConfetti
 * @description Plays a short confetti burst from bottom-center on the session-complete dialog layer.
 */

function playSessionCompleteConfetti() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  const emit = getSessionCompleteConfettiEmitter();
  if (!emit) return;

  if (typeof emit.reset === 'function') emit.reset();

  const origin = { x: 0.5, y: 1.02 };
  const colors = ['#22c55e', '#38bdf8', '#f59e0b', '#ef4444', '#a78bfa', '#facc15', '#14b8a6'];
  const base = {
    origin,
    angle: 90,
    spread: 75,
    startVelocity: 48,
    gravity: 1.05,
    ticks: 220,
    decay: 0.93,
    scalar: 1,
    colors
  };

  emit({ ...base, particleCount: 120 });
  setTimeout(() => emit({ ...base, particleCount: 90, spread: 95, startVelocity: 42, scalar: 0.92 }), 140);
  setTimeout(() => emit({ ...base, particleCount: 75, spread: 110, startVelocity: 36, scalar: 1.06 }), 280);
}

/**
 * @function openSessionCompleteDialog
 * @description Opens the session complete dialog.
 */

async function openSessionCompleteDialog() {
  const topicIds = sessionRunState.topicIds.length
    ? [...sessionRunState.topicIds]
    : Array.from(selectedTopicIds);
  const scopedCardIds = Array.isArray(sessionRunState.cardIds)
    ? Array.from(new Set(sessionRunState.cardIds.map(cardId => String(cardId || '').trim()).filter(Boolean)))
    : [];
  const masteredIds = new Set(
    (Array.isArray(session.mastered) ? session.mastered : [])
      .map(card => String(card?.id || '').trim())
      .filter(Boolean)
  );
  const candidateCardIds = scopedCardIds.filter(cardId => !masteredIds.has(cardId));
  let remainingCardIds = [];
  if (candidateCardIds.length) {
    // Fast path: for already scoped cards, remaining-session eligibility depends on progress state only.
    await ensureProgressForCardIds(candidateCardIds, { payloadLabel: 'session-repeat-progress' });
    remainingCardIds = candidateCardIds.filter(cardId => cardMatchesSessionFilter(cardId, sessionRunState.filters));
  } else if (scopedCardIds.length) {
    remainingCardIds = [];
  } else {
    const remainingCards = await getEligibleSessionCardsByTopicIds(topicIds, sessionRunState.filters);
    if (masteredIds.size) {
      remainingCardIds = remainingCards
        .map(card => String(card?.id || '').trim())
        .filter(cardId => cardId && !masteredIds.has(cardId));
    } else {
      remainingCardIds = remainingCards
        .map(card => String(card?.id || '').trim())
        .filter(Boolean);
    }
  }
  remainingCardIds = Array.from(new Set(remainingCardIds));
  const durationMs = sessionRunState.startedAt > 0 ? Date.now() - sessionRunState.startedAt : 0;
  const remainingCount = remainingCardIds.length;
  sessionRepeatState.topicIds = topicIds;
  sessionRepeatState.cardIds = remainingCardIds;
  sessionRepeatState.filters = normalizeSessionFilters(sessionRunState.filters);
  sessionRepeatState.mode = sessionRunState.mode || 'default';
  sessionRepeatState.remaining = remainingCount;
  sessionRepeatState.size = remainingCount > 0
    ? Math.min(Math.max(sessionSize, 1), remainingCount)
    : 0;

  const durationEl = el('sessionCompleteDuration');
  if (durationEl) durationEl.textContent = formatDurationLabel(durationMs);
  const remainingEl = el('sessionCompleteRemaining');
  if (remainingEl) remainingEl.textContent = String(sessionRepeatState.remaining);
  const messageEl = el('sessionCompleteMessage');
  if (messageEl) {
    if (sessionRepeatState.remaining > 0) {
      messageEl.textContent = 'Great work! You can continue with the remaining cards.';
    } else {
      messageEl.textContent = 'Great work! No remaining cards match the current filter.';
    }
  }
  updateSessionRepeatCounter();
  showDialog(el('sessionCompleteDialog'));
  requestAnimationFrame(() => playSessionCompleteConfetti());
}

/**
 * @function dismissSessionCompleteDialog
 * @description Closes the completion dialog and routes back to the correct overview.
 */

function dismissSessionCompleteDialog() {
  if (sessionCompleteConfettiEmitter && typeof sessionCompleteConfettiEmitter.reset === 'function') {
    sessionCompleteConfettiEmitter.reset();
  }
  closeDialog(el('sessionCompleteDialog'));
  closeStudyImageLightbox();
  setDeckSelectionMode(false);
  session.active = false;
  el('cardsOverviewSection')?.classList.remove('hidden');
  el('studySessionSection')?.classList.add('hidden');
  renderSessionPills();
  const returnToHome = sessionRepeatState.mode === 'daily-review';
  setView(returnToHome ? 0 : 1);
  if (returnToHome) {
    void refreshDailyReviewHomePanel({ useExisting: false });
  } else if (selectedSubject) {
    void refreshTopicSessionMeta();
  }
}

// ============================================================================
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
        persistSession: false,
        autoRefreshToken: false
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

async function listStoreRecordsSupabase(store = '') {
  const safeStore = String(store || '').trim();
  const keyField = getStoreKeyField(safeStore);
  if (!safeStore || !keyField || !supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select('record_key,payload,updated_at')
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

async function getStoreRecordSupabase(store = '', key = '') {
  const safeStore = String(store || '').trim();
  const safeKey = String(key || '').trim();
  const keyField = getStoreKeyField(safeStore);
  if (!safeStore || !safeKey || !keyField || !supabaseClient) return null;
  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select('record_key,payload')
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

async function upsertStoreRecordSupabase(store = '', payload = null) {
  const safeStore = String(store || '').trim();
  const keyField = getStoreKeyField(safeStore);
  if (!safeStore || !keyField || !supabaseClient) return null;
  const row = (payload && typeof payload === 'object') ? payload : null;
  const key = String(row?.[keyField] ?? '').trim();
  if (!row || !key) {
    const error = new Error(`Missing key "${keyField}" for store "${safeStore}"`);
    error.status = 400;
    throw error;
  }
  const { error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .upsert({
      store: safeStore,
      record_key: key,
      payload: row,
      updated_at: new Date().toISOString()
    }, { onConflict: 'store,record_key' });
  assertSupabaseSuccess(error, `Failed to upsert record "${safeStore}/${key}".`);
  return row;
}

/**
 * @function deleteStoreRecordSupabase
 * @description Deletes one store record in Supabase by key.
 */

async function deleteStoreRecordSupabase(store = '', key = '') {
  const safeStore = String(store || '').trim();
  const safeKey = String(key || '').trim();
  if (!safeStore || !safeKey || !supabaseClient) return;
  const { error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .delete()
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

async function queryStoreCountSupabase(store = '') {
  const safeStore = String(store || '').trim();
  if (!safeStore || !supabaseClient) return 0;
  const { count, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select('record_key', { head: true, count: 'exact' })
    .eq('store', safeStore);
  assertSupabaseSuccess(error, `Failed to count records for store "${safeStore}".`);
  return Number(count || 0);
}

/**
 * @function queryCardsSupabase
 * @description Reads cards and applies API-compatible query filters.
 */

async function queryCardsSupabase(searchParams) {
  const topicIds = parseApiFilterValues(searchParams, 'topicId');
  const cardIds = parseApiFilterValues(searchParams, 'cardId');
  const fieldsRaw = String(searchParams.get('fields') || '').trim();
  const fields = fieldsRaw
    .split(',')
    .map(field => field.trim())
    .filter(Boolean);
  const lightweightFields = new Set(['id', 'topicId']);
  const useLightweightProjection = fields.length > 0 && fields.every(field => lightweightFields.has(field));

  let query = supabaseClient
    .from(SUPABASE_TABLE)
    .select(useLightweightProjection ? 'record_key,topic_id' : 'record_key,payload')
    .eq('store', 'cards');

  if (cardIds.length === 1) query = query.eq('record_key', cardIds[0]);
  else if (cardIds.length > 1) query = query.in('record_key', cardIds);

  if (topicIds.length === 1) query = query.eq('topic_id', topicIds[0]);
  else if (topicIds.length > 1) query = query.in('topic_id', topicIds);

  const { data, error } = await query.order('updated_at', { ascending: true });
  assertSupabaseSuccess(error, 'Failed to query cards.');
  const rows = Array.isArray(data) ? data : [];

  if (useLightweightProjection) {
    return rows.map(row => {
      const next = {};
      if (fields.includes('id')) next.id = String(row?.record_key || '').trim();
      if (fields.includes('topicId')) next.topicId = String(row?.topic_id || '').trim();
      return next;
    });
  }

  const cards = rows.map(row => normalizeStorePayloadRow(row, 'id'));
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

async function queryProgressSupabase(searchParams) {
  const cardIds = parseApiFilterValues(searchParams, 'cardId');
  let query = supabaseClient
    .from(SUPABASE_TABLE)
    .select('record_key,payload')
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

async function queryTopicsSupabase(searchParams) {
  const includeCounts = String(searchParams.get('includeCounts') || '') === '1';
  const subjectIds = parseApiFilterValues(searchParams, 'subjectId');
  const rows = await listStoreRecordsSupabase('topics');
  const topics = subjectIds.length
    ? rows.filter(topic => subjectIds.includes(String(topic?.subjectId || '').trim()))
    : rows;
  if (!includeCounts) return topics;

  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE)
    .select('topic_id')
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

async function queryStatsSupabase() {
  const [subjects, topics, cards] = await Promise.all([
    queryStoreCountSupabase('subjects'),
    queryStoreCountSupabase('topics'),
    queryStoreCountSupabase('cards')
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

  try {
    if (method === 'GET') {
      if (!parts.length || parts[0] === 'health') {
        await supabaseHealthcheck();
        return { ok: true };
      }
      if (parts.length === 1 && parts[0] === 'stats') {
        return await queryStatsSupabase();
      }
      if (parts.length === 1) {
        const store = parts[0];
        if (!getStoreKeyField(store)) {
          const error = new Error('Request failed (404)');
          error.status = 404;
          throw error;
        }
        if (store === 'topics') return await queryTopicsSupabase(searchParams);
        if (store === 'cards') return await queryCardsSupabase(searchParams);
        if (store === 'progress') return await queryProgressSupabase(searchParams);
        return await listStoreRecordsSupabase(store);
      }
      if (parts.length === 2) {
        const [store, key] = parts;
        if (!getStoreKeyField(store)) {
          const error = new Error('Request failed (404)');
          error.status = 404;
          throw error;
        }
        const row = await getStoreRecordSupabase(store, key);
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
      return await upsertStoreRecordSupabase(store, payload);
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
      await deleteStoreRecordSupabase(store, key);
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
// Device Interactions + Global UX Guards
// ============================================================================
/**
* @function triggerHaptic
 * @description Triggers device haptic feedback when supported by the current platform.
 */

function triggerHaptic(kind = 'light') {
  const style = kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT';

  // Telegram WebApp haptics (if embedded)
  try {
    const tg = window.Telegram?.WebApp?.HapticFeedback;
    if (tg?.impactOccurred) {
      const m = kind === 'heavy' ? 'heavy' : kind === 'medium' ? 'medium' : 'light';
      tg.impactOccurred(m);
      return;
    }
  } catch (_) { }

  // Capacitor haptics (if embedded in native shell)
  try {
    const haptics = window.Capacitor?.Plugins?.Haptics;
    if (haptics?.impact) {
      haptics.impact({ style });
      return;
    }
  } catch (_) { }

  // Cordova TapticEngine (if available)
  try {
    const taptic = window.TapticEngine;
    if (taptic?.impact) {
      const m = kind === 'heavy' ? 'heavy' : kind === 'medium' ? 'medium' : 'light';
      taptic.impact(m);
      return;
    }
  } catch (_) { }

  // Browser vibration fallback (Android browsers)
  try {
    if (!navigator.vibrate) return;
    const duration = kind === 'medium' ? 14 : kind === 'heavy' ? 20 : 8;
    navigator.vibrate(duration);
  } catch (_) { }
}

/**
 * @function wireHapticFeedback
 * @description Wires haptic feedback.
 */

function wireHapticFeedback() {
  const supportsTouch = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
  if (!supportsTouch) return;

  let lastPulse = 0;
  const pulse = target => {
    if (!target) return;
    if (target.matches(':disabled') || target.getAttribute('aria-disabled') === 'true') return;
    const now = Date.now();
    if (now - lastPulse < 60) return;
    lastPulse = now;
    const kind = target.dataset.grade ? 'medium' : 'light';
    triggerHaptic(kind);
  };

  document.addEventListener('touchstart', e => {
    const target = e.target.closest('button, .btn');
    pulse(target);
  }, { passive: true });

  document.addEventListener('click', e => {
    const target = e.target.closest('button, .btn');
    pulse(target);
  }, true);
}

/**
 * @function wireNoZoomGuards
 * @description Wires no zoom guards.
 */

function wireNoZoomGuards() {
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(evt => {
    document.addEventListener(evt, e => e.preventDefault(), { passive: false });
  });

  let lastTouchEnd = 0;
  document.addEventListener('touchend', e => {
    if (e.target.closest('input, textarea, select, [contenteditable=\"true\"]')) return;
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  document.addEventListener('wheel', e => {
    if (e.ctrlKey) e.preventDefault();
  }, { passive: false });

  document.addEventListener('keydown', e => {
    const zoomKeys = ['+', '-', '=', '0'];
    if ((e.ctrlKey || e.metaKey) && zoomKeys.includes(e.key)) e.preventDefault();
  });
}

const uid = () => {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
    return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
};

// ============================================================================
// App Navigation + Layout State
// ============================================================================
/**
* @function showDialog
 * @description Opens a dialog and applies shared modal behavior.
 */

function showDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

/**
 * @function closeDialog
 * @description Closes a dialog and clears modal state.
 */

function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

let currentView = 0;

/**
 * @function syncSidebarHiddenState
 * @description Synchronizes sidebar hidden state.
 */

function syncSidebarHiddenState(step = currentView) {
  const studySection = el('studySessionSection');
  const hideForStudy = step === 2 && studySection && !studySection.classList.contains('hidden');
  const hideSidebar = step === 3 || hideForStudy;
  document.body.classList.toggle('sidebar-hidden', hideSidebar);
  if (hideSidebar) document.body.classList.remove('sidebar-open');
}

/**
 * @function setView
 * @description Sets the view.
 */

function setView(step = 0) {
  currentView = step;
  el('track').style.transform = `translateX(${-100 * step / 4}%)`;
  if (step !== 3) {
    document.querySelector('#editorPanel .editor-shell')?.classList.remove('sidebar-open');
  }
  syncSidebarHiddenState(step);
}

// ============================================================================
// Text Rendering (Markdown, Tables, KaTeX)
// ============================================================================
/**
* @function escapeHTML
 * @description Escapes HTML special characters for safe rendering.
 */

function escapeHTML(str = '') {
  return str.replace(/[&<>"]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[s]));
}

/**
 * @function isEscaped
 * @description Returns whether escaped.
 */

function isEscaped(str, idx) {
  let count = 0;
  for (let i = idx - 1; i >= 0 && str[i] === '\\'; i--) count++;
  return count % 2 === 1;
}

/**
 * @function normalizeTextAlign
 * @description Normalizes text align.
 */

function normalizeTextAlign(value = '') {
  const v = String(value || '').toLowerCase();
  if (v === 'center' || v === 'justify') return v;
  return 'left';
}

/**
 * @function hasActiveTextSelection
 * @description Returns whether active text selection.
 */

function hasActiveTextSelection() {
  const selection = window.getSelection ? window.getSelection() : null;
  if (!selection || selection.rangeCount < 1 || selection.isCollapsed) return false;
  return true;
}

/**
 * @function tokenizeMathSegments
 * @description Handles tokenize math segments logic.
 */

function tokenizeMathSegments(raw = '') {
  const tokens = [];
  let out = '';
  let i = 0;
  while (i < raw.length) {
    if (raw.startsWith('$$', i) && !isEscaped(raw, i)) {
      let j = i + 2;
      while (j < raw.length) {
        if (raw[j] === '$' && raw[j + 1] === '$' && !isEscaped(raw, j)) break;
        j++;
      }
      if (j < raw.length) {
        const tokenId = tokens.length;
        tokens.push(raw.slice(i, j + 2));
        out += `@@MATH${tokenId}@@`;
        i = j + 2;
        continue;
      }
    }
    if (raw[i] === '$' && !isEscaped(raw, i)) {
      let j = i + 1;
      while (j < raw.length) {
        if (raw[j] === '$' && !isEscaped(raw, j)) break;
        j++;
      }
      if (j < raw.length) {
        const tokenId = tokens.length;
        tokens.push(raw.slice(i, j + 1));
        out += `@@MATH${tokenId}@@`;
        i = j + 1;
        continue;
      }
    }
    if (raw.startsWith('\\[', i)) {
      const j = raw.indexOf('\\]', i + 2);
      if (j !== -1) {
        const tokenId = tokens.length;
        tokens.push(raw.slice(i, j + 2));
        out += `@@MATH${tokenId}@@`;
        i = j + 2;
        continue;
      }
    }
    if (raw.startsWith('\\(', i)) {
      const j = raw.indexOf('\\)', i + 2);
      if (j !== -1) {
        const tokenId = tokens.length;
        tokens.push(raw.slice(i, j + 2));
        out += `@@MATH${tokenId}@@`;
        i = j + 2;
        continue;
      }
    }
    out += raw[i];
    i += 1;
  }
  return { text: out, tokens };
}

/**
 * @function applyInlineMarkdown
 * @description Applies inline markdown.
 */

function applyInlineMarkdown(raw = '') {
  let t = escapeHTML(raw);
  t = t.replace(/\[(.*?)\]\{(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\}/g, '<span style="color:$2">$1</span>');
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/__(.+?)__/g, '<u>$1</u>');
  t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
  t = t.replace(/-->/g, '<span class="inline-arrow">&rarr;</span>');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  return t;
}

/**
 * @function restoreMathTokens
 * @description Handles restore math tokens logic.
 */

function restoreMathTokens(html = '', tokens = []) {
  return html.replace(/@@MATH(\d+)@@/g, (_, idx) => {
    const token = tokens[Number(idx)];
    return token ? escapeHTML(token) : `@@MATH${idx}@@`;
  });
}

/**
 * @function parseListLineMeta
 * @description Parses list line meta.
 */

function parseListLineMeta(line = '') {
  const indent = (line.match(/^\s*/) || [''])[0];
  const rest = line.slice(indent.length);

  const orderedMatch = rest.match(/^((?:\d+\.)+)(?:\s+(.*))?$/);
  if (orderedMatch) {
    const sequence = orderedMatch[1]
      .split('.')
      .filter(Boolean)
      .map(num => Number(num))
      .filter(num => Number.isFinite(num) && num >= 0);
    if (sequence.length) {
      return {
        type: 'ol',
        indent,
        text: orderedMatch[2] ?? '',
        sequence
      };
    }
  }

  const unorderedMatch = rest.match(/^([-*•◦▪])(?:\s+(.*))?$/);
  if (unorderedMatch) {
    return {
      type: 'ul',
      indent,
      marker: unorderedMatch[1],
      text: unorderedMatch[2] ?? ''
    };
  }
  return null;
}

/**
 * @function formatOrderedSequence
 * @description Formats ordered sequence.
 */

function formatOrderedSequence(sequence = []) {
  const safe = Array.isArray(sequence) ? sequence.filter(n => Number.isFinite(n)) : [];
  if (!safe.length) return '1.';
  return `${safe.join('.')}.`;
}

/**
 * @function getNestedBulletMarker
 * @description Returns the nested bullet marker.
 */

function getNestedBulletMarker(marker = '-') {
  if (marker === '-' || marker === '*') return '•';
  if (marker === '•') return '◦';
  if (marker === '◦') return '▪';
  return '▪';
}

/**
 * @function getOutdentedBulletMarker
 * @description Returns the outdented bullet marker.
 */

function getOutdentedBulletMarker(marker = '-') {
  if (marker === '▪') return '◦';
  if (marker === '◦') return '•';
  if (marker === '•') return '-';
  if (marker === '*') return '-';
  return '-';
}

/**
 * @function getPreviousNonEmptyLineMeta
 * @description Returns the previous non empty line meta.
 */

function getPreviousNonEmptyLineMeta(value = '', currentLineStart = 0) {
  let cursor = currentLineStart - 1;
  while (cursor >= 0) {
    const prevLineStart = value.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1;
    const prevLine = value.slice(prevLineStart, cursor + 1);
    if (prevLine.trim()) return parseListLineMeta(prevLine);
    cursor = prevLineStart - 1;
  }
  return null;
}

/**
 * @function getListDepth
 * @description Returns the list depth.
 */

function getListDepth(meta) {
  if (!meta) return 0;
  const indentDepth = Math.floor(String(meta.indent || '').replace(/\t/g, '  ').length / 2);
  if (meta.type === 'ol') {
    const seqDepth = Math.max(0, (meta.sequence?.length || 1) - 1);
    return Math.max(indentDepth, seqDepth);
  }
  return indentDepth;
}

/**
 * @function splitMarkdownTableRow
 * @description Handles split markdown table row logic.
 */

function splitMarkdownTableRow(line = '') {
  const trimmed = String(line || '').trim();
  if (!trimmed || !trimmed.includes('|')) return null;
  let core = trimmed;
  if (core.startsWith('|')) core = core.slice(1);
  if (core.endsWith('|')) core = core.slice(0, -1);
  const cells = [];
  let current = '';
  for (let i = 0; i < core.length; i++) {
    const char = core[i];
    const prev = i > 0 ? core[i - 1] : '';
    if (char === '|' && prev !== '\\') {
      cells.push(current.trim().replace(/\\\|/g, '|'));
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim().replace(/\\\|/g, '|'));
  if (!cells.length) return null;
  return cells;
}

/**
 * @function parseMarkdownTableAlignments
 * @description Parses markdown table alignments.
 */

function parseMarkdownTableAlignments(line = '', expectedCols = 0) {
  const cells = splitMarkdownTableRow(line);
  if (!cells || (expectedCols > 0 && cells.length !== expectedCols)) return null;
  const alignments = cells.map(cell => {
    const marker = String(cell || '').replace(/\s+/g, '');
    if (!/^:?-{3,}:?$/.test(marker)) return null;
    if (marker.startsWith(':') && marker.endsWith(':')) return 'center';
    if (marker.endsWith(':')) return 'right';
    return 'left';
  });
  if (alignments.some(align => !align)) return null;
  return alignments;
}

/**
 * @function parseTableCellMetaToken
 * @description Parses supported table cell tokens (align/span/merge) from the beginning of a cell.
 */

function parseTableCellMetaToken(cell = '') {
  let rest = String(cell || '');
  let align = null;
  let rowSpan = 1;
  let colSpan = 1;
  let covered = false;

  while (true) {
    const match = rest.match(/^\s*\[\[(align:(left|center|right)|span:(\d+)x(\d+)|merge)\]\]\s*/i);
    if (!match) break;
    const token = String(match[1] || '').toLowerCase();
    if (token === 'merge') {
      covered = true;
    } else if (token.startsWith('align:')) {
      align = normalizeTextAlign(match[2] || 'left');
    } else if (token.startsWith('span:')) {
      rowSpan = Math.max(1, Math.trunc(Number(match[3]) || 1));
      colSpan = Math.max(1, Math.trunc(Number(match[4]) || 1));
    }
    rest = rest.slice(match[0].length);
  }

  return {
    align,
    rowSpan,
    colSpan,
    covered,
    text: rest
  };
}

/**
 * @function parseTableCellAlignmentToken
 * @description Parses table cell alignment token.
 */

function parseTableCellAlignmentToken(cell = '') {
  const parsed = parseTableCellMetaToken(cell);
  return {
    align: parsed.align,
    text: parsed.text
  };
}

/**
 * @function renderMarkdownTableHtml
 * @description Renders markdown table HTML.
 */

function renderMarkdownTableHtml(headerCells = [], alignments = [], bodyRows = []) {
  const safeHeader = Array.isArray(headerCells) ? headerCells : [];
  const safeBody = Array.isArray(bodyRows) ? bodyRows : [];
  const cols = safeHeader.length;
  if (!cols) return '';

  const headerSkip = new Set();
  const th = [];
  for (let idx = 0; idx < cols; idx++) {
    if (headerSkip.has(idx)) continue;
    const parsed = parseTableCellMetaToken(safeHeader[idx] || '');
    if (parsed.covered) continue;
    const align = parsed.align || alignments[idx] || 'left';
    const colSpan = Math.max(1, Math.min(cols - idx, parsed.colSpan || 1));
    if (colSpan > 1) {
      for (let c = idx + 1; c < idx + colSpan; c++) headerSkip.add(c);
    }
    const attrs = colSpan > 1 ? ` colspan="${colSpan}"` : '';
    th.push(`<th class="md-table-cell md-table-align-${align}"${attrs}>${applyInlineMarkdown(parsed.text || '') || '&nbsp;'}</th>`);
  }

  const bodySkip = Array.from({ length: safeBody.length }, () => Array.from({ length: cols }, () => false));
  const rowsHtml = safeBody.map((row, rowIdx) => {
    const cells = Array.isArray(row) ? row : [];
    const tds = [];
    for (let colIdx = 0; colIdx < cols; colIdx++) {
      if (bodySkip[rowIdx][colIdx]) continue;
      const parsed = parseTableCellMetaToken(cells[colIdx] ?? '');
      if (parsed.covered) continue;
      const align = parsed.align || alignments[colIdx] || 'left';
      const rowSpan = Math.max(1, Math.min(safeBody.length - rowIdx, parsed.rowSpan || 1));
      const colSpan = Math.max(1, Math.min(cols - colIdx, parsed.colSpan || 1));
      if (rowSpan > 1 || colSpan > 1) {
        for (let r = rowIdx; r < rowIdx + rowSpan; r++) {
          for (let c = colIdx; c < colIdx + colSpan; c++) {
            if (r === rowIdx && c === colIdx) continue;
            bodySkip[r][c] = true;
          }
        }
      }
      const attrs = [
        rowSpan > 1 ? `rowspan="${rowSpan}"` : '',
        colSpan > 1 ? `colspan="${colSpan}"` : ''
      ].filter(Boolean).join(' ');
      const attrString = attrs ? ` ${attrs}` : '';
      tds.push(`<td class="md-table-cell md-table-align-${align}"${attrString}>${applyInlineMarkdown(parsed.text || '') || '&nbsp;'}</td>`);
    }
    return `<tr>${tds.join('')}</tr>`;
  }).join('');

  return `<div class="md-table-wrap"><div class="md-table-fit"><table class="md-table"><thead><tr>${th.join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></div></div>`;
}

/**
 * @function markdownToHtml
 * @description Converts markdown-like card text into HTML, including lists, tables, and math placeholders.
 */

function markdownToHtml(raw = '') {
  const { text, tokens } = tokenizeMathSegments(raw || '');
  const lines = text.split('\n');
  const out = [];
  const listStack = [];
  const liOpen = [];

  const closeOneLevel = () => {
    const idx = listStack.length - 1;
    if (idx < 0) return;
    if (liOpen[idx]) {
      out.push('</li>');
      liOpen[idx] = false;
    }
    out.push(`</${listStack[idx]}>`);
    listStack.pop();
    liOpen.pop();
  };

  const closeToDepth = (targetDepth = 0) => {
    while (listStack.length > targetDepth) closeOneLevel();
  };

  const openListLevel = (type, start = 1) => {
    if (type === 'ol' && Number.isFinite(start) && start > 1) {
      out.push(`<ol start="${start}">`);
    } else {
      out.push(`<${type}>`);
    }
    listStack.push(type);
    liOpen.push(false);
  };

  const ensureDepth = (depth, meta) => {
    while (listStack.length < depth + 1) {
      const parentIdx = listStack.length - 1;
      if (parentIdx >= 0 && !liOpen[parentIdx]) {
        out.push('<li>');
        liOpen[parentIdx] = true;
      }
      const levelIndex = listStack.length;
      const start = meta.type === 'ol' ? Number(meta.sequence?.[levelIndex] || 1) : 1;
      openListLevel(meta.type, start);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerCells = splitMarkdownTableRow(line);
    const alignments = headerCells && i + 1 < lines.length
      ? parseMarkdownTableAlignments(lines[i + 1], headerCells.length)
      : null;
    if (headerCells && alignments) {
      closeToDepth(0);
      const bodyRows = [];
      let j = i + 2;
      while (j < lines.length) {
        const rowCells = splitMarkdownTableRow(lines[j]);
        if (!rowCells || rowCells.length !== headerCells.length) break;
        bodyRows.push(rowCells);
        j += 1;
      }
      out.push(renderMarkdownTableHtml(headerCells, alignments, bodyRows));
      i = j - 1;
      continue;
    }

    const meta = parseListLineMeta(line);
    if (meta) {
      const depth = getListDepth(meta);
      closeToDepth(depth + 1);
      ensureDepth(depth, meta);

      if (listStack[depth] !== meta.type) {
        if (liOpen[depth]) {
          out.push('</li>');
          liOpen[depth] = false;
        }
        out.push(`</${listStack[depth]}>`);
        listStack.pop();
        liOpen.pop();
        const start = meta.type === 'ol' ? Number(meta.sequence?.[depth] || 1) : 1;
        openListLevel(meta.type, start);
      }

      if (liOpen[depth]) {
        out.push('</li>');
        liOpen[depth] = false;
      }

      const item = meta.text ? applyInlineMarkdown(meta.text) : '<br>';
      out.push(`<li>${item}`);
      liOpen[depth] = true;
      continue;
    }

    closeToDepth(0);
    if (!line.trim()) {
      out.push('<div class="md-line"><br></div>');
    } else {
      out.push(`<div class="md-line">${applyInlineMarkdown(line)}</div>`);
    }
  }
  closeToDepth(0);
  return restoreMathTokens(out.join(''), tokens);
}

/**
 * @function hasPotentialMathContent
 * @description Returns whether potential math content.
 */

function hasPotentialMathContent(text = '') {
  return /(\$\$?[^$]|\\\(|\\\[)/.test(String(text || ''));
}

/**
 * @function forceMathMlOnly
 * @description Handles force math ml only logic.
 */

function forceMathMlOnly(container) {
  if (!container) return;
  container.querySelectorAll('.katex').forEach(node => {
    node.querySelectorAll('.katex-html').forEach(htmlNode => htmlNode.remove());
    const mathmlNode = node.querySelector('.katex-mathml');
    if (mathmlNode) mathmlNode.classList.add('katex-mathml-only');
  });
}

/**
 * @function renderKatexInContainer
 * @description Renders KaTeX in container.
 */

function renderKatexInContainer(container) {
  if (!container) return false;
  if (!hasPotentialMathContent(container.textContent || '')) {
    container.dataset.mathPending = '0';
    return true;
  }
  if (!window.renderMathInElement) {
    container.dataset.mathPending = '1';
    return false;
  }
  try {
    window.renderMathInElement(container, KATEX_RENDER_OPTIONS);
    forceMathMlOnly(container);
    container.dataset.mathPending = '0';
    return true;
  } catch (err) {
    container.dataset.mathPending = '1';
    return false;
  }
}

let overviewTableFitScheduled = false;
/**
 * @function fitOverviewTables
 * @description Handles fit overview tables logic.
 */
function fitOverviewTables() {
  const wraps = document.querySelectorAll(
    '.card-tile .rich-content .md-table-wrap, .topic-search-result .rich-content .md-table-wrap'
  );
  wraps.forEach(wrap => {
    const fit = wrap.querySelector('.md-table-fit');
    const table = wrap.querySelector('.md-table');
    if (!fit || !table) return;

    // Reset previous scaling before taking fresh measurements.
    wrap.classList.remove('md-table-wrap-fitted');
    wrap.style.height = '';
    fit.style.width = '';
    fit.style.transform = '';

    const availableWidth = wrap.clientWidth;
    const naturalWidth = table.scrollWidth;
    if (!availableWidth || !naturalWidth) return;
    if (naturalWidth <= availableWidth + 1) return;

    const scale = availableWidth / naturalWidth;
    fit.style.width = `${naturalWidth}px`;
    fit.style.transform = `scale(${scale})`;
    wrap.style.height = `${Math.ceil(table.scrollHeight * scale)}px`;
    wrap.classList.add('md-table-wrap-fitted');
  });
}

/**
 * @function scheduleOverviewTableFit
 * @description Handles schedule overview table fit logic.
 */

function scheduleOverviewTableFit() {
  if (overviewTableFitScheduled) return;
  overviewTableFitScheduled = true;
  requestAnimationFrame(() => {
    overviewTableFitScheduled = false;
    fitOverviewTables();
  });
}

/**
 * @function rerenderAllRichMath
 * @description Handles rerender all rich math logic.
 */

function rerenderAllRichMath() {
  document.querySelectorAll('.rich-content').forEach(node => renderKatexInContainer(node));
  scheduleOverviewTableFit();
}

/**
 * @function renderRich
 * @description Renders rich card content with alignment, markdown parsing, and deferred KaTeX rendering.
 */

function renderRich(container, content, options = {}) {
  if (!container) return;
  const textAlign = normalizeTextAlign(options.textAlign);
  container.classList.add('rich-content');
  container.classList.remove('rich-align-left', 'rich-align-center', 'rich-align-justify');
  container.classList.add(`rich-align-${textAlign}`);
  container.innerHTML = markdownToHtml(content || '');
  scheduleOverviewTableFit();
  if (renderKatexInContainer(container)) return;
  ensureKatexLoaded().then(loaded => {
    if (!loaded) return;
    rerenderAllRichMath();
  });
}

/**
 * @function isInMathMode
 * @description Returns whether in math mode.
 */

function isInMathMode(text, pos) {
  let count = 0;
  for (let i = 0; i < pos; i++) {
    if (text[i] === '$' && text[i - 1] !== '\\') count++;
  }
  return count % 2 === 1;
}

/**
 * @function attachAutoClose
 * @description Attaches handlers for auto close.
 */

function attachAutoClose(elm) {
  if (!elm) return;
  const pairs = { '(': ')', '[': ']', '{': '}', '$': '$' };
  elm.addEventListener('keydown', e => {
    if (!pairs[e.key]) return;
    const start = elm.selectionStart;
    const end = elm.selectionEnd;
    const text = elm.value;
    // if (!isInMathMode(text, start)) return;
    e.preventDefault();
    const open = e.key;
    const close = pairs[e.key];
    const before = text.slice(0, start);
    const selected = text.slice(start, end);
    const after = text.slice(end);
    elm.value = `${before}${open}${selected}${close}${after}`;
    if (start !== end) {
      elm.setSelectionRange(start + 1, start + 1 + selected.length);
    } else {
      const cursor = start + 1;
      elm.setSelectionRange(cursor, cursor);
    }
  });
  elm.addEventListener('input', () => {
    const pos = elm.selectionStart;
    if (pos == null) return;

    const text = elm.value;

    // nur innerhalb von $ ... $
    if (!isInMathMode(text, pos)) return;

    const before = text.slice(0, pos);

    // Achtung: im JS-String muss \ als \\ geschrieben werden
    if (!before.endsWith('\\frac')) return;

    elm.value =
      text.slice(0, pos) +
      '{}{}' +
      text.slice(pos);

    // Cursor in das erste {}
    elm.setSelectionRange(pos + 1, pos + 1);
  });
}

// ============================================================================
// Media Handling (Image Upload, Preview, Lightbox)
// ============================================================================
/**
* @function fileToDataUrl
 * @description Converts a File object to a base64 data URL.
 */

function fileToDataUrl(file) {
  return new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.readAsDataURL(file);
  });
}

/**
 * @function normalizeImageList
 * @description Normalizes image list.
 */

function normalizeImageList(rawImages, fallbackImage = '') {
  const images = [];
  const seen = new Set();
  const push = value => {
    const src = typeof value === 'string' ? value.trim() : '';
    if (!src || seen.has(src)) return;
    seen.add(src);
    images.push(src);
  };
  if (Array.isArray(rawImages)) rawImages.forEach(push);
  else if (rawImages && typeof rawImages === 'object' && typeof rawImages.length === 'number') {
    Array.from(rawImages).forEach(push);
  } else {
    push(rawImages);
  }
  if (!images.length) push(fallbackImage);
  return images;
}

/**
 * @function getCardImageList
 * @description Returns the card image list.
 */

function getCardImageList(card, side = 'Q') {
  const key = String(side || 'Q').toUpperCase() === 'A' ? 'A' : 'Q';
  const listKey = key === 'Q' ? 'imagesQ' : 'imagesA';
  const fallback = key === 'Q'
    ? card?.imageDataQ || card?.imageData || ''
    : card?.imageDataA || '';
  return normalizeImageList(card?.[listKey], fallback);
}

/**
 * @function resetSessionImagePreloadCache
 * @description Clears the in-memory image preload cache used to warm upcoming study cards.
 */

function resetSessionImagePreloadCache() {
  sessionImagePreloadCache.clear();
}

/**
 * @function preloadSessionImageSource
 * @description Preloads one image source so the next study cards render without image decode lag.
 */

function preloadSessionImageSource(src = '') {
  const key = String(src || '').trim();
  if (!key) return Promise.resolve(false);
  const cached = sessionImagePreloadCache.get(key);
  if (cached) return cached;

  if (sessionImagePreloadCache.size >= SESSION_IMAGE_PRELOAD_CACHE_MAX) {
    const oldestKey = sessionImagePreloadCache.keys().next().value;
    if (oldestKey) sessionImagePreloadCache.delete(oldestKey);
  }

  const preloadPromise = new Promise(resolve => {
    const img = new Image();
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      resolve(!!ok);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.decoding = 'async';
    img.src = key;
    if (typeof img.decode === 'function') {
      img.decode().then(() => finish(true)).catch(() => {
        // Keep onload/onerror fallback active.
      });
    }
    setTimeout(() => finish(false), 10000);
  });

  sessionImagePreloadCache.set(key, preloadPromise);
  return preloadPromise;
}

/**
 * @function warmSessionCardAssets
 * @description Starts background preload for all images used by one study card.
 */

function warmSessionCardAssets(card = null) {
  if (!card || typeof card !== 'object') return;
  const allImages = normalizeImageList([
    ...getCardImageList(card, 'Q'),
    ...getCardImageList(card, 'A')
  ]);
  allImages.forEach(src => {
    void preloadSessionImageSource(src);
  });
}

/**
 * @function warmUpcomingSessionCards
 * @description Preloads current/next study cards so flips and transitions feel instant.
 */

function warmUpcomingSessionCards(lookAhead = 2) {
  const queue = Array.isArray(session?.activeQueue) ? session.activeQueue : [];
  if (!queue.length) return;
  const safeLookAhead = Number.isFinite(Number(lookAhead))
    ? Math.max(0, Math.trunc(Number(lookAhead)))
    : 2;
  const maxIdx = Math.min(queue.length - 1, safeLookAhead);
  for (let idx = 0; idx <= maxIdx; idx += 1) {
    warmSessionCardAssets(queue[idx]);
  }
}

/**
 * @function getFieldImageList
 * @description Returns the field image list.
 */

function getFieldImageList(field, legacyKey = '') {
  if (!field) return [];
  let parsed = [];
  const raw = String(field.dataset.images || '').trim();
  if (raw) {
    try {
      const payload = JSON.parse(raw);
      parsed = normalizeImageList(payload);
    } catch (err) {
      parsed = normalizeImageList(raw);
    }
  }
  return normalizeImageList(parsed, field.dataset[legacyKey] || '');
}

/**
 * @function setFieldImageList
 * @description Sets the field image list.
 */

function setFieldImageList(field, images, legacyKey = '') {
  if (!field) return [];
  const normalized = normalizeImageList(images);
  if (normalized.length) field.dataset.images = JSON.stringify(normalized);
  else delete field.dataset.images;
  if (legacyKey) field.dataset[legacyKey] = normalized[0] || '';
  return normalized;
}

/**
 * @function setImagePreview
 * @description Sets the image preview.
 */

function setImagePreview(previewEl, dataUrls, onRemoveAt) {
  if (!previewEl) return;
  const images = normalizeImageList(dataUrls);
  if (!images.length) {
    previewEl.classList.remove('has-image', 'single-image', 'multi-image');
    previewEl.innerHTML = `
          <div class="image-preview-empty-state" aria-hidden="true">
            <img class="image-preview-drop-icon" src="icons/drop_image.png" alt="" style="width: 48px; height: 48px;"/>
          </div>
        `;
    return;
  }
  previewEl.classList.add('has-image');
  previewEl.classList.toggle('single-image', images.length === 1);
  previewEl.classList.toggle('multi-image', images.length > 1);
  previewEl.innerHTML = '';

  const createImageWrap = (src, idx, variant = 'single') => {
    const wrap = document.createElement('div');
    wrap.className = `image-preview-wrap image-preview-wrap-${variant}`;
    const img = document.createElement('img');
    img.src = src;
    img.alt = `preview ${idx + 1}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'image-remove-btn';
    btn.setAttribute('aria-label', `Remove image ${idx + 1}`);
    btn.innerHTML = '<img src="icons/trash.svg" alt="" aria-hidden="true">';
    btn.onclick = e => {
      e.stopPropagation();
      if (typeof onRemoveAt === 'function') onRemoveAt(idx);
    };
    wrap.append(img, btn);
    return wrap;
  };

  const createDropTile = (variant = 'single') => {
    const tile = document.createElement('div');
    tile.className = `image-preview-drop-tile image-preview-drop-tile-${variant}`;
    tile.innerHTML = '<img class="image-preview-drop-icon" src="icons/drop_image.png" alt="" aria-hidden="true">';
    tile.setAttribute('title', 'Drop more images');
    return tile;
  };

  if (images.length === 1) {
    const row = document.createElement('div');
    row.className = 'image-preview-single-layout';
    row.appendChild(createImageWrap(images[0], 0, 'single'));
    row.appendChild(createDropTile('single'));
    previewEl.appendChild(row);
    return;
  }

  const row = document.createElement('div');
  row.className = 'image-preview-multi-layout';
  const stack = document.createElement('div');
  stack.className = 'image-preview-stack';
  images.forEach((src, idx) => {
    const wrap = createImageWrap(src, idx, 'stack');
    const offsetX = Math.min(10 * idx, 36);
    const rotation = idx === 0 ? -10 : idx === 1 ? 0 : Math.min(10 + (idx - 2) * 2, 16);
    wrap.style.setProperty('--stack-left', `${offsetX}px`);
    wrap.style.setProperty('--stack-rotation', `${rotation}deg`);
    wrap.style.setProperty('--stack-z', String(idx + 1));
    stack.appendChild(wrap);
  });
  row.appendChild(stack);
  row.appendChild(createDropTile('multi'));
  previewEl.appendChild(row);
}

/**
 * @function syncFieldImagePreview
 * @description Synchronizes field image preview.
 */

function syncFieldImagePreview(field, previewEl, legacyKey = '', onChange = null) {
  if (!field || !previewEl) return;
  const images = getFieldImageList(field, legacyKey);
  setImagePreview(previewEl, images, removeIdx => {
    const current = getFieldImageList(field, legacyKey);
    const next = current.filter((_, idx) => idx !== removeIdx);
    setFieldImageList(field, next, legacyKey);
    syncFieldImagePreview(field, previewEl, legacyKey, onChange);
    if (typeof onChange === 'function') onChange(next);
  });
}

/**
 * @function appendImagesToField
 * @description Converts append images to field.
 */

function appendImagesToField(field, previewEl, newImages, legacyKey = '', onChange = null) {
  if (!field || !previewEl) return;
  const current = getFieldImageList(field, legacyKey);
  const next = normalizeImageList([...current, ...normalizeImageList(newImages)]);
  setFieldImageList(field, next, legacyKey);
  syncFieldImagePreview(field, previewEl, legacyKey, onChange);
  if (typeof onChange === 'function') onChange(next);
}

/**
 * @function replaceFieldImages
 * @description Handles replace field images logic.
 */

function replaceFieldImages(field, previewEl, images, legacyKey = '', onChange = null) {
  if (!field || !previewEl) return;
  const next = setFieldImageList(field, images, legacyKey);
  syncFieldImagePreview(field, previewEl, legacyKey, onChange);
  if (typeof onChange === 'function') onChange(next);
}

/**
 * @function attachImageDrop
 * @description Attaches handlers for image drop.
 */

function attachImageDrop(target, onImages) {
  if (!target) return;
  const prevent = e => { e.preventDefault(); e.stopPropagation(); };
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
    target.addEventListener(evt, prevent);
  });
  target.addEventListener('drop', async e => {
    const files = Array.from(e.dataTransfer?.files || [])
      .filter(file => file && String(file.type || '').startsWith('image/'));
    if (!files.length) return;
    const dataUrls = normalizeImageList(await Promise.all(files.map(fileToDataUrl)));
    if (!dataUrls.length) return;
    if (typeof onImages === 'function') onImages(dataUrls);
  });
}

/**
 * @function attachImagePicker
 * @description Attaches handlers for image picker.
 */

function attachImagePicker(target, onImages) {
  if (!target) return;
  if (target.dataset.imagePickerBound === '1') return;
  target.dataset.imagePickerBound = '1';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.multiple = true;
  fileInput.tabIndex = -1;
  fileInput.setAttribute('aria-hidden', 'true');
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files || [])
      .filter(file => file && String(file.type || '').startsWith('image/'));
    fileInput.value = '';
    if (!files.length) return;
    const dataUrls = normalizeImageList(await Promise.all(files.map(fileToDataUrl)));
    if (!dataUrls.length) return;
    if (typeof onImages === 'function') onImages(dataUrls);
  });

  target.addEventListener('click', e => {
    const clickTarget = e.target;
    if (!(clickTarget instanceof Element)) return;
    if (clickTarget.closest('.image-remove-btn')) return;

    const isDropTileClick = !!clickTarget.closest('.image-preview-drop-tile');
    const isEmptyStateClick = !!clickTarget.closest('.image-preview-empty-state');
    const isDropIconClick = clickTarget.classList.contains('image-preview-drop-icon');
    const isEmptyContainerClick = clickTarget === target && !target.classList.contains('has-image');
    if (!isDropTileClick && !isEmptyStateClick && !isDropIconClick && !isEmptyContainerClick) return;

    fileInput.click();
  });
}

/**
 * @function appendCardImages
 * @description Handles append card images logic.
 */

function appendCardImages(container, images = [], className = 'card-thumb', altPrefix = 'Card image') {
  if (!container) return;
  const normalized = normalizeImageList(images);
  normalized.forEach((src, idx) => {
    const thumb = document.createElement('img');
    thumb.src = src;
    thumb.className = className;
    thumb.alt = `${altPrefix} ${idx + 1}`;
    container.appendChild(thumb);
  });
}

/**
 * @function appendSessionImages
 * @description Handles append session images logic.
 */

function appendSessionImages(container, images = [], altPrefix = 'Card image') {
  if (!container) return;
  const normalized = normalizeImageList(images);
  normalized.forEach((src, idx) => {
    const img = buildSessionCardImage(src, `${altPrefix} ${idx + 1}`);
    container.appendChild(img);
  });
}

/**
 * @function buildCardImagePayloadForSave
 * @description Normalizes image lists for persistence in card records.
 */

async function buildCardImagePayloadForSave(cardId, imagesQ, imagesA) {
  void cardId;
  return getCardImagePayload(
    normalizeImageList(imagesQ),
    normalizeImageList(imagesA)
  );
}

/**
 * @function getCardImagePayload
 * @description Returns the card image payload.
 */

function getCardImagePayload(imagesQ, imagesA) {
  const q = normalizeImageList(imagesQ);
  const a = normalizeImageList(imagesA);
  return {
    imagesQ: q,
    imagesA: a,
    imageDataQ: q[0] || '',
    imageDataA: a[0] || ''
  };
}

// ============================================================================
// Sidebar + Subject Management
// ============================================================================
/**
* @function applySubjectTheme
 * @description Applies subject theme.
 */

function applySubjectTheme(accent) {
  const normHex = normalizeHexColor(accent || '#2dd4bf');
  const rgba = a => hexToRgba(normHex, a);
  document.documentElement.style.setProperty('--accent', normHex);
  document.documentElement.style.setProperty('--accent-glow', rgba(0.35));
  document.documentElement.style.setProperty('--accent-ring', rgba(0.9));
  document.documentElement.style.setProperty('--accent-glow-strong', rgba(0.6));
  document.documentElement.style.setProperty('--accent-glow-soft', rgba(0.35));
  document.documentElement.style.setProperty('--panel-accent', rgba(0.12));
  document.documentElement.style.setProperty('--tile-accent-bg', rgba(0.18));
  document.documentElement.style.setProperty('--face-accent', rgba(0.14));
}

/**
 * @function resolveCardSubjectAccent
 * @description Resolves a card's subject accent for per-card study-session theming.
 */

function resolveCardSubjectAccent(card) {
  const directAccent = String(card?.subjectAccent || '').trim();
  if (directAccent) return normalizeHexColor(directAccent);

  const topicId = String(card?.topicId || '').trim();
  const topic = topicId ? (topicDirectoryById.get(topicId) || null) : null;
  const topicAccent = String(topic?.subjectAccent || topic?.accent || '').trim();
  if (topicAccent) return normalizeHexColor(topicAccent);

  const cardSubjectId = String(card?.subjectId || '').trim();
  const topicSubjectId = String(topic?.subjectId || '').trim();
  const subjectId = cardSubjectId || topicSubjectId;
  if (subjectId) {
    const subject = subjectDirectoryById.get(subjectId) || null;
    const subjectAccent = String(subject?.accent || '').trim();
    if (subjectAccent) return normalizeHexColor(subjectAccent);
  }

  if (selectedSubject?.accent) return normalizeHexColor(selectedSubject.accent);

  const rootAccent = String(getComputedStyle(document.documentElement).getPropertyValue('--accent') || '').trim();
  if (rootAccent) return normalizeHexColor(rootAccent);

  return '#2dd4bf';
}

/**
 * @function applySessionCardTheme
 * @description Applies per-card accent variables to the study-session scope.
 */

function applySessionCardTheme(card) {
  const sessionSection = el('studySessionSection');
  if (!sessionSection) return;
  const accent = resolveCardSubjectAccent(card);
  const rgba = a => hexToRgba(accent, a);
  sessionSection.style.setProperty('--accent', accent);
  sessionSection.style.setProperty('--accent-glow', rgba(0.35));
  sessionSection.style.setProperty('--accent-ring', rgba(0.9));
  sessionSection.style.setProperty('--accent-glow-strong', rgba(0.6));
  sessionSection.style.setProperty('--accent-glow-soft', rgba(0.35));
  sessionSection.style.setProperty('--panel-accent', rgba(0.12));
  sessionSection.style.setProperty('--tile-accent-bg', rgba(0.18));
  sessionSection.style.setProperty('--face-accent', rgba(0.14));
}

/**
 * @function normalizeHexColor
 * @description Normalizes hex color.
 */

function normalizeHexColor(accent = '#2dd4bf') {
  const hex = String(accent || '#2dd4bf').replace('#', '');
  const norm = hex.length === 3
    ? hex.split('').map(c => c + c).join('')
    : hex.padEnd(6, '0').slice(0, 6);
  return `#${norm}`;
}

/**
 * @function hexToRgba
 * @description Converts a hex color value to an RGBA color string.
 */

function hexToRgba(accent = '#2dd4bf', alpha = 1) {
  const safeHex = normalizeHexColor(accent).slice(1);
  const r = parseInt(safeHex.slice(0, 2), 16);
  const g = parseInt(safeHex.slice(2, 4), 16);
  const b = parseInt(safeHex.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, Number(alpha)));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * @function getSubjectLastEditedAt
 * @description Returns the subject last edited at.
 */

function getSubjectLastEditedAt(subject) {
  const raw = subject?.meta?.updatedAt
    ?? subject?.updatedAt
    ?? subject?.meta?.createdAt
    ?? subject?.createdAt
    ?? 0;
  if (!raw) return 0;
  if (typeof raw === 'number') return raw;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * @function sortSubjectsByLastEdited
 * @description Sorts subjects by last edited.
 */

function sortSubjectsByLastEdited(subjects = []) {
  return [...subjects].sort((a, b) => {
    const tsDiff = getSubjectLastEditedAt(b) - getSubjectLastEditedAt(a);
    if (tsDiff !== 0) return tsDiff;
    return String(a?.name || '').localeCompare(String(b?.name || ''));
  });
}

/**
 * @function buildSubjectRecord
 * @description Builds subject record.
 */

function buildSubjectRecord(subject = {}, overrides = {}, nowIso = new Date().toISOString()) {
  const createdAt = subject?.meta?.createdAt || subject?.createdAt || nowIso;
  const updatedAt = overrides.updatedAt || nowIso;
  return {
    ...subject,
    ...overrides,
    createdAt,
    updatedAt,
    meta: {
      ...(subject.meta || {}),
      createdAt,
      updatedAt
    }
  };
}

/**
 * @function touchSubject
 * @description Handles touch subject logic.
 */

async function touchSubject(subjectId, whenIso = new Date().toISOString(), options = {}) {
  if (!subjectId) return;
  const opts = options && typeof options === 'object' ? options : {};
  const uiBlocking = opts.uiBlocking !== false;
  const subject = subjectDirectoryById.get(subjectId)
    || (await getAll('subjects', { uiBlocking })).find(s => s.id === subjectId);
  if (!subject) return;
  const updatedSubject = buildSubjectRecord(subject, {}, whenIso);
  await put('subjects', updatedSubject, { uiBlocking });
  subjectDirectoryById.set(subjectId, {
    ...updatedSubject,
    accent: normalizeHexColor(updatedSubject?.accent || '#2dd4bf')
  });
  if (selectedSubject?.id === subjectId) {
    selectedSubject = { ...selectedSubject, ...updatedSubject };
  }
}

/**
 * @function touchSubjectByTopicId
 * @description Finds touch subject by topic ID.
 */

async function touchSubjectByTopicId(topicId, whenIso = new Date().toISOString(), options = {}) {
  if (!topicId) return;
  const opts = options && typeof options === 'object' ? options : {};
  const uiBlocking = opts.uiBlocking !== false;
  const topic = await getById('topics', topicId, { uiBlocking });
  if (!topic?.subjectId) return;
  await touchSubject(topic.subjectId, whenIso, { uiBlocking });
}

/**
 * @function refreshSidebar
 * @description Loads and renders the sidebar subject list with sorting and accent colors.
 */

async function refreshSidebar(options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const uiBlocking = opts.uiBlocking !== false;
  const subjects = sortSubjectsByLastEdited(await getAll('subjects', {
    uiBlocking,
    loadingLabel: 'Loading subjects...'
  }));
  rebuildSubjectDirectory(subjects);
  const list = el('subjectList');
  list.innerHTML = '';
  subjects.forEach(s => {
    const chip = document.createElement('div');
    chip.className = 'tile subject-tile';
    const accent = normalizeHexColor(s.accent || '#2dd4bf');
    chip.style.setProperty('--tile-accent', accent);
    chip.style.setProperty('--subject-accent', accent);
    chip.style.setProperty('--subject-accent-bg', hexToRgba(accent, 0.18));
    chip.style.setProperty('--subject-accent-glow', hexToRgba(accent, 0.34));
    chip.innerHTML = `
          <div class="tile-row">
            <div style="display:flex;align-items:center;gap:10px;">
              <div>${escapeHTML(s.name)}</div>
            </div>
            <div class="tile-menu">
              <button class="btn tile-menu-btn" type="button">⋯</button>
            </div>
          </div>
        `;
    chip.onclick = () => {
      selectedSubject = s;
      selectedTopic = null;
      setTopicSelectionMode(false);
      applySubjectTheme(s.accent || '#2dd4bf');
      loadTopics();
      setView(1);
      document.body.classList.remove('sidebar-open');
    };
    const menuBtn = chip.querySelector('.tile-menu-btn');
    if (menuBtn) {
      menuBtn.onclick = e => {
        e.stopPropagation();
        editingSubjectId = s.id;
        el('editSubjectName').value = s.name;
        el('editSubjectColor').value = s.accent || '#2dd4bf';
        el('subjectEditDialog').showModal();
      };
    }
    list.appendChild(chip);
  });
  const stats = await getStats({ uiBlocking, loadingLabel: 'Loading overview...' });
  const summarySubjectsEl = el('summarySubjects');
  const summaryTopicsEl = el('summaryTopics');
  const summaryCardsEl = el('summaryCards');
  if (summarySubjectsEl) summarySubjectsEl.textContent = `${subjects.length} Subjects`;
  if (summaryTopicsEl) summaryTopicsEl.textContent = `${stats.topics} Topics`;
  if (summaryCardsEl) summaryCardsEl.textContent = `${stats.cards} Cards`;
  applySubjectTheme(selectedSubject?.accent || '#2dd4bf');
  loadHomeTopics({ uiBlocking });
}

/**
 * @function loadHomeTopics
 * @description Loads home topics.
 */

async function loadHomeTopics(options = {}) {
  const wrap = el('homeTopics');
  if (!wrap) return;
  const opts = options && typeof options === 'object' ? options : {};
  const uiBlocking = opts.uiBlocking !== false;
  if (!selectedSubject) {
    wrap.innerHTML = '<div class="tiny">Select a subject from the sidebar to drill down.</div>';
    return;
  }
  const topics = await getTopicsBySubject(selectedSubject.id, { uiBlocking });
  if (!topics.length) {
    wrap.innerHTML = '<div class="tiny">No topics yet.</div>';
    return;
  }
  wrap.innerHTML = '';
  topics.forEach(t => {
    const tile = document.createElement('div');
    tile.className = 'tile topic-tile';
    tile.textContent = t.name;
    tile.onclick = () => {
      selectedTopic = t;
      session.active = false;
      el('cardsOverviewSection').classList.remove('hidden');
      el('studySessionSection')?.classList.add('hidden');
      renderSessionPills();
      loadDeck();
      setView(2);
    };
    wrap.appendChild(tile);
  });
}

/**
 * @function renderSessionSizeCounter
 * @description Renders session size counter.
 */

function renderSessionSizeCounter() {
  const valueEl = el('sessionSizeValue');
  if (!valueEl) return;
  let textEl = valueEl.querySelector('.session-size-value-text');
  if (!textEl) {
    const initialText = String(valueEl.textContent || '').trim();
    valueEl.textContent = '';
    textEl = document.createElement('span');
    textEl.className = 'session-size-value-text';
    textEl.textContent = initialText || '0 / 0';
    valueEl.appendChild(textEl);
  }
  const current = availableSessionCards > 0 ? sessionSize : 0;
  textEl.textContent = `${current} / ${availableSessionCards}`;
}

/**
 * @function setSessionMetaLoading
 * @description Toggles a local loading state only for the session-size counter area.
 */

function setSessionMetaLoading(active = false) {
  const valueEl = el('sessionSizeValue');
  if (!valueEl) return;
  if (!valueEl.querySelector('.session-size-loader')) {
    const loader = document.createElement('div');
    loader.className = 'session-size-loader';
    loader.setAttribute('aria-hidden', 'true');
    loader.innerHTML = `
      <div class="app-loader-stack">
        <span class="app-loader-card card-one"></span>
        <span class="app-loader-card card-two"></span>
        <span class="app-loader-card card-three"></span>
      </div>
    `;
    valueEl.appendChild(loader);
  }
  if (active) {
    sessionMetaLoadingCount += 1;
  } else {
    sessionMetaLoadingCount = Math.max(0, sessionMetaLoadingCount - 1);
  }
  const isLoading = sessionMetaLoadingCount > 0;
  valueEl.classList.toggle('is-loading', isLoading);
  valueEl.setAttribute('aria-busy', isLoading ? 'true' : 'false');
}

/**
 * @function resetSessionMetaLoading
 * @description Clears local loading state for the session-size counter area.
 */

function resetSessionMetaLoading() {
  sessionMetaLoadingCount = 0;
  const valueEl = el('sessionSizeValue');
  if (!valueEl) return;
  valueEl.classList.remove('is-loading');
  valueEl.setAttribute('aria-busy', 'false');
}

/**
 * @function openStudyImageLightbox
 * @description Opens the study image lightbox.
 */

const studyImageLightboxState = {
  scale: 1,
  tx: 0,
  ty: 0,
  minScale: 1,
  maxScale: 4,
  panStartX: 0,
  panStartY: 0,
  startTx: 0,
  startTy: 0,
  pinchLastDistance: 0,
  pinchLastCenterX: 0,
  pinchLastCenterY: 0,
  interacting: false,
  moved: false,
  ignoreTapUntil: 0
};

/**
 * @function clampStudyImageLightboxValue
 * @description Clamps a lightbox numeric value between min and max.
 */

function clampStudyImageLightboxValue(value, min, max) {
  const num = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, num));
}

/**
 * @function getStudyImageTouchDistance
 * @description Calculates the distance in pixels between two touch points.
 */

function getStudyImageTouchDistance(touchA, touchB) {
  if (!touchA || !touchB) return 0;
  const dx = touchB.clientX - touchA.clientX;
  const dy = touchB.clientY - touchA.clientY;
  return Math.hypot(dx, dy);
}

/**
 * @function getStudyImageTouchCenter
 * @description Calculates the center point between two touch points.
 */

function getStudyImageTouchCenter(touchA, touchB) {
  return {
    x: ((touchA?.clientX || 0) + (touchB?.clientX || 0)) / 2,
    y: ((touchA?.clientY || 0) + (touchB?.clientY || 0)) / 2
  };
}

/**
 * @function clampStudyImageLightboxPan
 * @description Clamps panning offsets to keep the zoomed image inside the lightbox viewport.
 */

function clampStudyImageLightboxPan() {
  const lightbox = el('sessionImageLightbox');
  const lightboxImg = el('sessionImageLightboxImg');
  if (!lightbox || !lightboxImg) return;

  const boxWidth = lightbox.clientWidth;
  const boxHeight = lightbox.clientHeight;
  const scaledWidth = lightboxImg.clientWidth * studyImageLightboxState.scale;
  const scaledHeight = lightboxImg.clientHeight * studyImageLightboxState.scale;

  const maxTx = Math.max(0, (scaledWidth - boxWidth) / 2);
  const maxTy = Math.max(0, (scaledHeight - boxHeight) / 2);
  studyImageLightboxState.tx = clampStudyImageLightboxValue(studyImageLightboxState.tx, -maxTx, maxTx);
  studyImageLightboxState.ty = clampStudyImageLightboxValue(studyImageLightboxState.ty, -maxTy, maxTy);
}

/**
 * @function applyStudyImageLightboxTransform
 * @description Applies the current zoom/pan transform to the lightbox image.
 */

function applyStudyImageLightboxTransform({ disableTransition = false } = {}) {
  const lightbox = el('sessionImageLightbox');
  const lightboxImg = el('sessionImageLightboxImg');
  if (!lightbox || !lightboxImg) return;

  clampStudyImageLightboxPan();
  const isZoomed = studyImageLightboxState.scale > 1.001;
  lightbox.classList.toggle('is-zoomed', isZoomed);
  lightbox.classList.toggle('is-interacting', studyImageLightboxState.interacting);
  lightboxImg.style.transition = disableTransition ? 'none' : '';
  lightboxImg.style.transform = `translate3d(${studyImageLightboxState.tx}px, ${studyImageLightboxState.ty}px, 0) scale(${studyImageLightboxState.scale})`;
}

/**
 * @function resetStudyImageLightboxTransform
 * @description Resets the lightbox image transform to default scale and position.
 */

function resetStudyImageLightboxTransform({ animate = false } = {}) {
  studyImageLightboxState.scale = 1;
  studyImageLightboxState.tx = 0;
  studyImageLightboxState.ty = 0;
  studyImageLightboxState.interacting = false;
  studyImageLightboxState.moved = false;
  studyImageLightboxState.panStartX = 0;
  studyImageLightboxState.panStartY = 0;
  studyImageLightboxState.startTx = 0;
  studyImageLightboxState.startTy = 0;
  studyImageLightboxState.pinchLastDistance = 0;
  studyImageLightboxState.pinchLastCenterX = 0;
  studyImageLightboxState.pinchLastCenterY = 0;
  applyStudyImageLightboxTransform({ disableTransition: !animate });
}

/**
 * @function zoomStudyImageLightboxAt
 * @description Zooms the lightbox image around a viewport focal point.
 */

function zoomStudyImageLightboxAt(nextScale, clientX, clientY) {
  const lightbox = el('sessionImageLightbox');
  if (!lightbox) return;

  const prevScale = studyImageLightboxState.scale;
  const clampedScale = clampStudyImageLightboxValue(nextScale, studyImageLightboxState.minScale, studyImageLightboxState.maxScale);
  if (Math.abs(clampedScale - prevScale) < 0.0001) return;

  const boxCenterX = lightbox.clientWidth / 2;
  const boxCenterY = lightbox.clientHeight / 2;
  const focalX = clientX - boxCenterX;
  const focalY = clientY - boxCenterY;
  const ratio = clampedScale / prevScale;
  studyImageLightboxState.tx = (ratio * studyImageLightboxState.tx) + ((1 - ratio) * focalX);
  studyImageLightboxState.ty = (ratio * studyImageLightboxState.ty) + ((1 - ratio) * focalY);
  studyImageLightboxState.scale = clampedScale;
  applyStudyImageLightboxTransform({ disableTransition: true });
}

/**
 * @function handleStudyImageLightboxTouchStart
 * @description Starts pan/pinch handling for the lightbox image.
 */

function handleStudyImageLightboxTouchStart(event) {
  const touches = event.targetTouches;
  if (!touches?.length) return;
  event.stopPropagation();
  studyImageLightboxState.moved = false;

  if (touches.length >= 2) {
    const center = getStudyImageTouchCenter(touches[0], touches[1]);
    studyImageLightboxState.pinchLastCenterX = center.x;
    studyImageLightboxState.pinchLastCenterY = center.y;
    studyImageLightboxState.pinchLastDistance = getStudyImageTouchDistance(touches[0], touches[1]);
    studyImageLightboxState.interacting = true;
    applyStudyImageLightboxTransform({ disableTransition: true });
    event.preventDefault();
    return;
  }

  if (studyImageLightboxState.scale <= 1.001) return;
  const touch = touches[0];
  studyImageLightboxState.panStartX = touch.clientX;
  studyImageLightboxState.panStartY = touch.clientY;
  studyImageLightboxState.startTx = studyImageLightboxState.tx;
  studyImageLightboxState.startTy = studyImageLightboxState.ty;
  studyImageLightboxState.interacting = true;
  applyStudyImageLightboxTransform({ disableTransition: true });
  event.preventDefault();
}

/**
 * @function handleStudyImageLightboxTouchMove
 * @description Updates zoom/pan while the user moves touches on the lightbox image.
 */

function handleStudyImageLightboxTouchMove(event) {
  const touches = event.targetTouches;
  if (!touches?.length) return;
  event.stopPropagation();

  if (touches.length >= 2) {
    const center = getStudyImageTouchCenter(touches[0], touches[1]);
    const distance = getStudyImageTouchDistance(touches[0], touches[1]);
    if (!studyImageLightboxState.pinchLastDistance || !distance) {
      studyImageLightboxState.pinchLastDistance = distance;
      studyImageLightboxState.pinchLastCenterX = center.x;
      studyImageLightboxState.pinchLastCenterY = center.y;
      event.preventDefault();
      return;
    }

    const prevScale = studyImageLightboxState.scale;
    const scaleFactor = distance / studyImageLightboxState.pinchLastDistance;
    const nextScale = clampStudyImageLightboxValue(prevScale * scaleFactor, studyImageLightboxState.minScale, studyImageLightboxState.maxScale);

    const lightbox = el('sessionImageLightbox');
    if (!lightbox) return;
    const boxCenterX = lightbox.clientWidth / 2;
    const boxCenterY = lightbox.clientHeight / 2;
    const focalX = center.x - boxCenterX;
    const focalY = center.y - boxCenterY;
    const ratio = nextScale / prevScale;
    let nextTx = (ratio * studyImageLightboxState.tx) + ((1 - ratio) * focalX);
    let nextTy = (ratio * studyImageLightboxState.ty) + ((1 - ratio) * focalY);
    nextTx += center.x - studyImageLightboxState.pinchLastCenterX;
    nextTy += center.y - studyImageLightboxState.pinchLastCenterY;

    studyImageLightboxState.scale = nextScale;
    studyImageLightboxState.tx = nextTx;
    studyImageLightboxState.ty = nextTy;
    studyImageLightboxState.pinchLastDistance = distance;
    studyImageLightboxState.pinchLastCenterX = center.x;
    studyImageLightboxState.pinchLastCenterY = center.y;
    studyImageLightboxState.moved = true;
    studyImageLightboxState.interacting = true;
    applyStudyImageLightboxTransform({ disableTransition: true });
    event.preventDefault();
    return;
  }

  if (studyImageLightboxState.scale <= 1.001) return;
  const touch = touches[0];
  const nextTx = studyImageLightboxState.startTx + (touch.clientX - studyImageLightboxState.panStartX);
  const nextTy = studyImageLightboxState.startTy + (touch.clientY - studyImageLightboxState.panStartY);
  const movedDistance = Math.hypot(nextTx - studyImageLightboxState.tx, nextTy - studyImageLightboxState.ty);
  if (movedDistance > 0.4) studyImageLightboxState.moved = true;
  studyImageLightboxState.tx = nextTx;
  studyImageLightboxState.ty = nextTy;
  studyImageLightboxState.interacting = true;
  applyStudyImageLightboxTransform({ disableTransition: true });
  event.preventDefault();
}

/**
 * @function handleStudyImageLightboxTouchEnd
 * @description Finalizes touch interaction for the lightbox image.
 */

function handleStudyImageLightboxTouchEnd(event) {
  event.stopPropagation();
  const touches = event.targetTouches || [];

  if (touches.length >= 2) {
    const center = getStudyImageTouchCenter(touches[0], touches[1]);
    studyImageLightboxState.pinchLastCenterX = center.x;
    studyImageLightboxState.pinchLastCenterY = center.y;
    studyImageLightboxState.pinchLastDistance = getStudyImageTouchDistance(touches[0], touches[1]);
    studyImageLightboxState.interacting = true;
    applyStudyImageLightboxTransform({ disableTransition: true });
    return;
  }

  if (touches.length === 1 && studyImageLightboxState.scale > 1.001) {
    const touch = touches[0];
    studyImageLightboxState.panStartX = touch.clientX;
    studyImageLightboxState.panStartY = touch.clientY;
    studyImageLightboxState.startTx = studyImageLightboxState.tx;
    studyImageLightboxState.startTy = studyImageLightboxState.ty;
    studyImageLightboxState.pinchLastDistance = 0;
    studyImageLightboxState.interacting = true;
    applyStudyImageLightboxTransform({ disableTransition: true });
    return;
  }

  if (studyImageLightboxState.moved) {
    studyImageLightboxState.ignoreTapUntil = Date.now() + 220;
  }
  studyImageLightboxState.moved = false;
  if (studyImageLightboxState.scale <= 1.001) {
    resetStudyImageLightboxTransform({ animate: true });
    return;
  }
  studyImageLightboxState.interacting = false;
  studyImageLightboxState.pinchLastDistance = 0;
  applyStudyImageLightboxTransform({ disableTransition: false });
}

/**
 * @function handleStudyImageLightboxWheel
 * @description Handles mouse-wheel zoom for desktop/trackpad while the lightbox is open.
 */

function handleStudyImageLightboxWheel(event) {
  const lightbox = el('sessionImageLightbox');
  if (!lightbox || lightbox.classList.contains('hidden')) return;
  event.preventDefault();
  event.stopPropagation();
  const zoomFactor = event.deltaY < 0 ? 1.12 : 0.88;
  const nextScale = studyImageLightboxState.scale * zoomFactor;
  zoomStudyImageLightboxAt(nextScale, event.clientX, event.clientY);
}

/**
 * @function handleStudyImageLightboxImageClick
 * @description Handles tap/click behavior on the expanded image.
 */

function handleStudyImageLightboxImageClick(event) {
  event.stopPropagation();
  if (Date.now() < studyImageLightboxState.ignoreTapUntil) return;
  if (studyImageLightboxState.scale > 1.001) {
    resetStudyImageLightboxTransform({ animate: true });
    return;
  }
  closeStudyImageLightbox();
}

function openStudyImageLightbox(src) {
  const lightbox = el('sessionImageLightbox');
  const lightboxImg = el('sessionImageLightboxImg');
  if (!lightbox || !lightboxImg || !src) return;
  resetStudyImageLightboxTransform();
  lightboxImg.onload = () => resetStudyImageLightboxTransform();
  lightboxImg.src = src;
  lightbox.classList.remove('hidden');
  document.body.classList.add('session-image-open');
}

/**
 * @function closeStudyImageLightbox
 * @description Closes the study image lightbox.
 */

function closeStudyImageLightbox() {
  const lightbox = el('sessionImageLightbox');
  const lightboxImg = el('sessionImageLightboxImg');
  if (!lightbox || !lightboxImg) return;
  resetStudyImageLightboxTransform();
  lightbox.classList.add('hidden');
  lightboxImg.src = '';
  lightboxImg.onload = null;
  document.body.classList.remove('session-image-open');
}

/**
 * @function buildSessionCardImage
 * @description Builds session card image.
 */

function buildSessionCardImage(src, alt = 'Flashcard image') {
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.className = 'session-card-image';
  img.addEventListener('load', () => {
    queueSessionFaceOverflowSync();
  });
  img.addEventListener('click', e => {
    e.stopPropagation();
    openStudyImageLightbox(src);
  });
  return img;
}

// ============================================================================
// SubjectView + TopicView + Study Selection
// ============================================================================
/**
* @function refreshTopicSessionMeta
 * @description Refreshes topic session meta.
 */

async function refreshTopicSessionMeta(topicsForSubject = null) {
  if (!selectedSubject) {
    resetSessionMetaLoading();
    availableSessionCards = 0;
    sessionSize = 0;
    renderSessionSizeCounter();
    renderSessionFilterSummary();
    return;
  }

  const refreshRunId = ++sessionMetaRefreshRunId;
  const refreshSubjectId = String(selectedSubject.id || '').trim();
  setSessionMetaLoading(true);
  try {
    const topics = topicsForSubject || (await getTopicsBySubject(selectedSubject.id, {
      uiBlocking: false
    }));
    const selectedTopics = topics.filter(t => selectedTopicIds.has(t.id));
    const selectedTopicLabel = el('selectedTopicsSummary');
    if (selectedTopicLabel) {
      selectedTopicLabel.innerHTML = '';
      if (!selectedTopics.length) {
        selectedTopicLabel.classList.add('is-empty');
        selectedTopicLabel.textContent = 'Choose at least one topic below.';
      } else {
        selectedTopicLabel.classList.remove('is-empty');
        selectedTopics.forEach(topic => {
          const pill = document.createElement('span');
          pill.className = 'study-topic-pill';
          const name = String(topic?.name || '').trim() || 'Untitled topic';
          pill.textContent = name;
          pill.setAttribute('title', name);
          selectedTopicLabel.appendChild(pill);
        });
      }
    }

    const selectedIds = selectedTopics.map(t => t.id);
    // Load only refs/progress for the count and prefetch full card payloads in background.
    prefetchSessionTopicCardsInBackground(selectedIds, refreshSubjectId);
    const eligibleCardIds = await getEligibleSessionCardIdsByTopicIds(selectedIds, sessionFilterState, {
      uiBlocking: false,
      payloadLabel: 'session-size-refs',
      progressPayloadLabel: 'session-size-progress'
    });

    // Ignore stale async results if user switched subject/topics meanwhile.
    if (refreshRunId !== sessionMetaRefreshRunId) return;
    if (!selectedSubject || String(selectedSubject.id || '').trim() !== refreshSubjectId) return;

    availableSessionCards = eligibleCardIds.length;
    if (availableSessionCards <= 0) sessionSize = 0;
    else if (sessionSize <= 0) sessionSize = Math.min(15, availableSessionCards);
    else sessionSize = Math.min(sessionSize, availableSessionCards);
    renderSessionSizeCounter();
    renderSessionFilterSummary();

    const startBtn = el('startSessionBtn');
    if (startBtn) startBtn.disabled = !selectedTopics.length || availableSessionCards <= 0;
  } finally {
    setSessionMetaLoading(false);
  }
}

/**
 * @function openCreateCardEditor
 * @description Opens the create card editor.
 */

function openCreateCardEditor() {
  if (!selectedTopic) {
    alert('Pick a topic first.');
    return;
  }
  setDeckSelectionMode(false);
  el('editorTitle').textContent = `${selectedTopic.name}`;
  el('cardPrompt').value = '';
  el('cardAnswer').value = '';
  replaceFieldImages(el('cardPrompt'), el('questionImagePreview'), [], 'imageDataQ', updateCreateValidation);
  replaceFieldImages(el('cardAnswer'), el('answerImagePreview'), [], 'imageDataA', updateCreateValidation);
  const primaryToggle = el('primaryAnswerToggle');
  if (primaryToggle) primaryToggle.checked = true;
  el('mcqOptions').innerHTML = '';
  setMcqModeState(false, false);
  applyCreateQuestionTextAlign('center');
  applyCreateAnswerTextAlign('center');
  applyCreateOptionsTextAlign('center');
  createTouched = false;
  updateCreateValidation();
  setPreview('questionPreview', '', createQuestionTextAlign);
  setPreview('answerPreview', '', createAnswerTextAlign);
  loadEditorCards();
  setView(3);
}

/**
 * @function loadTopics
 * @description Loads and renders topics for the active subject including selection and bulk actions.
 */

async function loadTopics() {
  if (!selectedSubject) return;
  topicPrefetchRunId += 1;
  el('topicTitle').textContent = selectedSubject.name;
  applySubjectTheme(selectedSubject.accent || '#2dd4bf');
  const topics = await getTopicsBySubject(selectedSubject.id, { includeCounts: true });
  const topicListTitle = el('topicListTitle');
  if (topicListTitle) topicListTitle.textContent = topics.length === 1 ? 'Topic' : 'Topics';
  const validTopicIds = new Set(topics.map(t => t.id));
  const previousSelection = selectedTopicIds;
  selectedTopicIds = new Set(
    [...previousSelection].filter(topicId => validTopicIds.has(topicId))
  );
  const previousTopicSelection = topicSelectedIds;
  topicSelectedIds = new Set(
    [...previousTopicSelection].filter(topicId => validTopicIds.has(topicId))
  );
  if (!topics.length) setTopicSelectionMode(false);
  const list = el('topicList');
  list.innerHTML = '';
  topics.forEach(t => {
    const cardCount = Number.isFinite(Number(t?.cardCount)) ? Number(t.cardCount) : 0;
    const cardCountLabel = `${cardCount} ${cardCount === 1 ? 'card' : 'cards'}`;
    const row = document.createElement('div');
    row.className = 'tile topic-tile';
    if (topicSelectionMode) {
      row.classList.add('selection-mode');
      row.innerHTML = `
            <div class="tile-check">
              <div class="topic-tile-main">
                <div class="topic-tile-name">${escapeHTML(t.name)}</div>
                <div class="tiny topic-card-count">${cardCountLabel}</div>
              </div>
            </div>
          `;
      const selectWrap = document.createElement('label');
      selectWrap.className = 'card-select-control';
      selectWrap.innerHTML = `<input type="checkbox" aria-label="Select topic" />`;
      const checkbox = selectWrap.querySelector('input');
      checkbox.checked = topicSelectedIds.has(t.id);
      row.classList.toggle('selected-for-bulk', checkbox.checked);
      checkbox.addEventListener('click', e => e.stopPropagation());
      checkbox.addEventListener('change', () => {
        toggleTopicSelection(t.id, checkbox.checked);
        row.classList.toggle('selected-for-bulk', checkbox.checked);
      });
      row.addEventListener('click', e => {
        if (e.target.closest('.card-select-control')) return;
        const nextChecked = !checkbox.checked;
        checkbox.checked = nextChecked;
        toggleTopicSelection(t.id, nextChecked);
        row.classList.toggle('selected-for-bulk', nextChecked);
      });
      row.appendChild(selectWrap);
    } else {
      row.innerHTML = `
            <div class="tile-check">
              <div class="topic-tile-main">
                <div class="topic-tile-name">${escapeHTML(t.name)}</div>
                <div class="tiny topic-card-count">${cardCountLabel}</div>
              </div>
              <input type="checkbox" data-topic-id="${t.id}" />
            </div>
          `;
      const checkbox = row.querySelector('input[type="checkbox"]');
      checkbox.checked = selectedTopicIds.has(t.id);
      row.classList.toggle('selected', selectedTopicIds.has(t.id));
      row.onclick = () => {
        selectedTopic = t;
        session.active = false;
        el('cardsOverviewSection')?.classList.remove('hidden');
        el('studySessionSection')?.classList.add('hidden');
        renderSessionPills();
        if (cardCount <= 0) {
          openCreateCardEditor();
          return;
        }
        loadDeck();
        setView(2);
      };
      checkbox.addEventListener('click', async e => {
        e.stopPropagation();
        if (checkbox.checked) selectedTopicIds.add(t.id);
        else selectedTopicIds.delete(t.id);
        row.classList.toggle('selected', checkbox.checked);
        await refreshTopicSessionMeta(topics);
      });
    }
    list.appendChild(row);
  });
  if (!topics.length) list.innerHTML = '<div class="tiny">No topics yet.</div>';
  updateTopicSelectionUi();
  await refreshTopicSessionMeta(topics);
  if (topics.length) {
    void prefetchSubjectTopicCards(topics, selectedSubject.id);
  }
}

// ============================================================================
// EditorPanel (MCQ, Formatting, Table Builder, Formula)
// ============================================================================
/**
* @function syncPrimaryMcqUi
 * @description Synchronizes primary MCQ UI.
 */

function syncPrimaryMcqUi(edit = false) {
  const field = el(edit ? 'editPrimaryAnswerRow' : 'primaryAnswerRow');
  const badge = el(edit ? 'editPrimaryAnswerBadge' : 'primaryAnswerBadge');
  const toggle = el(edit ? 'editPrimaryAnswerToggle' : 'primaryAnswerToggle');
  if (!field || !badge || !toggle) return;
  const isCorrect = !!toggle.checked;
  field.classList.toggle('correct', isCorrect);
  field.classList.toggle('wrong', !isCorrect);
  badge.className = `mcq-badge ${isCorrect ? 'correct' : 'wrong'}`;
  badge.textContent = isCorrect ? 'Correct Answer ✓' : 'Wrong Answer ✕';
}

/**
 * @function setMcqModeState
 * @description Sets the MCQ mode state.
 */

function setMcqModeState(edit = false, enabled = false) {
  const field = el(edit ? 'editPrimaryAnswerRow' : 'primaryAnswerRow');
  const header = el(edit ? 'editPrimaryAnswerHeader' : 'primaryAnswerHeader');
  const toggle = el(edit ? 'editPrimaryAnswerToggle' : 'primaryAnswerToggle');
  const optionsEl = el(edit ? 'editMcqOptions' : 'mcqOptions');
  const optionsToolbar = el(edit ? 'editOptionsToolbar' : 'createOptionsToolbar');
  const answerInput = el(edit ? 'editCardAnswer' : 'cardAnswer');
  if (!field || !header || !toggle || !optionsEl) return;
  if (edit) editMcqMode = enabled;
  else mcqMode = enabled;
  optionsEl.classList.toggle('hidden', !enabled);
  if (optionsToolbar) optionsToolbar.classList.toggle('hidden', !enabled);
  header.classList.toggle('hidden', !enabled);
  field.classList.toggle('mcq-primary', enabled);
  field.classList.toggle('mcq-row', enabled);
  if (answerInput instanceof HTMLTextAreaElement) {
    answerInput.wrap = enabled ? 'off' : 'soft';
  }
  if (!enabled) {
    field.classList.remove('correct', 'wrong');
    return;
  }
  toggle.onchange = () => syncPrimaryMcqUi(edit);
  syncPrimaryMcqUi(edit);
  if (answerInput instanceof HTMLTextAreaElement) {
    enforcePrimaryMcqAnswerSingleLine(answerInput);
  }
  if (!edit) updateCreateValidation();
}

/**
 * @function isPrimaryMcqAnswerSingleLineMode
 * @description Returns whether primary MCQ answer single line mode.
 */

function isPrimaryMcqAnswerSingleLineMode(textarea) {
  if (!(textarea instanceof HTMLTextAreaElement)) return false;
  if (textarea.id === 'cardAnswer') return !!el('primaryAnswerRow')?.classList.contains('mcq-primary');
  if (textarea.id === 'editCardAnswer') return !!el('editPrimaryAnswerRow')?.classList.contains('mcq-primary');
  return false;
}

/**
 * @function enforcePrimaryMcqAnswerSingleLine
 * @description Handles enforce primary MCQ answer single line logic.
 */

function enforcePrimaryMcqAnswerSingleLine(textarea) {
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  if (!isPrimaryMcqAnswerSingleLineMode(textarea)) return;
  const value = String(textarea.value || '');
  const normalized = value.replace(/\r\n?/g, '\n').replace(/\n+/g, ' ');
  if (normalized === value) return;
  const pos = textarea.selectionStart ?? normalized.length;
  const nextPos = Math.max(0, Math.min(normalized.length, pos));
  textarea.value = normalized;
  textarea.setSelectionRange(nextPos, nextPos);
  if (textarea.id === 'cardAnswer') updateCreateValidation();
}

/**
 * @function handlePrimaryMcqAnswerKeydown
 * @description Handles primary MCQ answer keydown.
 */

function handlePrimaryMcqAnswerKeydown(e) {
  const textarea = e.target;
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  if (!isPrimaryMcqAnswerSingleLineMode(textarea)) return;
  if (e.key === 'Enter') {
    e.preventDefault();
  }
}

/**
 * @function getAdditionalMcqRowCount
 * @description Returns the additional MCQ row count.
 */

function getAdditionalMcqRowCount(edit = false) {
  const optionsEl = el(edit ? 'editMcqOptions' : 'mcqOptions');
  if (!optionsEl) return 0;
  return optionsEl.querySelectorAll('.mcq-row[data-primary="false"]').length;
}

/**
 * @function syncMcqPrimaryAnswerMode
 * @description Synchronizes MCQ primary answer mode.
 */

function syncMcqPrimaryAnswerMode(edit = false) {
  const hasAdditionalRows = getAdditionalMcqRowCount(edit) > 0;
  setMcqModeState(edit, hasAdditionalRows);
  if (!edit) updateCreateValidation();
}

let createTouched = false;
/**
 * @function updateCreateValidation
 * @description Updates create validation.
 */
function updateCreateValidation(showErrors = false) {
  const question = el('cardPrompt');
  const answer = el('cardAnswer');
  const hasQuestionImage = getFieldImageList(question, 'imageDataQ').length > 0;
  const hasAnswerImage = getFieldImageList(answer, 'imageDataA').length > 0;
  const qValid = question.value.trim().length > 0 || hasQuestionImage;
  const aValid = mcqMode
    ? getCreateOptionCount() > 0
    : answer.value.trim().length > 0 || hasAnswerImage;
  const isValid = qValid && aValid;

  const addBtn = el('addCardBtn');
  if (addBtn) addBtn.disabled = !isValid;

  const shouldShow = showErrors || createTouched;
  question.classList.toggle('field-invalid', shouldShow && !qValid);
  answer.classList.toggle('field-invalid', shouldShow && !aValid);
  el('questionError').classList.toggle('hidden', !(shouldShow && !qValid));
  el('answerError').classList.toggle('hidden', !(shouldShow && !aValid));
  return isValid;
}

/**
 * @function debounce
 * @description Handles debounce logic.
 */

function debounce(fn, wait = 300) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/**
 * @function setPreview
 * @description Sets the preview.
 */

function setPreview(previewId, value, textAlign = 'left') {
  const preview = el(previewId);
  if (!preview) return;
  const align = normalizeTextAlign(textAlign);
  preview.classList.add('rich-content');
  preview.classList.remove('rich-align-left', 'rich-align-center', 'rich-align-justify');
  preview.classList.add(`rich-align-${align}`);
  if (!value || !value.trim()) {
    preview.innerHTML = '<span class="tiny">Live preview</span>';
    return;
  }
  renderRich(preview, value, { textAlign: align });
}

/**
 * @function wireLivePreview
 * @description Wires live preview.
 */

function wireLivePreview(inputId, previewId, getAlign = () => 'left') {
  const input = el(inputId);
  const preview = el(previewId);
  if (!input || !preview) return;
  const render = () => setPreview(previewId, input.value, getAlign());
  const debounced = debounce(render, 300);
  input.addEventListener('input', debounced);
  render();
}

/**
 * @function syncToolbarAlignmentButtons
 * @description Synchronizes toolbar alignment buttons.
 */

function syncToolbarAlignmentButtons(group, align) {
  const normalized = normalizeTextAlign(align);
  document.querySelectorAll(`.text-toolbar [data-action="align"][data-group="${group}"]`).forEach(btn => {
    const active = btn.dataset.align === normalized;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

/**
 * @function applyCreateQuestionTextAlign
 * @description Applies create question text align.
 */

function applyCreateQuestionTextAlign(align) {
  createQuestionTextAlign = normalizeTextAlign(align);
  syncToolbarAlignmentButtons('create-question', createQuestionTextAlign);
  setPreview('questionPreview', el('cardPrompt')?.value || '', createQuestionTextAlign);
}

/**
 * @function applyCreateAnswerTextAlign
 * @description Applies create answer text align.
 */

function applyCreateAnswerTextAlign(align) {
  createAnswerTextAlign = normalizeTextAlign(align);
  syncToolbarAlignmentButtons('create-answer', createAnswerTextAlign);
  setPreview('answerPreview', el('cardAnswer')?.value || '', createAnswerTextAlign);
}

/**
 * @function applyEditQuestionTextAlign
 * @description Applies edit question text align.
 */

function applyEditQuestionTextAlign(align) {
  editQuestionTextAlign = normalizeTextAlign(align);
  syncToolbarAlignmentButtons('edit-question', editQuestionTextAlign);
  setPreview('editQuestionPreview', el('editCardPrompt')?.value || '', editQuestionTextAlign);
}

/**
 * @function applyEditAnswerTextAlign
 * @description Applies edit answer text align.
 */

function applyEditAnswerTextAlign(align) {
  editAnswerTextAlign = normalizeTextAlign(align);
  syncToolbarAlignmentButtons('edit-answer', editAnswerTextAlign);
  setPreview('editAnswerPreview', el('editCardAnswer')?.value || '', editAnswerTextAlign);
}

/**
 * @function applyCreateOptionsTextAlign
 * @description Applies create options text align.
 */

function applyCreateOptionsTextAlign(align) {
  createOptionsTextAlign = normalizeTextAlign(align);
  syncToolbarAlignmentButtons('create-options', createOptionsTextAlign);
}

/**
 * @function applyEditOptionsTextAlign
 * @description Applies edit options text align.
 */

function applyEditOptionsTextAlign(align) {
  editOptionsTextAlign = normalizeTextAlign(align);
  syncToolbarAlignmentButtons('edit-options', editOptionsTextAlign);
}

/**
 * @function ensureListInputLeftAligned
 * @description Ensures list input left aligned.
 */

function ensureListInputLeftAligned(textarea) {
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  if (textarea.id === 'cardPrompt') applyCreateQuestionTextAlign('left');
  else if (textarea.id === 'cardAnswer') applyCreateAnswerTextAlign('left');
  else if (textarea.id === 'editCardPrompt') applyEditQuestionTextAlign('left');
  else if (textarea.id === 'editCardAnswer') applyEditAnswerTextAlign('left');
}

/**
 * @function emitTextareaInput
 * @description Emits textarea input.
 */

function emitTextareaInput(textarea) {
  if (!textarea) return;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * @function toggleInlineFormat
 * @description Toggles inline format.
 */

function toggleInlineFormat(textarea, format = 'bold') {
  if (!textarea) return;
  const markers = { bold: '**', italic: '*', underline: '__' };
  const marker = markers[format];
  if (!marker) return;

  const value = textarea.value || '';
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const selected = value.slice(start, end);

  if (start === end) {
    const insert = `${marker}${marker}`;
    textarea.setRangeText(insert, start, end, 'end');
    const caret = start + marker.length;
    textarea.setSelectionRange(caret, caret);
    textarea.focus();
    emitTextareaInput(textarea);
    return;
  }

  const wrappedSelection = selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2;
  const wrappedAroundSelection = start >= marker.length
    && value.slice(start - marker.length, start) === marker
    && value.slice(end, end + marker.length) === marker;

  if (wrappedSelection) {
    const unwrapped = selected.slice(marker.length, selected.length - marker.length);
    textarea.setRangeText(unwrapped, start, end, 'end');
    textarea.setSelectionRange(start, start + unwrapped.length);
  } else if (wrappedAroundSelection) {
    textarea.setRangeText(selected, start - marker.length, end + marker.length, 'end');
    const nextStart = start - marker.length;
    textarea.setSelectionRange(nextStart, nextStart + selected.length);
  } else {
    const wrapped = `${marker}${selected}${marker}`;
    textarea.setRangeText(wrapped, start, end, 'end');
    textarea.setSelectionRange(start + marker.length, start + marker.length + selected.length);
  }

  textarea.focus();
  emitTextareaInput(textarea);
}

/**
 * @function normalizeInlineTextColor
 * @description Validates and normalizes inline text color values.
 */

function normalizeInlineTextColor(color = '') {
  const raw = String(color || '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(raw)) return raw.toLowerCase();
  if (/^[a-zA-Z]+$/.test(raw)) return raw.toLowerCase();
  return '';
}

/**
 * @function applyInlineColor
 * @description Wraps selected text with markdown color syntax: [text]{color}.
 */

function applyInlineColor(inputEl, color = '') {
  const isSupportedInput =
    inputEl instanceof HTMLTextAreaElement
    || (inputEl instanceof HTMLInputElement && inputEl.type === 'text');
  if (!isSupportedInput) return;
  const safeColor = normalizeInlineTextColor(color);
  if (!safeColor) return;

  const value = String(inputEl.value || '');
  const start = inputEl.selectionStart ?? 0;
  const end = inputEl.selectionEnd ?? start;
  const selected = value.slice(start, end);

  if (start === end) {
    const placeholder = 'text';
    const insert = `[${placeholder}]{${safeColor}}`;
    inputEl.setRangeText(insert, start, end, 'end');
    const nextStart = start + 1;
    inputEl.setSelectionRange(nextStart, nextStart + placeholder.length);
    inputEl.focus();
    emitTextareaInput(inputEl);
    return;
  }

  const wrapped = `[${selected}]{${safeColor}}`;
  inputEl.setRangeText(wrapped, start, end, 'end');
  inputEl.setSelectionRange(start + 1, start + 1 + selected.length);
  inputEl.focus();
  emitTextareaInput(inputEl);
}

/**
 * @function closeInlineColorMenus
 * @description Closes all inline color menus, except an optional control node.
 */

function closeInlineColorMenus(exceptControl = null) {
  document.querySelectorAll('.inline-color-control').forEach(control => {
    if (exceptControl && control === exceptControl) return;
    control.classList.remove('open');
    const toggle = control.querySelector('.inline-color-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  });
}

/**
 * @function wireInlineColorMenuGlobalListeners
 * @description Wires global listeners for closing inline color menus.
 */

function wireInlineColorMenuGlobalListeners() {
  if (inlineColorMenuListenersWired) return;
  inlineColorMenuListenersWired = true;

  document.addEventListener('click', e => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const inControl = target.closest('.inline-color-control');
    if (inControl) return;
    closeInlineColorMenus();
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeInlineColorMenus();
  });
}

/**
 * @function buildInlineColorToolbarControl
 * @description Builds one inline color toolbar control with an expandable 4x2 swatch menu.
 */

function buildInlineColorToolbarControl(group = '', targetId = '') {
  const control = document.createElement('div');
  control.className = 'inline-color-control';
  control.dataset.group = group;
  control.dataset.target = targetId;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn btn-small toolbar-btn inline-color-toggle';
  toggle.textContent = 'Color';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-haspopup', 'true');
  toggle.setAttribute('aria-label', 'Choose text color');

  const menu = document.createElement('div');
  menu.className = 'inline-color-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Text colors');

  INLINE_TEXT_COLOR_SWATCHES.forEach(swatch => {
    const swatchBtn = document.createElement('button');
    swatchBtn.type = 'button';
    swatchBtn.className = 'inline-color-swatch';
    swatchBtn.title = swatch.name;
    swatchBtn.setAttribute('aria-label', swatch.name);
    swatchBtn.style.setProperty('--inline-swatch-color', swatch.value);
    swatchBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const targetInput = el(targetId);
      if (targetInput) applyInlineColor(targetInput, swatch.value);
      closeInlineColorMenus();
    });
    menu.appendChild(swatchBtn);
  });

  toggle.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const isOpen = control.classList.contains('open');
    closeInlineColorMenus();
    if (isOpen) return;
    control.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
  });

  control.appendChild(toggle);
  control.appendChild(menu);
  return control;
}

/**
 * @function ensureInlineColorToolbarControls
 * @description Injects inline color controls into relevant editor toolbars.
 */

function ensureInlineColorToolbarControls() {
  Object.entries(INLINE_TEXT_COLOR_TOOLBAR_TARGETS).forEach(([group, targetId]) => {
    const toolbar = document.querySelector(`.text-toolbar[data-group="${group}"]`);
    if (!toolbar) return;
    if (toolbar.querySelector('.inline-color-control')) return;
    const control = buildInlineColorToolbarControl(group, targetId);
    const tableBtn = toolbar.querySelector(`.toolbar-btn[data-action="table"][data-target="${targetId}"]`);
    const tableSegment = tableBtn?.closest('.toolbar-segment');
    if (tableBtn && tableSegment) {
      tableBtn.insertAdjacentElement('afterend', control);
    } else {
      const fallbackSegment = toolbar.querySelector('.toolbar-segment:last-child');
      if (fallbackSegment) fallbackSegment.appendChild(control);
      else toolbar.appendChild(control);
    }
  });
  wireInlineColorMenuGlobalListeners();
}

/**
 * @function toggleListPrefix
 * @description Toggles list prefix.
 */

function toggleListPrefix(textarea, listType = 'ul') {
  if (!textarea) return;
  ensureListInputLeftAligned(textarea);
  const value = textarea.value || '';
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEndIdx = value.indexOf('\n', end);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  const line = value.slice(lineStart, lineEnd);
  const meta = parseListLineMeta(line);
  const indent = (line.match(/^\s*/) || [''])[0];
  const content = line.slice(indent.length);
  const plainText = meta ? meta.text : content;

  let nextLine = line;
  if (listType === 'ol') {
    if (meta?.type === 'ol') nextLine = meta.indent + plainText;
    else nextLine = indent + '1. ' + plainText;
  } else {
    if (meta?.type === 'ul') nextLine = meta.indent + plainText;
    else nextLine = indent + '- ' + plainText;
  }

  textarea.setRangeText(nextLine, lineStart, lineEnd, 'end');
  textarea.focus();
  emitTextareaInput(textarea);
}

/**
 * @function getTableTargetLabel
 * @description Returns the table target label.
 */

function getTableTargetLabel(targetId = '') {
  const map = {
    cardPrompt: 'Question',
    cardAnswer: 'Answer',
    editCardPrompt: 'Edit Question',
    editCardAnswer: 'Edit Answer'
  };
  return map[targetId] || 'Question';
}

/**
 * @function clampTableRows
 * @description Clamps table rows.
 */

function clampTableRows(value = 3) {
  return Math.max(1, Math.min(20, Math.trunc(Number(value) || 3)));
}

/**
 * @function clampTableCols
 * @description Clamps table cols.
 */

function clampTableCols(value = 3) {
  return Math.max(1, Math.min(10, Math.trunc(Number(value) || 3)));
}

/**
 * @function normalizeTableCellAlign
 * @description Normalizes table cell align.
 */

function normalizeTableCellAlign(value = '') {
  const v = String(value || '').toLowerCase();
  if (v === 'center' || v === 'right') return v;
  return 'left';
}

/**
 * @function normalizeTableMergeRegion
 * @description Normalizes a table merge region to current table bounds.
 */

function normalizeTableMergeRegion(region, state) {
  const safeState = state && typeof state === 'object' ? state : normalizeTableBuilderState();
  const zone = String(region?.zone || '') === 'header' ? 'header' : 'body';
  if (zone === 'header' && !safeState.withHeader) return null;
  const maxRow = zone === 'header' ? 0 : Math.max(0, safeState.rows - 1);
  const maxCol = Math.max(0, safeState.cols - 1);

  const startRowRaw = Number.isFinite(Number(region?.startRow)) ? Number(region.startRow) : 0;
  const endRowRaw = Number.isFinite(Number(region?.endRow)) ? Number(region.endRow) : startRowRaw;
  const startColRaw = Number.isFinite(Number(region?.startCol)) ? Number(region.startCol) : 0;
  const endColRaw = Number.isFinite(Number(region?.endCol)) ? Number(region.endCol) : startColRaw;

  let startRow = Math.max(0, Math.min(maxRow, Math.trunc(startRowRaw)));
  let endRow = Math.max(0, Math.min(maxRow, Math.trunc(endRowRaw)));
  let startCol = Math.max(0, Math.min(maxCol, Math.trunc(startColRaw)));
  let endCol = Math.max(0, Math.min(maxCol, Math.trunc(endColRaw)));

  if (zone === 'header') {
    startRow = 0;
    endRow = 0;
  }
  if (endRow < startRow) [startRow, endRow] = [endRow, startRow];
  if (endCol < startCol) [startCol, endCol] = [endCol, startCol];
  if (startRow === endRow && startCol === endCol) return null;

  return { zone, startRow, endRow, startCol, endCol };
}

/**
 * @function tableRegionsIntersect
 * @description Returns true when two merge/selection regions overlap.
 */

function tableRegionsIntersect(a, b) {
  if (!a || !b) return false;
  if (a.zone !== b.zone) return false;
  return !(a.endRow < b.startRow || b.endRow < a.startRow || a.endCol < b.startCol || b.endCol < a.startCol);
}

/**
 * @function tableRegionEquals
 * @description Returns true when two regions are identical.
 */

function tableRegionEquals(a, b) {
  if (!a || !b) return false;
  return a.zone === b.zone
    && a.startRow === b.startRow
    && a.endRow === b.endRow
    && a.startCol === b.startCol
    && a.endCol === b.endCol;
}

/**
 * @function normalizeTableMergeRegions
 * @description Normalizes and de-duplicates merge regions for current table state.
 */

function normalizeTableMergeRegions(regions = [], state = null) {
  const safeState = state && typeof state === 'object' ? state : normalizeTableBuilderState();
  const out = [];
  const list = Array.isArray(regions) ? regions : [];
  list.forEach(region => {
    const normalized = normalizeTableMergeRegion(region, safeState);
    if (!normalized) return;
    if (out.some(existing => tableRegionsIntersect(existing, normalized))) return;
    out.push(normalized);
  });
  return out;
}

/**
 * @function buildTableMergeLookup
 * @description Builds anchor/covered lookup for merged cells.
 */

function buildTableMergeLookup(state, zone = 'body') {
  const safeState = state && typeof state === 'object' ? state : normalizeTableBuilderState();
  const lookup = new Map();
  const wantedZone = zone === 'header' ? 'header' : 'body';
  const regions = normalizeTableMergeRegions(safeState.mergeRegions, safeState).filter(region => region.zone === wantedZone);
  regions.forEach(region => {
    const rowSpan = region.endRow - region.startRow + 1;
    const colSpan = region.endCol - region.startCol + 1;
    for (let row = region.startRow; row <= region.endRow; row++) {
      for (let col = region.startCol; col <= region.endCol; col++) {
        const key = `${wantedZone}:${row}:${col}`;
        if (row === region.startRow && col === region.startCol) {
          lookup.set(key, {
            kind: 'anchor',
            zone: wantedZone,
            startRow: region.startRow,
            endRow: region.endRow,
            startCol: region.startCol,
            endCol: region.endCol,
            rowSpan,
            colSpan
          });
        } else {
          lookup.set(key, {
            kind: 'covered',
            zone: wantedZone,
            anchorRow: region.startRow,
            anchorCol: region.startCol
          });
        }
      }
    }
  });
  return lookup;
}

/**
 * @function getTableSelectionRegion
 * @description Returns the current selection as a normalized region.
 */

function getTableSelectionRegion() {
  const selection = getTableBuilderSelection();
  if (!selection) return null;
  return {
    zone: selection.zone,
    startRow: Math.min(selection.startRow, selection.endRow),
    endRow: Math.max(selection.startRow, selection.endRow),
    startCol: Math.min(selection.startCol, selection.endCol),
    endCol: Math.max(selection.startCol, selection.endCol)
  };
}

/**
 * @function resizeTableGrid
 * @description Handles resize table grid logic.
 */

function resizeTableGrid(source = [], rows = 1, cols = 1) {
  const safeSource = Array.isArray(source) ? source : [];
  return Array.from({ length: rows }, (_, rowIdx) => {
    const prevRow = Array.isArray(safeSource[rowIdx]) ? safeSource[rowIdx] : [];
    return Array.from({ length: cols }, (_, colIdx) => String(prevRow[colIdx] ?? ''));
  });
}

/**
 * @function resizeTableAlignmentGrid
 * @description Handles resize table alignment grid logic.
 */

function resizeTableAlignmentGrid(source = [], rows = 1, cols = 1) {
  const safeSource = Array.isArray(source) ? source : [];
  return Array.from({ length: rows }, (_, rowIdx) => {
    const prevRow = Array.isArray(safeSource[rowIdx]) ? safeSource[rowIdx] : [];
    return Array.from({ length: cols }, (_, colIdx) => normalizeTableCellAlign(prevRow[colIdx] ?? 'left'));
  });
}

/**
 * @function normalizeTableBuilderState
 * @description Normalizes table builder state.
 */

function normalizeTableBuilderState(next = {}) {
  const rows = clampTableRows(next.rows ?? tableBuilderState.rows);
  const cols = clampTableCols(next.cols ?? tableBuilderState.cols);
  const withHeader = typeof next.withHeader === 'boolean'
    ? next.withHeader
    : !!tableBuilderState.withHeader;
  const headerSource = Array.isArray(next.header) ? [next.header] : [tableBuilderState.header];
  const bodySource = Array.isArray(next.body) ? next.body : tableBuilderState.body;
  const headerAlignSource = Array.isArray(next.headerAlign) ? [next.headerAlign] : [tableBuilderState.headerAlign];
  const bodyAlignSource = Array.isArray(next.bodyAlign) ? next.bodyAlign : tableBuilderState.bodyAlign;
  const header = resizeTableGrid(headerSource, 1, cols)[0];
  const body = resizeTableGrid(bodySource, rows, cols);
  const headerAlign = resizeTableAlignmentGrid(headerAlignSource, 1, cols)[0];
  const bodyAlign = resizeTableAlignmentGrid(bodyAlignSource, rows, cols);
  const mergeSource = Array.isArray(next.mergeRegions) ? next.mergeRegions : tableBuilderState.mergeRegions;
  const baseState = { rows, cols, withHeader, header, body, headerAlign, bodyAlign, mergeRegions: [] };
  const mergeRegions = normalizeTableMergeRegions(mergeSource, baseState);
  tableBuilderState = { ...baseState, mergeRegions };
  return tableBuilderState;
}

/**
 * @function getTableBuilderCellAlign
 * @description Returns the table builder cell align.
 */

function getTableBuilderCellAlign(zone = 'body', row = 0, col = 0) {
  const state = normalizeTableBuilderState();
  if (zone === 'header') return normalizeTableCellAlign(state.headerAlign[col] || 'left');
  return normalizeTableCellAlign(state.bodyAlign[row]?.[col] || 'left');
}

/**
 * @function setTableBuilderCellAlign
 * @description Sets the table builder cell align.
 */

function setTableBuilderCellAlign(zone = 'body', row = 0, col = 0, align = 'left') {
  const state = normalizeTableBuilderState();
  const safeAlign = normalizeTableCellAlign(align);
  if (zone === 'header') {
    if (col < 0 || col >= state.cols) return;
    state.headerAlign[col] = safeAlign;
  } else {
    if (row < 0 || row >= state.rows || col < 0 || col >= state.cols) return;
    state.bodyAlign[row][col] = safeAlign;
  }
}

/**
 * @function getTableBuilderSelection
 * @description Returns the table builder selection.
 */

function getTableBuilderSelection() {
  const state = normalizeTableBuilderState();
  if (!tableBuilderSelection) return null;
  const zone = tableBuilderSelection.zone === 'header' ? 'header' : 'body';
  if (zone === 'header' && !state.withHeader) return null;

  const maxRow = zone === 'header' ? 0 : Math.max(0, state.rows - 1);
  const maxCol = Math.max(0, state.cols - 1);
  const startRow = Math.max(0, Math.min(maxRow, Math.trunc(Number(tableBuilderSelection.startRow ?? tableBuilderSelection.row ?? 0))));
  const endRow = Math.max(0, Math.min(maxRow, Math.trunc(Number(tableBuilderSelection.endRow ?? tableBuilderSelection.row ?? startRow))));
  const startCol = Math.max(0, Math.min(maxCol, Math.trunc(Number(tableBuilderSelection.startCol ?? tableBuilderSelection.col ?? 0))));
  const endCol = Math.max(0, Math.min(maxCol, Math.trunc(Number(tableBuilderSelection.endCol ?? tableBuilderSelection.col ?? startCol))));

  if (zone === 'header') {
    return {
      zone,
      startRow: 0,
      endRow: 0,
      startCol: Math.min(startCol, endCol),
      endCol: Math.max(startCol, endCol)
    };
  }
  return {
    zone,
    startRow: Math.min(startRow, endRow),
    endRow: Math.max(startRow, endRow),
    startCol: Math.min(startCol, endCol),
    endCol: Math.max(startCol, endCol)
  };
}

/**
 * @function setTableBuilderSelection
 * @description Sets the table builder selection.
 */

function setTableBuilderSelection(zone = 'body', row = 0, col = 0, options = {}) {
  const state = normalizeTableBuilderState();
  const safeZone = zone === 'header' ? 'header' : 'body';
  const safeRow = Math.max(0, Number(row || 0));
  const safeCol = Math.max(0, Number(col || 0));
  if (safeCol >= state.cols || safeCol < 0) return;
  const opts = options && typeof options === 'object' ? options : {};
  const extendRange = !!opts.extendRange;
  const userInitiated = opts.userInitiated !== false;
  const current = getTableBuilderSelection();
  if (safeZone === 'header') {
    if (!state.withHeader) return;
    const anchorCol = extendRange && current?.zone === 'header' ? current.startCol : safeCol;
    tableBuilderSelection = {
      zone: 'header',
      startRow: 0,
      endRow: 0,
      startCol: Math.min(anchorCol, safeCol),
      endCol: Math.max(anchorCol, safeCol)
    };
  } else {
    if (safeRow >= state.rows || safeRow < 0) return;
    const anchorRow = extendRange && current?.zone === 'body' ? current.startRow : safeRow;
    const anchorCol = extendRange && current?.zone === 'body' ? current.startCol : safeCol;
    tableBuilderSelection = {
      zone: 'body',
      startRow: Math.min(anchorRow, safeRow),
      endRow: Math.max(anchorRow, safeRow),
      startCol: Math.min(anchorCol, safeCol),
      endCol: Math.max(anchorCol, safeCol)
    };
  }
  if (userInitiated) tableBuilderHasUserSelection = true;
  syncTableBuilderAlignmentButtons();
  syncTableBuilderSelectionLabel();
  syncTableBuilderMergeButtons();
}

/**
 * @function ensureTableBuilderSelection
 * @description Ensures table builder selection.
 */

function ensureTableBuilderSelection() {
  const state = normalizeTableBuilderState();
  if (!state.rows || !state.cols) {
    tableBuilderSelection = null;
    return null;
  }
  return getTableBuilderSelection();
}

/**
 * @function clearTableBuilderSelection
 * @description Clears current table-builder selection and resets related controls.
 */

function clearTableBuilderSelection() {
  tableBuilderSelection = null;
  tableBuilderHasUserSelection = false;
  syncTableBuilderAlignmentButtons();
  syncTableBuilderSelectionLabel();
  syncTableBuilderMergeButtons();
}

/**
 * @function syncTableBuilderAlignmentButtons
 * @description Synchronizes table builder alignment buttons.
 */

function syncTableBuilderAlignmentButtons() {
  const selection = ensureTableBuilderSelection();
  let selectedAlign = null;
  if (selection) {
    const aligns = [];
    for (let row = selection.startRow; row <= selection.endRow; row++) {
      for (let col = selection.startCol; col <= selection.endCol; col++) {
        aligns.push(getTableBuilderCellAlign(selection.zone, row, col));
      }
    }
    if (aligns.length && aligns.every(align => align === aligns[0])) selectedAlign = aligns[0];
  }
  document.querySelectorAll('.table-builder-align-btn').forEach(btn => {
    const align = normalizeTableCellAlign(btn.dataset.align || 'left');
    const isActive = !!selectedAlign && selectedAlign === align;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

/**
 * @function syncTableBuilderSelectionLabel
 * @description Synchronizes table builder selection label.
 */

function syncTableBuilderSelectionLabel() {
  const label = el('tableCellSelectionLabel');
  if (!label) return;
  const selection = ensureTableBuilderSelection();
  if (!selection) {
    label.textContent = 'Cell: none selected';
    return;
  }
  const isRange = selection.startRow !== selection.endRow || selection.startCol !== selection.endCol;
  if (selection.zone === 'header') {
    label.textContent = isRange
      ? `Cells: Header ${selection.startCol + 1}-${selection.endCol + 1}`
      : `Cell: Header ${selection.startCol + 1}`;
    return;
  }
  label.textContent = isRange
    ? `Cells: R${selection.startRow + 1}C${selection.startCol + 1} → R${selection.endRow + 1}C${selection.endCol + 1}`
    : `Cell: R${selection.startRow + 1} C${selection.startCol + 1}`;
}

/**
 * @function applyTableBuilderInputAlign
 * @description Applies table builder input align.
 */

function applyTableBuilderInputAlign(input, align = 'left') {
  if (!(input instanceof HTMLInputElement)) return;
  const safeAlign = normalizeTableCellAlign(align);
  input.classList.remove('table-align-left', 'table-align-center', 'table-align-right');
  input.classList.add(`table-align-${safeAlign}`);
}

/**
 * @function syncTableBuilderControls
 * @description Synchronizes table builder controls.
 */

function syncTableBuilderControls() {
  const rowsInput = el('tableRowsInput');
  const colsInput = el('tableColsInput');
  const headerToggle = el('tableHeaderToggle');
  const state = normalizeTableBuilderState();
  if (rowsInput) rowsInput.value = String(state.rows);
  if (colsInput) colsInput.value = String(state.cols);
  if (headerToggle) headerToggle.checked = !!state.withHeader;
}

/**
 * @function createTableBuilderInput
 * @description Creates table builder input.
 */

function createTableBuilderInput(zone = 'body', row = 0, col = 0, value = '', align = 'left') {
  const input = document.createElement('input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.className = 'table-builder-cell-input';
  input.dataset.zone = zone;
  input.dataset.row = String(row);
  input.dataset.col = String(col);
  input.placeholder = zone === 'header' ? `Header ${col + 1}` : `R${row + 1}C${col + 1}`;
  input.value = value;
  applyTableBuilderInputAlign(input, align);
  attachAutoClose(input);
  input.addEventListener('keydown', handleInlineFormatShortcut);
  input.addEventListener('keydown', handleTextAlignShortcut);
  return input;
}

/**
 * @function renderTableBuilderGrid
 * @description Renders table builder grid.
 */

function renderTableBuilderGrid() {
  const container = el('tableBuilderGrid');
  if (!container) return;
  const state = normalizeTableBuilderState();
  container.innerHTML = '';

  const sheet = document.createElement('table');
  sheet.className = 'table-builder-sheet';
  const selection = getTableSelectionRegion();
  const headerMergeLookup = buildTableMergeLookup(state, 'header');
  const bodyMergeLookup = buildTableMergeLookup(state, 'body');

  if (state.withHeader) {
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    for (let colIdx = 0; colIdx < state.cols; colIdx++) {
      const key = `header:0:${colIdx}`;
      const mergeMeta = headerMergeLookup.get(key);
      if (mergeMeta?.kind === 'covered') continue;
      const th = document.createElement('th');
      const region = mergeMeta?.kind === 'anchor'
        ? mergeMeta
        : { zone: 'header', startRow: 0, endRow: 0, startCol: colIdx, endCol: colIdx, rowSpan: 1, colSpan: 1 };
      const isSelected = !!selection && tableRegionsIntersect(selection, region);
      th.classList.toggle('is-selected', isSelected);
      if (region.colSpan > 1) th.colSpan = region.colSpan;
      const input = createTableBuilderInput('header', 0, colIdx, state.header[colIdx], state.headerAlign[colIdx]);
      th.appendChild(input);
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    sheet.appendChild(thead);
  }

  const tbody = document.createElement('tbody');
  state.body.forEach((rowValues, rowIdx) => {
    const tr = document.createElement('tr');
    for (let colIdx = 0; colIdx < rowValues.length; colIdx++) {
      const key = `body:${rowIdx}:${colIdx}`;
      const mergeMeta = bodyMergeLookup.get(key);
      if (mergeMeta?.kind === 'covered') continue;
      const td = document.createElement('td');
      const region = mergeMeta?.kind === 'anchor'
        ? mergeMeta
        : { zone: 'body', startRow: rowIdx, endRow: rowIdx, startCol: colIdx, endCol: colIdx, rowSpan: 1, colSpan: 1 };
      const isSelected = !!selection && tableRegionsIntersect(selection, region);
      td.classList.toggle('is-selected', isSelected);
      if (region.colSpan > 1) td.colSpan = region.colSpan;
      if (region.rowSpan > 1) td.rowSpan = region.rowSpan;
      const input = createTableBuilderInput('body', rowIdx, colIdx, rowValues[colIdx], state.bodyAlign[rowIdx][colIdx]);
      td.appendChild(input);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  sheet.appendChild(tbody);
  container.appendChild(sheet);
  syncTableBuilderAlignmentButtons();
  syncTableBuilderSelectionLabel();
  syncTableBuilderMergeButtons();
}

/**
 * @function updateTableBuilderFromControls
 * @description Updates table builder from controls.
 */

function updateTableBuilderFromControls() {
  const rowsInput = el('tableRowsInput');
  const colsInput = el('tableColsInput');
  const headerToggle = el('tableHeaderToggle');
  normalizeTableBuilderState({
    rows: clampTableRows(rowsInput?.value),
    cols: clampTableCols(colsInput?.value),
    withHeader: !!headerToggle?.checked
  });
  syncTableBuilderControls();
  renderTableBuilderGrid();
}

/**
 * @function stepTableBuilderSize
 * @description Steps table builder size.
 */

function stepTableBuilderSize(axis = 'rows', delta = 1) {
  const state = normalizeTableBuilderState();
  if (axis === 'cols') {
    normalizeTableBuilderState({ cols: clampTableCols(state.cols + delta) });
  } else {
    normalizeTableBuilderState({ rows: clampTableRows(state.rows + delta) });
  }
  syncTableBuilderControls();
  renderTableBuilderGrid();
}

/**
 * @function handleTableBuilderInput
 * @description Handles table builder input.
 */

function handleTableBuilderInput(e) {
  const target = e.target;
  if (!(target instanceof HTMLInputElement) || !target.classList.contains('table-builder-cell-input')) return;
  const zone = target.dataset.zone || 'body';
  const row = Math.max(0, Number(target.dataset.row || 0));
  const col = Math.max(0, Number(target.dataset.col || 0));
  const value = String(target.value || '');
  const state = normalizeTableBuilderState();
  if (zone === 'header') {
    if (col < state.cols) state.header[col] = value;
  } else if (row < state.rows && col < state.cols) {
    state.body[row][col] = value;
  }
}

/**
 * @function handleTableBuilderPointerDown
 * @description Tracks pointer-origin focus so Shift+click range selection is not reset by focus events.
 */

function handleTableBuilderPointerDown(e) {
  const target = e.target;
  suppressTableBuilderFocusSelection = !!(target instanceof HTMLInputElement && target.classList.contains('table-builder-cell-input'));
}

/**
 * @function handleTableBuilderSelection
 * @description Handles table builder selection.
 */

function handleTableBuilderSelection(e) {
  const target = e.target;
  if (!(target instanceof HTMLInputElement) || !target.classList.contains('table-builder-cell-input')) return;
  if (e.type === 'focusin' && (suppressTableBuilderFocusSelection || suppressTableBuilderProgrammaticFocusSelection)) {
    suppressTableBuilderProgrammaticFocusSelection = false;
    return;
  }
  const zone = target.dataset.zone || 'body';
  const row = Math.max(0, Number(target.dataset.row || 0));
  const col = Math.max(0, Number(target.dataset.col || 0));
  const hasSelection = !!getTableBuilderSelection();
  const extendRange = e.type === 'click' && !!e.shiftKey && hasSelection && tableBuilderHasUserSelection;
  setTableBuilderSelection(zone, row, col, { extendRange });
  if (e.type === 'click') suppressTableBuilderFocusSelection = false;
}

/**
 * @function applyTableBuilderSelectedAlignment
 * @description Applies table builder selected alignment.
 */

function applyTableBuilderSelectedAlignment(align = 'left') {
  const selection = ensureTableBuilderSelection();
  if (!selection) return;
  const safeAlign = normalizeTableCellAlign(align);
  for (let row = selection.startRow; row <= selection.endRow; row++) {
    for (let col = selection.startCol; col <= selection.endCol; col++) {
      setTableBuilderCellAlign(selection.zone, row, col, safeAlign);
      const input = document.querySelector(
        `.table-builder-cell-input[data-zone="${selection.zone}"][data-row="${row}"][data-col="${col}"]`
      );
      applyTableBuilderInputAlign(input, safeAlign);
    }
  }
  syncTableBuilderAlignmentButtons();
}

/**
 * @function syncTableBuilderMergeButtons
 * @description Updates merge/unmerge control states based on current selection.
 */

function syncTableBuilderMergeButtons() {
  const mergeBtn = el('tableMergeBtn');
  const unmergeBtn = el('tableUnmergeBtn');
  if (!mergeBtn && !unmergeBtn) return;
  const selection = getTableSelectionRegion();
  if (!selection) {
    if (mergeBtn) mergeBtn.disabled = true;
    if (unmergeBtn) unmergeBtn.disabled = true;
    return;
  }
  const hasRange = selection.startRow !== selection.endRow || selection.startCol !== selection.endCol;
  if (mergeBtn) mergeBtn.disabled = !hasRange;
  if (unmergeBtn) {
    const state = normalizeTableBuilderState();
    const regions = normalizeTableMergeRegions(state.mergeRegions, state);
    const hasIntersectingRegion = regions.some(region => tableRegionsIntersect(region, selection));
    unmergeBtn.disabled = !hasIntersectingRegion;
  }
}

/**
 * @function mergeTableBuilderSelection
 * @description Merges the currently selected rectangular range into one cell.
 */

function mergeTableBuilderSelection() {
  const state = normalizeTableBuilderState();
  const selection = getTableSelectionRegion();
  if (!selection) return;
  const hasRange = selection.startRow !== selection.endRow || selection.startCol !== selection.endCol;
  if (!hasRange) return;

  const regions = normalizeTableMergeRegions(state.mergeRegions, state);
  const overlaps = regions.some(region => tableRegionsIntersect(region, selection) && !tableRegionEquals(region, selection));
  if (overlaps) {
    alert('Selection overlaps an existing merged area. Please unmerge first.');
    return;
  }

  const anchorRow = selection.startRow;
  const anchorCol = selection.startCol;
  const anchorAlign = getTableBuilderCellAlign(selection.zone, anchorRow, anchorCol);
  const nextRegions = regions.filter(region => !tableRegionEquals(region, selection));
  nextRegions.push(selection);
  state.mergeRegions = normalizeTableMergeRegions(nextRegions, state);

  if (selection.zone === 'header') {
    for (let col = selection.startCol; col <= selection.endCol; col++) {
      if (col === anchorCol) continue;
      state.header[col] = '';
      state.headerAlign[col] = anchorAlign;
    }
  } else {
    for (let row = selection.startRow; row <= selection.endRow; row++) {
      for (let col = selection.startCol; col <= selection.endCol; col++) {
        if (row === anchorRow && col === anchorCol) continue;
        state.body[row][col] = '';
        state.bodyAlign[row][col] = anchorAlign;
      }
    }
  }

  renderTableBuilderGrid();
}

/**
 * @function unmergeTableBuilderSelection
 * @description Removes merged regions intersecting the current selection.
 */

function unmergeTableBuilderSelection() {
  const state = normalizeTableBuilderState();
  const selection = getTableSelectionRegion();
  if (!selection) return;
  const regions = normalizeTableMergeRegions(state.mergeRegions, state);
  const nextRegions = regions.filter(region => !tableRegionsIntersect(region, selection));
  if (nextRegions.length === regions.length) return;
  state.mergeRegions = nextRegions;
  renderTableBuilderGrid();
}

/**
 * @function escapeMarkdownTableCell
 * @description Handles escape markdown table cell logic.
 */

function escapeMarkdownTableCell(value = '') {
  return String(value || '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

/**
 * @function encodeMarkdownTableCell
 * @description Handles encode markdown table cell logic.
 */

function encodeMarkdownTableCell(value = '', align = 'left', options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  if (opts.covered) return '[[merge]]';
  const text = escapeMarkdownTableCell(value);
  const safeAlign = normalizeTableCellAlign(align);
  const rowSpan = Math.max(1, Math.trunc(Number(opts.rowSpan) || 1));
  const colSpan = Math.max(1, Math.trunc(Number(opts.colSpan) || 1));
  const tokens = [];
  if (rowSpan > 1 || colSpan > 1) tokens.push(`[[span:${rowSpan}x${colSpan}]]`);
  if (safeAlign !== 'left') tokens.push(`[[align:${safeAlign}]]`);
  if (!tokens.length) return text;
  return `${tokens.join(' ')} ${text}`.trim();
}

/**
 * @function buildMarkdownTableFromState
 * @description Builds markdown table from state.
 */

function buildMarkdownTableFromState() {
  const state = normalizeTableBuilderState();
  const cols = state.cols;
  const headerMergeLookup = buildTableMergeLookup(state, 'header');
  const bodyMergeLookup = buildTableMergeLookup(state, 'body');
  const headerCells = state.withHeader
    ? state.header.map((value, idx) => {
      const mergeMeta = headerMergeLookup.get(`header:0:${idx}`);
      if (mergeMeta?.kind === 'covered') return encodeMarkdownTableCell('', 'left', { covered: true });
      return encodeMarkdownTableCell(value, state.headerAlign[idx], {
        rowSpan: mergeMeta?.kind === 'anchor' ? mergeMeta.rowSpan : 1,
        colSpan: mergeMeta?.kind === 'anchor' ? mergeMeta.colSpan : 1
      });
    })
    : Array.from({ length: cols }, () => '');
  const lines = [
    `| ${headerCells.join(' | ')} |`,
    `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`
  ];
  state.body.forEach((row, rowIdx) => {
    lines.push(`| ${row.map((value, colIdx) => {
      const mergeMeta = bodyMergeLookup.get(`body:${rowIdx}:${colIdx}`);
      if (mergeMeta?.kind === 'covered') return encodeMarkdownTableCell('', 'left', { covered: true });
      return encodeMarkdownTableCell(value, state.bodyAlign[rowIdx][colIdx], {
        rowSpan: mergeMeta?.kind === 'anchor' ? mergeMeta.rowSpan : 1,
        colSpan: mergeMeta?.kind === 'anchor' ? mergeMeta.colSpan : 1
      });
    }).join(' | ')} |`);
  });
  return lines.join('\n');
}

/**
 * @function decodeMarkdownTableCell
 * @description Decodes alignment token + text from a markdown table cell.
 */

function decodeMarkdownTableCell(value = '') {
  const parsed = parseTableCellMetaToken(value);
  return {
    text: String(parsed.text || ''),
    align: normalizeTableCellAlign(parsed.align || 'left'),
    hasAlignToken: !!parsed.align,
    covered: !!parsed.covered,
    rowSpan: Math.max(1, Math.trunc(Number(parsed.rowSpan) || 1)),
    colSpan: Math.max(1, Math.trunc(Number(parsed.colSpan) || 1))
  };
}

/**
 * @function findMarkdownTableAtSelection
 * @description Finds a markdown table block at the textarea selection and converts it into table builder state.
 */

function findMarkdownTableAtSelection(textarea) {
  if (!(textarea instanceof HTMLTextAreaElement)) return null;
  const raw = String(textarea.value || '');
  if (!raw.includes('|')) return null;

  const lines = raw.split('\n');
  if (lines.length < 2) return null;

  const lineStarts = [];
  let cursor = 0;
  for (let i = 0; i < lines.length; i++) {
    lineStarts.push(cursor);
    cursor += lines[i].length + 1;
  }

  const selectionStart = Math.max(0, Math.min(raw.length, Number(textarea.selectionStart || 0)));
  const selectionEnd = Math.max(0, Math.min(raw.length, Number(textarea.selectionEnd || selectionStart)));
  const minSel = Math.min(selectionStart, selectionEnd);
  const maxSel = Math.max(selectionStart, selectionEnd);

  for (let i = 0; i < lines.length - 1; i++) {
    const headerCells = splitMarkdownTableRow(lines[i]);
    if (!headerCells) continue;

    const alignments = parseMarkdownTableAlignments(lines[i + 1], headerCells.length);
    if (!alignments) continue;

    const bodyRows = [];
    let j = i + 2;
    while (j < lines.length) {
      const rowCells = splitMarkdownTableRow(lines[j]);
      if (!rowCells || rowCells.length !== headerCells.length) break;
      bodyRows.push(rowCells);
      j += 1;
    }

    const blockStart = lineStarts[i];
    const lastLineIdx = Math.max(i + 1, j - 1);
    const blockEnd = lineStarts[lastLineIdx] + lines[lastLineIdx].length;
    const overlapsSelection = maxSel >= blockStart && minSel <= blockEnd;
    if (!overlapsSelection) {
      i = Math.max(i, j - 1);
      continue;
    }

    const cols = headerCells.length;
    const normalizedBodyRows = bodyRows.length
      ? bodyRows
      : [Array.from({ length: cols }, () => '')];

    const decodedHeader = headerCells.map((cell, idx) => {
      const decoded = decodeMarkdownTableCell(cell);
      return {
        text: decoded.covered ? '' : decoded.text,
        align: decoded.hasAlignToken ? decoded.align : normalizeTableCellAlign(alignments[idx] || 'left'),
        covered: decoded.covered,
        rowSpan: decoded.rowSpan,
        colSpan: decoded.colSpan
      };
    });
    const decodedBody = normalizedBodyRows.map(row => Array.from({ length: cols }, (_, idx) => {
      const decoded = decodeMarkdownTableCell(row[idx] ?? '');
      return {
        text: decoded.covered ? '' : decoded.text,
        align: decoded.hasAlignToken ? decoded.align : normalizeTableCellAlign(alignments[idx] || 'left'),
        covered: decoded.covered,
        rowSpan: decoded.rowSpan,
        colSpan: decoded.colSpan
      };
    }));

    const withHeader = decodedHeader.some(cell => cell.text.trim().length > 0);
    const mergeRegions = [];
    decodedHeader.forEach((cell, colIdx) => {
      if (cell.covered) return;
      if (cell.colSpan <= 1) return;
      mergeRegions.push({
        zone: 'header',
        startRow: 0,
        endRow: 0,
        startCol: colIdx,
        endCol: Math.min(cols - 1, colIdx + cell.colSpan - 1)
      });
    });
    decodedBody.forEach((row, rowIdx) => {
      row.forEach((cell, colIdx) => {
        if (cell.covered) return;
        if (cell.rowSpan <= 1 && cell.colSpan <= 1) return;
        mergeRegions.push({
          zone: 'body',
          startRow: rowIdx,
          endRow: Math.min(decodedBody.length - 1, rowIdx + cell.rowSpan - 1),
          startCol: colIdx,
          endCol: Math.min(cols - 1, colIdx + cell.colSpan - 1)
        });
      });
    });
    return {
      range: { start: blockStart, end: blockEnd },
      state: {
        rows: Math.max(1, decodedBody.length),
        cols,
        withHeader,
        header: decodedHeader.map(cell => cell.text),
        body: decodedBody.map(row => row.map(cell => cell.text)),
        headerAlign: decodedHeader.map(cell => cell.align),
        bodyAlign: decodedBody.map(row => row.map(cell => cell.align)),
        mergeRegions
      }
    };
  }

  return null;
}

/**
 * @function insertGeneratedTableIntoTextarea
 * @description Handles insert generated table into textarea logic.
 */

function insertGeneratedTableIntoTextarea(textarea, tableMarkdown = '') {
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  const tableText = String(tableMarkdown || '').trim();
  if (!tableText) return;
  ensureListInputLeftAligned(textarea);
  const value = textarea.value || '';
  const start = textarea.selectionStart ?? value.length;
  const end = textarea.selectionEnd ?? start;
  const needsLeadingBreak = start > 0 && value[start - 1] !== '\n';
  const needsTrailingBreak = end < value.length && value[end] !== '\n';
  const prefix = needsLeadingBreak ? '\n' : '';
  const suffix = needsTrailingBreak ? '\n' : '';
  const insertText = `${prefix}${tableText}${suffix}`;
  textarea.setRangeText(insertText, start, end, 'end');
  const caret = start + insertText.length;
  textarea.setSelectionRange(caret, caret);
  textarea.focus();
  emitTextareaInput(textarea);
}

/**
 * @function replaceGeneratedTableInTextarea
 * @description Replaces an existing markdown table block in a textarea.
 */

function replaceGeneratedTableInTextarea(textarea, tableMarkdown = '', start = 0, end = 0) {
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  const tableText = String(tableMarkdown || '').trim();
  if (!tableText) return;
  ensureListInputLeftAligned(textarea);
  const value = String(textarea.value || '');
  const safeStart = Math.max(0, Math.min(value.length, Math.trunc(Number(start) || 0)));
  const safeEnd = Math.max(safeStart, Math.min(value.length, Math.trunc(Number(end) || safeStart)));
  textarea.setRangeText(tableText, safeStart, safeEnd, 'end');
  const caret = safeStart + tableText.length;
  textarea.setSelectionRange(caret, caret);
  textarea.focus();
  emitTextareaInput(textarea);
}

/**
 * @function openTableDialog
 * @description Opens the table dialog.
 */

function openTableDialog(targetId = '') {
  const dialog = el('tableDialog');
  if (!dialog) return;
  suppressTableBuilderFocusSelection = false;
  suppressTableBuilderProgrammaticFocusSelection = false;
  tableTarget = targetId || 'cardPrompt';
  const targetLabel = el('tableTargetLabel');
  const insertBtn = el('insertTableBtn');
  const targetText = getTableTargetLabel(tableTarget);
  tableEditRange = null;
  tableBuilderSelection = null;
  tableBuilderHasUserSelection = false;

  const textarea = el(tableTarget);
  const existingTable = findMarkdownTableAtSelection(textarea);
  if (existingTable) {
    tableEditRange = {
      targetId: tableTarget,
      start: existingTable.range.start,
      end: existingTable.range.end
    };
    normalizeTableBuilderState(existingTable.state);
    if (targetLabel) targetLabel.textContent = `Target: ${targetText} (Edit table)`;
    if (insertBtn) insertBtn.textContent = 'Update Table';
  } else {
    normalizeTableBuilderState({
      rows: 3,
      cols: 3,
      withHeader: true,
      header: [],
      body: [],
      headerAlign: [],
      bodyAlign: [],
      mergeRegions: []
    });
    if (targetLabel) targetLabel.textContent = `Target: ${targetText}`;
    if (insertBtn) insertBtn.textContent = 'Insert Table';
  }

  syncTableBuilderControls();
  renderTableBuilderGrid();
  showDialog(dialog);
  setTimeout(() => {
    const preferredSelector = tableBuilderSelection
      ? `.table-builder-cell-input[data-zone="${tableBuilderSelection.zone}"][data-row="${tableBuilderSelection.startRow}"][data-col="${tableBuilderSelection.startCol}"]`
      : '.table-builder-cell-input';
    const preferredCell = dialog.querySelector(preferredSelector);
    const firstCell = preferredCell || dialog.querySelector('.table-builder-cell-input');
    if (firstCell instanceof HTMLInputElement) {
      suppressTableBuilderProgrammaticFocusSelection = true;
      firstCell.focus();
      firstCell.select();
    }
  }, 0);
}

/**
 * @function insertTableFromDialog
 * @description Builds insert table from dialog.
 */

function insertTableFromDialog() {
  const textarea = el(tableTarget || '');
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  const tableMarkdown = buildMarkdownTableFromState();
  const canReplaceExistingTable = tableEditRange
    && tableEditRange.targetId === tableTarget
    && Number.isFinite(Number(tableEditRange.start))
    && Number.isFinite(Number(tableEditRange.end));
  if (canReplaceExistingTable) {
    replaceGeneratedTableInTextarea(textarea, tableMarkdown, tableEditRange.start, tableEditRange.end);
  } else {
    insertGeneratedTableIntoTextarea(textarea, tableMarkdown);
  }
  tableEditRange = null;
  closeDialog(el('tableDialog'));
}

/**
 * @function handleListAutoIndent
 * @description Handles list auto indent.
 */

function handleListAutoIndent(e) {
  if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
  const textarea = e.target;
  if (!(textarea instanceof HTMLTextAreaElement)) return;
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  if (start !== end) return;

  const value = textarea.value || '';
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEndIdx = value.indexOf('\n', start);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  const line = value.slice(lineStart, lineEnd);
  const listMeta = parseListLineMeta(line);
  if (!listMeta) return;

  e.preventDefault();
  ensureListInputLeftAligned(textarea);
  let insert = '\n';
  if (!listMeta.text.trim()) {
    insert = '\n';
  } else if (listMeta.type === 'ul') {
    insert = `\n${listMeta.indent}${listMeta.marker || '-'} `;
  } else if (listMeta.type === 'ol') {
    const nextSequence = [...listMeta.sequence];
    nextSequence[nextSequence.length - 1] = (nextSequence[nextSequence.length - 1] || 0) + 1;
    insert = `\n${listMeta.indent}${formatOrderedSequence(nextSequence)} `;
  }
  textarea.setRangeText(insert, start, end, 'end');
  emitTextareaInput(textarea);
}

/**
 * @function handleListTabIndent
 * @description Handles list tab indent.
 */

function handleListTabIndent(e) {
  if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
  const textarea = e.target;
  if (!(textarea instanceof HTMLTextAreaElement)) return;

  if (textarea.id === 'cardPrompt' && !e.shiftKey) {
    e.preventDefault();
    const answerField = el('cardAnswer');
    if (!(answerField instanceof HTMLTextAreaElement)) return;
    answerField.focus();
    const caret = answerField.value.length;
    answerField.setSelectionRange(caret, caret);
    return;
  }

  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  if (start !== end) return;

  const value = textarea.value || '';
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEndIdx = value.indexOf('\n', start);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  const line = value.slice(lineStart, lineEnd);
  const listMeta = parseListLineMeta(line);
  if (!listMeta) return;

  e.preventDefault();
  ensureListInputLeftAligned(textarea);
  let nextLine = line;
  if (e.shiftKey) {
    const outdentedIndent = listMeta.indent.slice(0, Math.max(0, listMeta.indent.length - 2));
    if (listMeta.type === 'ol') {
      const outdentedSequence = listMeta.sequence.length > 1
        ? listMeta.sequence.slice(0, -1)
        : listMeta.sequence;
      nextLine = `${outdentedIndent}${formatOrderedSequence(outdentedSequence)} ${listMeta.text || ''}`;
    } else {
      const outdentedMarker = getOutdentedBulletMarker(listMeta.marker || '-');
      nextLine = `${outdentedIndent}${outdentedMarker} ${listMeta.text || ''}`;
    }
  } else {
    const nestedIndent = `${listMeta.indent}  `;
    if (listMeta.type === 'ol') {
      const prevMeta = getPreviousNonEmptyLineMeta(value, lineStart);
      let parentSequence = listMeta.sequence.length > 1
        ? listMeta.sequence.slice(0, -1)
        : listMeta.sequence.slice();
      if (prevMeta?.type === 'ol' && prevMeta.sequence.length) {
        parentSequence = prevMeta.sequence.slice();
      }
      const nestedSequence = [...parentSequence, 1];
      nextLine = `${nestedIndent}${formatOrderedSequence(nestedSequence)} ${listMeta.text || ''}`;
    } else {
      const nestedMarker = getNestedBulletMarker(listMeta.marker || '-');
      nextLine = `${nestedIndent}${nestedMarker} ${listMeta.text || ''}`;
    }
  }

  textarea.setRangeText(nextLine, lineStart, lineEnd, 'end');
  const nextCaret = Math.min(lineStart + nextLine.length, textarea.value.length);
  textarea.setSelectionRange(nextCaret, nextCaret);
  emitTextareaInput(textarea);
}

/**
 * @function handleInlineFormatShortcut
 * @description Handles inline format shortcut.
 */

function handleInlineFormatShortcut(e) {
  if (e.shiftKey || e.altKey || !(e.metaKey || e.ctrlKey)) return;
  const inputEl = e.target;
  const isSupportedInput =
    inputEl instanceof HTMLTextAreaElement
    || (inputEl instanceof HTMLInputElement && inputEl.type === 'text');
  if (!isSupportedInput) return;
  const key = String(e.key || '').toLowerCase();
  if (key === 'b') {
    e.preventDefault();
    toggleInlineFormat(inputEl, 'bold');
  } else if (key === 'i') {
    e.preventDefault();
    toggleInlineFormat(inputEl, 'italic');
  } else if (key === 'u') {
    e.preventDefault();
    toggleInlineFormat(inputEl, 'underline');
  }
}

/**
 * @function applyInputAlignmentShortcut
 * @description Applies alignment shortcuts for editor text fields and MCQ option inputs.
 */

function applyInputAlignmentShortcut(inputEl, align = 'left') {
  if (!(inputEl instanceof HTMLTextAreaElement || inputEl instanceof HTMLInputElement)) return;
  const targetAlign = normalizeTextAlign(align);
  if (inputEl.id === 'cardPrompt') applyCreateQuestionTextAlign(targetAlign);
  else if (inputEl.id === 'cardAnswer') applyCreateAnswerTextAlign(targetAlign);
  else if (inputEl.id === 'editCardPrompt') applyEditQuestionTextAlign(targetAlign);
  else if (inputEl.id === 'editCardAnswer') applyEditAnswerTextAlign(targetAlign);
  else if (inputEl.classList.contains('table-builder-cell-input')) {
    const zone = inputEl.dataset.zone === 'header' ? 'header' : 'body';
    const row = Math.max(0, Number(inputEl.dataset.row || 0));
    const col = Math.max(0, Number(inputEl.dataset.col || 0));
    const currentSelection = getTableBuilderSelection();
    const isInsideCurrentSelection = !!currentSelection
      && currentSelection.zone === zone
      && row >= currentSelection.startRow
      && row <= currentSelection.endRow
      && col >= currentSelection.startCol
      && col <= currentSelection.endCol;
    if (!isInsideCurrentSelection) {
      setTableBuilderSelection(zone, row, col, { userInitiated: true });
    }
    applyTableBuilderSelectedAlignment(targetAlign);
  }
  else if (inputEl.closest('#mcqOptions')) applyCreateOptionsTextAlign(targetAlign);
  else if (inputEl.closest('#editMcqOptions')) applyEditOptionsTextAlign(targetAlign);
}

/**
 * @function handleTextAlignShortcut
 * @description Handles text align shortcut.
 */

function handleTextAlignShortcut(e) {
  if (e.shiftKey || e.altKey || !(e.metaKey || e.ctrlKey)) return;
  const inputEl = e.target;
  const isSupportedInput =
    inputEl instanceof HTMLTextAreaElement
    || (inputEl instanceof HTMLInputElement && inputEl.type === 'text');
  if (!isSupportedInput) return;
  const key = String(e.key || '').toLowerCase();
  if (key === 'l') {
    e.preventDefault();
    applyInputAlignmentShortcut(inputEl, 'left');
  } else if (key === 'c') {
    const start = inputEl.selectionStart ?? 0;
    const end = inputEl.selectionEnd ?? start;
    if (end > start) return; // keep native Cmd/Ctrl+C copy when text is selected
    e.preventDefault();
    applyInputAlignmentShortcut(inputEl, 'center');
  } else if (key === 'j') {
    e.preventDefault();
    applyInputAlignmentShortcut(inputEl, 'justify');
  }
}

/**
 * @function wireTextFormattingToolbar
 * @description Wires text formatting toolbar.
 */

function wireTextFormattingToolbar() {
  ensureInlineColorToolbarControls();
  document.querySelectorAll('.text-toolbar .toolbar-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const action = btn.dataset.action || '';
      if (action === 'align') {
        const group = btn.dataset.group || 'create-question';
        const align = normalizeTextAlign(btn.dataset.align || 'left');
        if (group === 'create-question') applyCreateQuestionTextAlign(align);
        else if (group === 'create-answer') applyCreateAnswerTextAlign(align);
        else if (group === 'edit-question') applyEditQuestionTextAlign(align);
        else if (group === 'edit-answer') applyEditAnswerTextAlign(align);
        else if (group === 'create-options') applyCreateOptionsTextAlign(align);
        else if (group === 'edit-options') applyEditOptionsTextAlign(align);
        else applyCreateQuestionTextAlign(align);
        return;
      }
      if (action === 'format') {
        const targetId = btn.dataset.target || '';
        const textarea = el(targetId);
        const format = btn.dataset.format || 'bold';
        toggleInlineFormat(textarea, format);
        return;
      }
      if (action === 'list') {
        const targetId = btn.dataset.target || '';
        const textarea = el(targetId);
        const listType = btn.dataset.list || 'ul';
        toggleListPrefix(textarea, listType);
        return;
      }
      if (action === 'table') {
        const targetId = btn.dataset.target || '';
        openTableDialog(targetId);
      }
    });
  });

  ['cardPrompt', 'cardAnswer', 'editCardPrompt', 'editCardAnswer'].forEach(id => {
    const textarea = el(id);
    if (!textarea) return;
    textarea.addEventListener('keydown', handleListTabIndent);
    textarea.addEventListener('keydown', handleListAutoIndent);
    textarea.addEventListener('keydown', handleInlineFormatShortcut);
    textarea.addEventListener('keydown', handleTextAlignShortcut);
  });

  syncToolbarAlignmentButtons('create-question', createQuestionTextAlign);
  syncToolbarAlignmentButtons('create-answer', createAnswerTextAlign);
  syncToolbarAlignmentButtons('edit-question', editQuestionTextAlign);
  syncToolbarAlignmentButtons('edit-answer', editAnswerTextAlign);
  syncToolbarAlignmentButtons('create-options', createOptionsTextAlign);
  syncToolbarAlignmentButtons('edit-options', editOptionsTextAlign);
}

const HTML2CANVAS_URL = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
let html2canvasLoading = null;
let katexCssCache = null;
/**
 * @function ensureHtml2Canvas
 * @description Ensures html2 canvas.
 */
function ensureHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve();
  if (html2canvasLoading) return html2canvasLoading;
  html2canvasLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = HTML2CANVAS_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load html2canvas'));
    document.head.appendChild(script);
  });
  return html2canvasLoading;
}

/**
 * @function ensureStylesheetLoaded
 * @description Ensures stylesheet loaded.
 */

function ensureStylesheetLoaded(url) {
  if (!url) return;
  if (document.querySelector(`link[rel="stylesheet"][href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}

/**
 * @function loadScriptOnce
 * @description Loads script once.
 */

function loadScriptOnce(url) {
  if (!url) return Promise.reject(new Error('Missing script URL'));
  if (scriptLoadCache.has(url)) return scriptLoadCache.get(url);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadCache.delete(url);
      reject(new Error(`Failed to load script: ${url}`));
    };
    document.head.appendChild(script);
  });
  scriptLoadCache.set(url, promise);
  return promise;
}

/**
 * @function ensureKatexLoaded
 * @description Loads KaTeX assets on demand before formula rendering is used.
 */

async function ensureKatexLoaded() {
  if (window.katex && window.renderMathInElement) return true;
  if (katexLoading) return katexLoading;
  katexLoading = (async () => {
    try {
      ensureStylesheetLoaded(KATEX_CSS_URL);
      if (!window.katex) await loadScriptOnce(KATEX_JS_URL);
      if (!window.renderMathInElement) await loadScriptOnce(KATEX_AUTORENDER_URL);
      return !!(window.katex && window.renderMathInElement);
    } catch (err) {
      return false;
    }
  })();
  const loaded = await katexLoading;
  if (!loaded) katexLoading = null;
  return loaded;
}

/**
 * @function getKatexCssText
 * @description Returns the KaTeX CSS text.
 */

async function getKatexCssText() {
  if (katexCssCache !== null) return katexCssCache;
  const link = document.querySelector('link[href*="katex.min.css"]');
  const href = link?.href || KATEX_CSS_URL;
  try {
    const res = await fetch(href);
    katexCssCache = res.ok ? await res.text() : '';
  } catch (err) {
    katexCssCache = '';
  }
  return katexCssCache;
}

/**
 * @function renderFormulaToSvgDataUrl
 * @description Renders formula to SVG data URL.
 */

async function renderFormulaToSvgDataUrl(renderEl) {
  const css = await getKatexCssText();
  const rect = renderEl.getBoundingClientRect();
  const width = Math.max(10, Math.ceil(rect.width || 0));
  const height = Math.max(10, Math.ceil(rect.height || 0));
  const safeCss = (css || '').replace(/<\/style>/g, '<\\/style>');
  const html = renderEl.outerHTML;
  const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml" style="display:inline-block;">
              <style>${safeCss}</style>
              ${html}
            </div>
          </foreignObject>
        </svg>
      `;
  const encoded = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${encoded}`;
}

const formulaTargets = {
  cardPrompt: { previewId: 'questionImagePreview', legacyKey: 'imageDataQ', label: 'Question' },
  cardAnswer: { previewId: 'answerImagePreview', legacyKey: 'imageDataA', label: 'Answer' },
  editCardPrompt: { previewId: 'editQuestionImagePreview', legacyKey: 'imageDataQ', label: 'Edit Question' },
  editCardAnswer: { previewId: 'editAnswerImagePreview', legacyKey: 'imageDataA', label: 'Edit Answer' }
};

/**
 * @function normalizeFormulaInput
 * @description Normalizes formula input.
 */

function normalizeFormulaInput(raw, displayToggle) {
  const t = (raw || '').trim();
  if (!t) return { text: '', display: !!displayToggle?.checked, detected: null };
  if (t.startsWith('$$') && t.endsWith('$$') && t.length > 4) {
    return { text: t.slice(2, -2).trim(), display: true, detected: true };
  }
  if (t.startsWith('\\[') && t.endsWith('\\]') && t.length > 4) {
    return { text: t.slice(2, -2).trim(), display: true, detected: true };
  }
  if (t.startsWith('$') && t.endsWith('$') && t.length > 2) {
    return { text: t.slice(1, -1).trim(), display: false, detected: false };
  }
  if (t.startsWith('\\(') && t.endsWith('\\)') && t.length > 4) {
    return { text: t.slice(2, -2).trim(), display: false, detected: false };
  }
  return { text: t, display: !!displayToggle?.checked, detected: null };
}

/**
 * @function renderFormulaPreview
 * @description Renders formula preview.
 */

function renderFormulaPreview() {
  const input = el('formulaInput');
  const renderEl = el('formulaRender');
  const errorEl = el('formulaError');
  const displayToggle = el('formulaDisplayToggle');
  const insertBtn = el('insertFormulaBtn');
  if (!input || !renderEl || !displayToggle || !errorEl || !insertBtn) return;

  const { text, display, detected } = normalizeFormulaInput(input.value, displayToggle);
  if (detected !== null) displayToggle.checked = display;
  renderEl.innerHTML = '';
  errorEl.classList.add('hidden');
  insertBtn.disabled = !text;
  if (!text) return;

  if (!window.katex) {
    errorEl.textContent = 'Loading formula renderer...';
    errorEl.classList.remove('hidden');
    insertBtn.disabled = true;
    ensureKatexLoaded().then(loaded => {
      if (loaded) {
        renderFormulaPreview();
        return;
      }
      errorEl.textContent = 'Formula renderer not available.';
      errorEl.classList.remove('hidden');
      insertBtn.disabled = true;
    });
    return;
  }
  try {
    window.katex.render(text, renderEl, { displayMode: display, throwOnError: true });
  } catch (err) {
    errorEl.textContent = 'Invalid formula. Please check your LaTeX.';
    errorEl.classList.remove('hidden');
    insertBtn.disabled = true;
  }
}

/**
 * @function insertFormulaImage
 * @description Handles insert formula image logic.
 */

async function insertFormulaImage() {
  const target = formulaTargets[formulaTarget];
  const input = el('formulaInput');
  const renderEl = el('formulaRender');
  const dialog = el('formulaDialog');
  if (!target || !input || !renderEl || !dialog) return;
  if (!input.value.trim()) return;
  renderFormulaPreview();
  let dataUrl = '';
  try {
    await ensureHtml2Canvas();
    if (window.html2canvas) {
      const canvas = await window.html2canvas(renderEl, { backgroundColor: null, scale: 2, useCORS: true });
      dataUrl = canvas.toDataURL('image/png');
    }
  } catch (err) {
    dataUrl = '';
  }
  if (!dataUrl) {
    dataUrl = await renderFormulaToSvgDataUrl(renderEl);
  }
  const targetField = el(formulaTarget);
  const previewEl = el(target.previewId);
  if (!targetField || !previewEl) return;

  const isCreateField = formulaTarget === 'cardPrompt' || formulaTarget === 'cardAnswer';
  appendImagesToField(
    targetField,
    previewEl,
    [dataUrl],
    target.legacyKey,
    () => { if (isCreateField) updateCreateValidation(); }
  );
  if (isCreateField) updateCreateValidation();
  dialog.close();
}

/**
 * @function openFormulaDialog
 * @description Opens the formula dialog.
 */

function openFormulaDialog(targetId) {
  const dialog = el('formulaDialog');
  const targetLabel = el('formulaTargetLabel');
  const input = el('formulaInput');
  const displayToggle = el('formulaDisplayToggle');
  if (!dialog || !input || !displayToggle) return;
  formulaTarget = targetId;
  const targetMeta = formulaTargets[targetId];
  if (targetLabel && targetMeta) targetLabel.textContent = `Target: ${targetMeta.label}`;
  input.value = '';
  displayToggle.checked = false;
  renderFormulaPreview();
  dialog.showModal();
}

/**
 * @function getCreateOptionCount
 * @description Returns the create option count.
 */

function getCreateOptionCount() {
  const primaryText = el('cardAnswer').value.trim();
  let count = primaryText ? 1 : 0;
  Array.from(el('mcqOptions').querySelectorAll('.mcq-row[data-primary="false"] input[type="text"]'))
    .forEach(input => {
      if (input.value.trim()) count += 1;
    });
  return count;
}

/**
 * @function parseMcqOptions
 * @description Parses MCQ options.
 */

function parseMcqOptions() {
  if (!mcqMode) return [];
  const options = [];
  const primaryText = el('cardAnswer').value.trim();
  const primaryToggle = el('primaryAnswerToggle');
  if (primaryText) {
    options.push({ text: primaryText, correct: primaryToggle ? primaryToggle.checked : true });
  }
  const rows = Array.from(el('mcqOptions').querySelectorAll('.mcq-row[data-primary="false"]'));
  rows.forEach(row => {
    const text = row.querySelector('input[type="text"]').value.trim();
    const correct = row.querySelector('.mcq-toggle input[type="checkbox"]').checked;
    if (text) options.push({ text, correct });
  });
  return options;
}

/**
 * @function addMcqRow
 * @description Adds one additional MCQ answer row in the create editor.
 */

function addMcqRow(text = '', correct = false, options = {}) {
  const opts = (options && typeof options === 'object') ? options : {};
  const insertAtTop = opts.insertAtTop !== false;
  const focusInput = opts.focusInput !== false;
  const wrap = document.createElement('div');
  wrap.className = `mcq-row ${correct ? 'correct' : 'wrong'}`;
  wrap.dataset.primary = 'false';
  wrap.innerHTML = `
        <div class="mcq-row-header">
          <span class="mcq-badge ${correct ? 'correct' : 'wrong'}">${correct ? 'Correct Answer ✓' : 'Wrong Answer ✕'}</span>
          <label class="toggle mcq-toggle">
            <input type="checkbox" ${correct ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <input type="text" placeholder="Answer option..." value="${escapeHTML(text)}" />
        <div class="mcq-row-actions">
          <div class="tiny">Additional answer option</div>
          <button class="btn mcq-remove" type="button">Remove</button>
        </div>
      `;
  const toggle = wrap.querySelector('.mcq-toggle input[type="checkbox"]');
  const update = () => {
    const isCorrect = toggle.checked;
    wrap.classList.toggle('correct', isCorrect);
    wrap.classList.toggle('wrong', !isCorrect);
    const badge = wrap.querySelector('.mcq-badge');
    badge.className = `mcq-badge ${isCorrect ? 'correct' : 'wrong'}`;
    badge.textContent = isCorrect ? 'Correct Answer ✓' : 'Wrong Answer ✕';
  };
  toggle.addEventListener('change', update);
  const input = wrap.querySelector('input[type="text"]');
  if (input) {
    input.addEventListener('input', () => updateCreateValidation());
    input.addEventListener('keydown', handleInlineFormatShortcut);
    input.addEventListener('keydown', handleTextAlignShortcut);
  }
  wrap.querySelector('.mcq-remove').onclick = () => {
    wrap.remove();
    syncMcqPrimaryAnswerMode(false);
  };
  update();
  const optionsWrap = el('mcqOptions');
  if (!optionsWrap) return;
  if (insertAtTop && optionsWrap.firstChild) optionsWrap.insertBefore(wrap, optionsWrap.firstChild);
  else optionsWrap.appendChild(wrap);
  if (focusInput && input instanceof HTMLInputElement) {
    requestAnimationFrame(() => {
      input.focus();
      const caret = input.value.length;
      input.setSelectionRange(caret, caret);
    });
  }
}

/**
 * @function parseEditMcqOptions
 * @description Parses edit MCQ options.
 */

function parseEditMcqOptions() {
  if (!editMcqMode) return [];
  const options = [];
  const primaryText = el('editCardAnswer').value.trim();
  const primaryToggle = el('editPrimaryAnswerToggle');
  if (primaryText) {
    options.push({ text: primaryText, correct: primaryToggle ? primaryToggle.checked : true });
  }
  const rows = Array.from(el('editMcqOptions').querySelectorAll('.mcq-row[data-primary="false"]'));
  rows.forEach(row => {
    const text = row.querySelector('input[type="text"]').value.trim();
    const correct = row.querySelector('.mcq-toggle input[type="checkbox"]').checked;
    if (text) options.push({ text, correct });
  });
  return options;
}

/**
 * @function addEditMcqRow
 * @description Adds one additional MCQ answer row in the edit dialog.
 */

function addEditMcqRow(text = '', correct = false, options = {}) {
  const opts = (options && typeof options === 'object') ? options : {};
  const insertAtTop = opts.insertAtTop !== false;
  const focusInput = opts.focusInput !== false;
  const wrap = document.createElement('div');
  wrap.className = `mcq-row ${correct ? 'correct' : 'wrong'}`;
  wrap.dataset.primary = 'false';
  wrap.innerHTML = `
        <div class="mcq-row-header">
          <span class="mcq-badge ${correct ? 'correct' : 'wrong'}">${correct ? 'Correct Answer ✓' : 'Wrong Answer ✕'}</span>
          <label class="toggle mcq-toggle">
            <input type="checkbox" ${correct ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </div>
        <input type="text" placeholder="Answer option..." value="${escapeHTML(text)}" />
        <div class="mcq-row-actions">
          <div class="tiny">Additional answer option</div>
          <button class="btn mcq-remove" type="button">Remove</button>
        </div>
      `;
  const toggle = wrap.querySelector('.mcq-toggle input[type="checkbox"]');
  const update = () => {
    const isCorrect = toggle.checked;
    wrap.classList.toggle('correct', isCorrect);
    wrap.classList.toggle('wrong', !isCorrect);
    const badge = wrap.querySelector('.mcq-badge');
    badge.className = `mcq-badge ${isCorrect ? 'correct' : 'wrong'}`;
    badge.textContent = isCorrect ? 'Correct Answer ✓' : 'Wrong Answer ✕';
  };
  toggle.addEventListener('change', update);
  const input = wrap.querySelector('input[type="text"]');
  if (input) {
    input.addEventListener('keydown', handleInlineFormatShortcut);
    input.addEventListener('keydown', handleTextAlignShortcut);
  }
  wrap.querySelector('.mcq-remove').onclick = () => {
    wrap.remove();
    syncMcqPrimaryAnswerMode(true);
  };
  update();
  const optionsWrap = el('editMcqOptions');
  if (!optionsWrap) return;
  if (insertAtTop && optionsWrap.firstChild) optionsWrap.insertBefore(wrap, optionsWrap.firstChild);
  else optionsWrap.appendChild(wrap);
  if (focusInput && input instanceof HTMLInputElement) {
    requestAnimationFrame(() => {
      input.focus();
      const caret = input.value.length;
      input.setSelectionRange(caret, caret);
    });
  }
}

/**
 * @function openEditDialog
 * @description Opens the edit dialog.
 */

function openEditDialog(card) {
  editingCardId = card.id;
  editingCardSnapshot = cloneData(card);
  const questionAlign = card.questionTextAlign || card.textAlign || 'center';
  const answerAlign = card.answerTextAlign || card.textAlign || 'center';
  applyEditQuestionTextAlign(questionAlign);
  applyEditAnswerTextAlign(answerAlign);
  applyEditOptionsTextAlign(card.optionsTextAlign || 'center');
  el('editCardPrompt').value = card.prompt || '';
  el('editCardAnswer').value = card.answer || '';
  replaceFieldImages(
    el('editCardPrompt'),
    el('editQuestionImagePreview'),
    getCardImageList(card, 'Q'),
    'imageDataQ'
  );
  replaceFieldImages(
    el('editCardAnswer'),
    el('editAnswerImagePreview'),
    getCardImageList(card, 'A'),
    'imageDataA'
  );
  setPreview('editQuestionPreview', el('editCardPrompt').value || '', editQuestionTextAlign);
  setPreview('editAnswerPreview', el('editCardAnswer').value || '', editAnswerTextAlign);
  el('editMcqOptions').innerHTML = '';
  const opts = card.options || [];
  const hasMcq = card.type === 'mcq' && opts.length > 1;
  setMcqModeState(true, hasMcq);
  if (hasMcq) {
    const primaryText = (el('editCardAnswer').value || '').trim();
    let primaryIdx = opts.findIndex(opt => (opt.text || '').trim() === primaryText);
    if (primaryIdx === -1) primaryIdx = 0;
    const primaryOpt = opts[primaryIdx];
    const toggle = el('editPrimaryAnswerToggle');
    if (toggle && primaryOpt) toggle.checked = !!primaryOpt.correct;
    syncPrimaryMcqUi(true);
    opts.forEach((opt, i) => {
      if (i === primaryIdx) return;
      addEditMcqRow(opt.text, opt.correct, { insertAtTop: false, focusInput: false });
    });
  }
  syncMcqPrimaryAnswerMode(true);
  el('editCardDialog').showModal();
}

/**
 * @function deleteCardById
 * @description Deletes card by ID.
 */

async function deleteCardById(cardId, options = {}) {
  const { skipSubjectTouch = false } = options;
  const card = await getById('cards', cardId);
  await del('cards', cardId);
  await del('progress', cardId);
  await del('cardbank', cardId);
  progressByCardId.delete(cardId);
  if (!skipSubjectTouch && card?.topicId) {
    await touchSubjectByTopicId(card.topicId);
  }
  if (session.active) {
    session.activeQueue = session.activeQueue.filter(c => c.id !== cardId);
    session.mastered = session.mastered.filter(c => c.id !== cardId);
    delete session.counts[cardId];
    delete session.gradeMap[cardId];
    renderSessionPills();
    renderSessionCard();
  }
}

// ============================================================================
// Deck/Topic Bulk Actions + Topic Search
// ============================================================================
/**
* @function getDeckSelectionIds
 * @description Returns the deck selection IDs.
 */

function getDeckSelectionIds() {
  return Array.from(deckSelectedCardIds);
}

/**
 * @function updateDeckSelectionUi
 * @description Updates deck selection UI.
 */

function updateDeckSelectionUi() {
  const toggleBtn = el('toggleCardSelectBtn');
  const bulkBar = el('deckBulkActions');
  const count = el('deckSelectionCount');
  const moveBtn = el('moveSelectedCardsBtn');
  const deleteBtn = el('deleteSelectedCardsBtn');
  const hasSelection = deckSelectedCardIds.size > 0;

  if (toggleBtn) {
    toggleBtn.classList.toggle('active', deckSelectionMode);
    toggleBtn.setAttribute('aria-pressed', deckSelectionMode ? 'true' : 'false');
  }
  if (bulkBar) {
    bulkBar.classList.toggle('hidden', !deckSelectionMode);
  }
  if (count) {
    count.textContent = `${deckSelectedCardIds.size} ausgewaehlt`;
  }
  if (moveBtn) moveBtn.disabled = !hasSelection;
  if (deleteBtn) deleteBtn.disabled = !hasSelection;
}

/**
 * @function setDeckSelectionMode
 * @description Sets the deck selection mode.
 */

function setDeckSelectionMode(enabled) {
  deckSelectionMode = !!enabled;
  if (!deckSelectionMode) deckSelectedCardIds.clear();
  updateDeckSelectionUi();
}

/**
 * @function toggleDeckCardSelection
 * @description Toggles deck card selection.
 */

function toggleDeckCardSelection(cardId, forceState = null) {
  const next = forceState === null ? !deckSelectedCardIds.has(cardId) : !!forceState;
  if (next) deckSelectedCardIds.add(cardId);
  else deckSelectedCardIds.delete(cardId);
  updateDeckSelectionUi();
}

/**
 * @function getTopicSelectionIds
 * @description Returns the topic selection IDs.
 */

function getTopicSelectionIds() {
  return Array.from(topicSelectedIds);
}

/**
 * @function updateTopicSelectionUi
 * @description Updates topic selection UI.
 */

function updateTopicSelectionUi() {
  const toggleBtn = el('toggleTopicSelectBtn');
  const bulkBar = el('topicBulkActions');
  const count = el('topicSelectionCount');
  const moveBtn = el('moveSelectedTopicsBtn');
  const deleteBtn = el('deleteSelectedTopicsBtn');
  const hasSelection = topicSelectedIds.size > 0;

  if (toggleBtn) {
    toggleBtn.classList.toggle('active', topicSelectionMode);
    toggleBtn.setAttribute('aria-pressed', topicSelectionMode ? 'true' : 'false');
  }
  if (bulkBar) {
    bulkBar.classList.toggle('hidden', !topicSelectionMode);
  }
  if (count) {
    const word = topicSelectedIds.size === 1 ? 'topic' : 'topics';
    count.textContent = `${topicSelectedIds.size} ${word} selected`;
  }
  if (moveBtn) moveBtn.disabled = !hasSelection;
  if (deleteBtn) deleteBtn.disabled = !hasSelection;
}

/**
 * @function setTopicSelectionMode
 * @description Sets the topic selection mode.
 */

function setTopicSelectionMode(enabled) {
  topicSelectionMode = !!enabled;
  if (!topicSelectionMode) topicSelectedIds.clear();
  updateTopicSelectionUi();
}

/**
 * @function toggleTopicSelection
 * @description Toggles topic selection.
 */

function toggleTopicSelection(topicId, forceState = null) {
  const next = forceState === null ? !topicSelectedIds.has(topicId) : !!forceState;
  if (next) topicSelectedIds.add(topicId);
  else topicSelectedIds.delete(topicId);
  updateTopicSelectionUi();
}

/**
 * @function openMoveTopicsDialog
 * @description Opens the move topics dialog.
 */

async function openMoveTopicsDialog() {
  const ids = getTopicSelectionIds();
  if (!ids.length) {
    alert('Please select topics first.');
    return;
  }
  const subjectSelect = el('moveTopicsSubjectSelect');
  const info = el('moveTopicsSelectionInfo');
  const confirmBtn = el('confirmMoveTopicsBtn');
  if (!subjectSelect || !confirmBtn) return;

  const subjects = sortSubjectsByLastEdited((await getAll('subjects')).filter(s => s.id !== selectedSubject?.id));
  subjectSelect.innerHTML = '';
  subjects.forEach(subject => {
    const option = document.createElement('option');
    option.value = subject.id;
    option.textContent = subject.name;
    subjectSelect.appendChild(option);
  });
  const hasTargets = subjects.length > 0;
  subjectSelect.disabled = !hasTargets;
  confirmBtn.disabled = !hasTargets;
  if (info) {
    const word = ids.length === 1 ? 'topic' : 'topics';
    info.textContent = `${ids.length} ${word} selected`;
  }
  if (!hasTargets) {
    alert('No other subject available as target.');
    return;
  }
  showDialog(el('moveTopicsDialog'));
}

/**
 * @function moveSelectedTopics
 * @description Handles move selected topics logic.
 */

async function moveSelectedTopics() {
  const ids = getTopicSelectionIds();
  if (!ids.length) return;
  const targetSubjectId = el('moveTopicsSubjectSelect')?.value || '';
  const sourceSubjectId = selectedSubject?.id || '';
  if (!targetSubjectId) {
    alert('Please select a target subject.');
    return;
  }
  const allTopics = await getAll('topics');
  for (const topic of allTopics) {
    if (!topicSelectedIds.has(topic.id)) continue;
    if (topic.subjectId === targetSubjectId) continue;
    await put('topics', { ...topic, subjectId: targetSubjectId });
    selectedTopicIds.delete(topic.id);
    if (selectedTopic?.id === topic.id) selectedTopic = null;
  }
  if (sourceSubjectId) await touchSubject(sourceSubjectId);
  if (targetSubjectId && targetSubjectId !== sourceSubjectId) await touchSubject(targetSubjectId);
  closeDialog(el('moveTopicsDialog'));
  setTopicSelectionMode(false);
  await refreshSidebar();
  await loadTopics();
  if (!selectedTopic && currentView === 2) {
    setDeckSelectionMode(false);
    session.active = false;
    el('cardsOverviewSection').classList.remove('hidden');
    el('studySessionSection')?.classList.add('hidden');
    renderSessionPills();
    setView(1);
  }
}

/**
 * @function deleteSelectedTopics
 * @description Deletes selected topics.
 */

async function deleteSelectedTopics() {
  const ids = getTopicSelectionIds();
  if (!ids.length) return;
  const label = ids.length === 1 ? 'this topic' : `these ${ids.length} topics`;
  if (!confirm(`Delete ${label} and all cards inside?`)) return;
  for (const topicId of ids) {
    await deleteTopicById(topicId, { skipSubjectTouch: true });
  }
  if (selectedSubject?.id) await touchSubject(selectedSubject.id);
  setTopicSelectionMode(false);
  await refreshSidebar();
  await loadTopics();
  if (!selectedTopic && currentView === 2) {
    setDeckSelectionMode(false);
    session.active = false;
    el('cardsOverviewSection').classList.remove('hidden');
    el('studySessionSection')?.classList.add('hidden');
    renderSessionPills();
    setView(1);
  }
}

/**
 * @function syncSessionCard
 * @description Synchronizes session card.
 */

function syncSessionCard(updated) {
  if (!session.active || !updated) return;
  const activeIdx = session.activeQueue.findIndex(c => c.id === updated.id);
  if (activeIdx !== -1) session.activeQueue[activeIdx] = { ...session.activeQueue[activeIdx], ...updated };
  const masteredIdx = session.mastered.findIndex(c => c.id === updated.id);
  if (masteredIdx !== -1) session.mastered[masteredIdx] = { ...session.mastered[masteredIdx], ...updated };
}

/**
 * @function populateMoveTopics
 * @description Handles populate move topics logic.
 */

async function populateMoveTopics(subjectId) {
  const topicSelect = el('moveCardsTopicSelect');
  const confirmBtn = el('confirmMoveCardsBtn');
  if (!topicSelect || !confirmBtn) return;
  const topics = await getTopicsBySubject(subjectId);
  topicSelect.innerHTML = '';
  topics.forEach(topic => {
    const option = document.createElement('option');
    option.value = topic.id;
    option.textContent = topic.name;
    topicSelect.appendChild(option);
  });
  topicSelect.disabled = !topics.length;
  confirmBtn.disabled = !topics.length;
}

/**
 * @function openMoveCardsDialog
 * @description Opens the move cards dialog.
 */

async function openMoveCardsDialog() {
  const ids = getDeckSelectionIds();
  if (!ids.length) {
    alert('Bitte waehle zuerst Karten aus.');
    return;
  }
  const subjects = sortSubjectsByLastEdited(await getAll('subjects'));
  if (!subjects.length) {
    alert('Keine Subjects verfuegbar.');
    return;
  }
  const subjectSelect = el('moveCardsSubjectSelect');
  const info = el('moveCardsSelectionInfo');
  if (!subjectSelect) return;
  subjectSelect.innerHTML = '';
  subjects.forEach(subject => {
    const option = document.createElement('option');
    option.value = subject.id;
    option.textContent = subject.name;
    subjectSelect.appendChild(option);
  });
  const preferredSubjectId = subjects.some(s => s.id === selectedSubject?.id)
    ? selectedSubject.id
    : subjects[0].id;
  subjectSelect.value = preferredSubjectId;
  await populateMoveTopics(subjectSelect.value);
  if (info) {
    const cardWord = ids.length === 1 ? 'Karte' : 'Karten';
    info.textContent = `${ids.length} ${cardWord} ausgewaehlt`;
  }
  showDialog(el('moveCardsDialog'));
}

/**
 * @function moveSelectedDeckCards
 * @description Handles move selected deck cards logic.
 */

async function moveSelectedDeckCards() {
  const ids = getDeckSelectionIds();
  if (!ids.length) return;
  const targetTopicId = el('moveCardsTopicSelect')?.value || '';
  if (!targetTopicId) {
    alert('Bitte waehle ein Ziel-Topic aus.');
    return;
  }
  const sourceSubjectId = selectedSubject?.id || '';
  const targetSubjectId = (await getById('topics', targetTopicId))?.subjectId || '';
  const sourceTopicCards = selectedTopic?.id
    ? await getCardsByTopicIds([selectedTopic.id], { force: true })
    : await getAll('cards');
  const selectedCards = sourceTopicCards.filter(card => deckSelectedCardIds.has(card.id));
  for (const card of selectedCards) {
    if (card.topicId === targetTopicId) continue;
    const updated = { ...card, topicId: targetTopicId };
    await put('cards', updated);
    await putCardBank(updated);
    syncSessionCard(updated);
  }
  if (sourceSubjectId) await touchSubject(sourceSubjectId);
  if (targetSubjectId && targetSubjectId !== sourceSubjectId) await touchSubject(targetSubjectId);
  closeDialog(el('moveCardsDialog'));
  setDeckSelectionMode(false);
  await loadDeck();
  await loadEditorCards();
  await refreshSidebar();
  if (selectedSubject) await refreshTopicSessionMeta();
}

/**
 * @function deleteSelectedDeckCards
 * @description Deletes selected deck cards.
 */

async function deleteSelectedDeckCards() {
  const ids = getDeckSelectionIds();
  if (!ids.length) return;
  const label = ids.length === 1 ? 'diese Karte' : `diese ${ids.length} Karten`;
  if (!confirm(`Moechtest du ${label} loeschen?`)) return;
  for (const cardId of ids) {
    await deleteCardById(cardId, { skipSubjectTouch: true });
  }
  if (selectedSubject?.id) await touchSubject(selectedSubject.id);
  setDeckSelectionMode(false);
  await loadDeck();
  await loadEditorCards();
  await refreshSidebar();
  if (selectedSubject) await refreshTopicSessionMeta();
}

/**
 * @function applyCardTileMcqGridLayout
 * @description Applies adaptive MCQ grid layout for card tiles.
 */

function applyCardTileMcqGridLayout(optionsWrap, optionCount = 0) {
  if (!optionsWrap) return;
  const total = Math.max(0, Math.trunc(Number(optionCount) || 0));
  if (total < 2) {
    optionsWrap.classList.remove('two-row-grid');
    optionsWrap.style.removeProperty('--card-tile-mcq-grid-cols');
    return;
  }
  const cols = total === 2 ? 2 : Math.max(2, Math.ceil(total / 2));
  optionsWrap.classList.add('two-row-grid');
  optionsWrap.style.setProperty('--card-tile-mcq-grid-cols', String(cols));
}

/**
 * @function applyEqualMcqOptionTileSize
 * @description Sets equal option tile heights within the same rendered MCQ options block.
 */

function applyEqualMcqOptionTileSize(optionsWrap) {
  if (!optionsWrap) return;
  const run = () => {
    if (!optionsWrap.isConnected) return;
    const optionNodes = Array.from(optionsWrap.children).filter(node =>
      node instanceof HTMLElement
      && (node.classList.contains('mcq-option') || node.classList.contains('card-tile-mcq-option'))
    );
    if (optionNodes.length < 2) return;

    optionNodes.forEach(node => {
      node.style.removeProperty('--mcq-equal-height');
      node.style.removeProperty('height');
      node.style.removeProperty('min-height');
    });

    const maxHeight = optionNodes.reduce(
      (height, node) => Math.max(height, Math.ceil(node.getBoundingClientRect().height)),
      0
    );
    if (maxHeight <= 0) return;
    optionNodes.forEach(node => node.style.setProperty('--mcq-equal-height', `${maxHeight}px`));
  };

  requestAnimationFrame(() => {
    run();
    requestAnimationFrame(run);
  });
}

/**
 * @function renderCardTileAnswerContent
 * @description Renders card tile answer content.
 */

function renderCardTileAnswerContent(container, card, options = {}) {
  if (!container) return;
  const isMcq = card?.type === 'mcq' && Array.isArray(card?.options) && card.options.length > 1;
  if (!isMcq) {
    const answerText = String(card?.answer || '');
    const hasAnswerText = answerText.trim().length > 0;
    const hasAnswerImages = getCardImageList(card, 'A').length > 0;
    if (hasAnswerText || !hasAnswerImages) {
      renderRich(container, answerText, {
        textAlign: card?.answerTextAlign || card?.textAlign || 'center'
      });
    }
    return;
  }

  container.classList.add('card-tile-mcq');
  const optionsWrap = document.createElement('div');
  optionsWrap.className = 'card-tile-mcq-options';
  const optionsAlign = card?.optionsTextAlign || card?.answerTextAlign || card?.textAlign || 'center';
  card.options.forEach(option => {
    const row = document.createElement('div');
    row.className = 'card-tile-mcq-option';
    const textEl = document.createElement('div');
    textEl.className = 'card-tile-mcq-option-text';
    renderRich(textEl, option?.text || '', { textAlign: optionsAlign });
    row.appendChild(textEl);
    optionsWrap.appendChild(row);
  });
  applyCardTileMcqGridLayout(optionsWrap, card.options.length);
  container.appendChild(optionsWrap);
  applyEqualMcqOptionTileSize(optionsWrap);
}

/**
 * @function buildCardTile
 * @description Builds card tile.
 */

function buildCardTile(card, idx, compact = false) {
  const tile = document.createElement('div');
  tile.className = 'card-tile card-tile-overview';
  tile.dataset.cardId = String(card?.id || '');
  if (compact) tile.classList.add('card-tile-compact');
  const selectionEnabled = deckSelectionMode && !compact;
  if (selectionEnabled) {
    tile.classList.add('selection-mode');
    tile.classList.toggle('selected-for-bulk', deckSelectedCardIds.has(card.id));
  }

  if (!selectionEnabled) {
    const menu = document.createElement('div');
    menu.className = 'card-tile-menu';
    menu.innerHTML = `
          <button class="btn card-menu-btn" type="button">⋯</button>
          <div class="card-menu">
            <button class="btn card-menu-item" style="background-color: var(--success)" type="button">Edit</button>
            <button class="btn delete card-menu-item delete-card-btn" type="button">Delete</button>
          </div>
        `;
    menu.querySelector('.card-menu-item').onclick = (e) => {
      e.stopPropagation();
      openEditDialog(card);
    };
    menu.querySelector('.delete-card-btn').onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this flashcard?')) return;
      await deleteCardById(card.id);
      loadDeck();
      loadEditorCards();
      refreshSidebar();
    };
    menu.querySelector('.card-menu-btn').onclick = (e) => {
      e.stopPropagation();
      menu.classList.toggle('open');
    };
    document.addEventListener('click', () => menu.classList.remove('open'));
    tile.appendChild(menu);

    if (compact) {
      const previewBtn = document.createElement('button');
      previewBtn.className = 'btn card-preview-btn';
      previewBtn.type = 'button';
      previewBtn.textContent = 'Preview';
      previewBtn.addEventListener('click', e => {
        e.stopPropagation();
        openCardPreviewDialog(card);
      });
      tile.appendChild(previewBtn);
    }
  } else {
    const selectWrap = document.createElement('label');
    selectWrap.className = 'card-select-control';
    selectWrap.innerHTML = `<input type="checkbox" aria-label="Karte auswaehlen" />`;
    const checkbox = selectWrap.querySelector('input');
    checkbox.checked = deckSelectedCardIds.has(card.id);
    checkbox.addEventListener('click', e => e.stopPropagation());
    checkbox.addEventListener('change', () => {
      toggleDeckCardSelection(card.id, checkbox.checked);
      tile.classList.toggle('selected-for-bulk', checkbox.checked);
    });
    tile.addEventListener('click', e => {
      if (e.target.closest('.card-select-control')) return;
      const nextChecked = !checkbox.checked;
      checkbox.checked = nextChecked;
      toggleDeckCardSelection(card.id, nextChecked);
      tile.classList.toggle('selected-for-bulk', nextChecked);
    });
    tile.appendChild(selectWrap);
  }

  const qTitle = document.createElement('div');
  qTitle.className = 'card-tile-title';
  qTitle.textContent = 'Q';
  const qBody = document.createElement('div');
  qBody.className = 'card-tile-body';
  renderRich(qBody, card.prompt || '', { textAlign: card.questionTextAlign || card.textAlign || 'center' });
  appendCardImages(qBody, getCardImageList(card, 'Q'), 'card-thumb', 'Question image');
  const separator = document.createElement('div');
  separator.className = 'card-tile-separator';
  const aTitle = document.createElement('div');
  aTitle.className = 'card-tile-title';
  aTitle.textContent = 'A';
  const aBody = document.createElement('div');
  aBody.className = 'card-tile-body';
  renderCardTileAnswerContent(aBody, card, { compact });
  appendCardImages(aBody, getCardImageList(card, 'A'), 'card-thumb', 'Answer image');

  tile.append(qTitle, qBody, separator, aTitle, aBody);
  return tile;
}

/**
 * @function prependCardTileToContainer
 * @description Inserts/updates one card tile at the top of a container for instant UI feedback.
 */

function prependCardTileToContainer(container, card, compact = false) {
  if (!container || !card?.id) return;
  const cardIdAttr = String(card.id).replace(/"/g, '\\"');
  const existing = container.querySelector(`.card-tile[data-card-id="${cardIdAttr}"]`);
  if (existing) existing.remove();
  if (container.querySelector('.tiny')) container.innerHTML = '';
  const tile = buildCardTile(card, 0, compact);
  container.prepend(tile);
}

/**
 * @function applyOptimisticCardCreate
 * @description Updates editor/deck card overviews immediately after create without waiting for a refetch.
 */

function applyOptimisticCardCreate(card) {
  if (!card?.id) return;
  prependCardTileToContainer(el('editorCardsList'), card, true);
  if (selectedTopic?.id === card.topicId) {
    prependCardTileToContainer(el('cardsGrid'), card, false);
    bumpDeckTopicCardCount(1);
  }
}

/**
 * @function replaceCardTileInContainer
 * @description Replaces one existing card tile in-place to keep list order stable after edits.
 */

function replaceCardTileInContainer(container, card, compact = false) {
  if (!container || !card?.id) return false;
  const cardIdAttr = String(card.id).replace(/"/g, '\\"');
  const existing = container.querySelector(`.card-tile[data-card-id="${cardIdAttr}"]`);
  if (!existing) return false;
  existing.replaceWith(buildCardTile(card, 0, compact));
  return true;
}

/**
 * @function applyOptimisticCardUpdate
 * @description Updates visible card tiles immediately after edit without waiting for a full reload.
 */

function applyOptimisticCardUpdate(card) {
  if (!card?.id) return;
  const inEditor = replaceCardTileInContainer(el('editorCardsList'), card, true);
  const inDeck = replaceCardTileInContainer(el('cardsGrid'), card, false);
  if (!inEditor && selectedTopic?.id === card.topicId) {
    prependCardTileToContainer(el('editorCardsList'), card, true);
  }
  if (!inDeck && selectedTopic?.id === card.topicId) {
    prependCardTileToContainer(el('cardsGrid'), card, false);
  }
}

/**
 * @function normalizeTopicSearchQuery
 * @description Normalizes topic search query.
 */

function normalizeTopicSearchQuery(value = '') {
  return String(value || '').trim().toLowerCase();
}

/**
 * @function getCardSearchHaystack
 * @description Returns the card search haystack.
 */

function getCardSearchHaystack(card) {
  const optionText = Array.isArray(card?.options)
    ? card.options.map(option => option?.text || '').join('\n')
    : '';
  return `${card?.prompt || ''}\n${card?.answer || ''}\n${optionText}`.toLowerCase();
}

/**
 * @function setTopicSearchMetaText
 * @description Sets the topic search meta text.
 */

function setTopicSearchMetaText(text = '') {
  const meta = el('topicSearchMeta');
  if (!meta) return;
  meta.textContent = text;
}

/**
 * @function buildTopicSearchResultCard
 * @description Builds topic search result card.
 */

function buildTopicSearchResultCard(card, topicName = '') {
  const wrap = document.createElement('article');
  wrap.className = 'topic-search-result';

  const topicField = document.createElement('div');
  topicField.className = 'topic-search-result-topic';
  topicField.textContent = topicName || 'Unknown topic';

  const tile = document.createElement('div');
  tile.className = 'card-tile card-tile-search';

  const menu = document.createElement('div');
  menu.className = 'card-tile-menu';
  menu.innerHTML = `
        <button class="btn card-menu-btn" type="button">⋯</button>
        <div class="card-menu">
          <button class="btn card-menu-item" style="background-color: var(--success)" type="button">Edit</button>
        </div>
      `;
  const editBtn = menu.querySelector('.card-menu-item');
  if (editBtn) {
    editBtn.onclick = e => {
      e.stopPropagation();
      openEditDialog(card);
      menu.classList.remove('open');
    };
  }
  const toggleBtn = menu.querySelector('.card-menu-btn');
  if (toggleBtn) {
    toggleBtn.onclick = e => {
      e.stopPropagation();
      menu.classList.toggle('open');
    };
  }
  document.addEventListener('click', () => menu.classList.remove('open'));
  tile.appendChild(menu);

  const qTitle = document.createElement('div');
  qTitle.className = 'card-tile-title';
  qTitle.textContent = 'Q';

  const qBody = document.createElement('div');
  qBody.className = 'card-tile-body';
  renderRich(qBody, card.prompt || '', { textAlign: card.questionTextAlign || card.textAlign || 'center' });
  appendCardImages(qBody, getCardImageList(card, 'Q'), 'card-thumb', 'Question image');

  const separator = document.createElement('div');
  separator.className = 'card-tile-separator';

  const aTitle = document.createElement('div');
  aTitle.className = 'card-tile-title';
  aTitle.textContent = 'A';

  const aBody = document.createElement('div');
  aBody.className = 'card-tile-body';
  renderCardTileAnswerContent(aBody, card);
  appendCardImages(aBody, getCardImageList(card, 'A'), 'card-thumb', 'Answer image');

  tile.append(qTitle, qBody, separator, aTitle, aBody);
  wrap.append(topicField, tile);
  return wrap;
}

/**
 * @function runTopicSearch
 * @description Handles run topic search logic.
 */

async function runTopicSearch() {
  if (!selectedSubject) return;
  const input = el('topicSearchInput');
  const results = el('topicSearchResults');
  if (!input || !results) return;

  const query = normalizeTopicSearchQuery(input.value);
  const topics = await getTopicsBySubject(selectedSubject.id);
  const topicNameById = Object.fromEntries(topics.map(topic => [topic.id, topic.name]));
  const topicIds = new Set(topics.map(topic => topic.id));

  if (!query) {
    results.innerHTML = '<div class="tiny">Enter text to search cards in this subject.</div>';
    setTopicSearchMetaText(`Search in ${topics.length} ${topics.length === 1 ? 'topic' : 'topics'}.`);
    return;
  }

  const cards = await getCardsByTopicIds([...topicIds]);
  const matches = cards.filter(card => getCardSearchHaystack(card).includes(query));
  matches.sort((a, b) => getCardCreatedAt(b) - getCardCreatedAt(a));

  results.innerHTML = '';
  if (!matches.length) {
    results.innerHTML = '<div class="tiny">No matching cards found.</div>';
    setTopicSearchMetaText('0 cards found.');
    return;
  }

  matches.forEach(card => {
    results.appendChild(buildTopicSearchResultCard(card, topicNameById[card.topicId] || 'Unknown topic'));
  });
  const cardWord = matches.length === 1 ? 'card' : 'cards';
  setTopicSearchMetaText(`${matches.length} ${cardWord} found.`);
}

/**
 * @function openTopicSearchModal
 * @description Opens the topic search modal.
 */

async function openTopicSearchModal() {
  if (!selectedSubject) {
    alert('Pick a subject first.');
    return;
  }
  const dialog = el('topicSearchDialog');
  const input = el('topicSearchInput');
  const results = el('topicSearchResults');
  if (!dialog || !input || !results) return;
  input.value = '';
  results.innerHTML = '';
  setTopicSearchMetaText('Enter text to search in question and answer fields.');
  showDialog(dialog);
  setTimeout(() => input.focus(), 0);
}

/**
 * @function deleteTopicById
 * @description Deletes topic by ID.
 */

async function deleteTopicById(topicId, options = {}) {
  const { skipSubjectTouch = false } = options;
  const topic = await getById('topics', topicId);
  const subjectId = topic?.subjectId || '';
  const cards = await getCardsByTopicIds([topicId], { force: true });
  for (const c of cards) await deleteCardById(c.id, { skipSubjectTouch: true });
  await del('topics', topicId);
  if (subjectId && !skipSubjectTouch) await touchSubject(subjectId);
  selectedTopicIds.delete(topicId);
  topicSelectedIds.delete(topicId);
  if (selectedTopic?.id === topicId) selectedTopic = null;
}

/**
 * @function deleteSubjectById
 * @description Deletes subject by ID.
 */

async function deleteSubjectById(subjectId) {
  const topics = await getTopicsBySubject(subjectId, { force: true });
  for (const t of topics) await deleteTopicById(t.id, { skipSubjectTouch: true });
  await del('subjects', subjectId);
  if (selectedSubject?.id === subjectId) {
    selectedSubject = null;
    selectedTopic = null;
    setView(0);
  }
  refreshSidebar();
  loadTopics();
}

/**
 * @function loadDeck
 * @description Loads and renders cards for the selected topic in the overview grid.
 */

async function loadDeck() {
  if (!selectedTopic) {
    setDeckTopicCardCount(null);
    setDeckSelectionMode(false);
    return;
  }
  setDeckTitle(selectedTopic.name);
  const cards = await getCardsByTopicIds([selectedTopic.id]);
  setDeckTopicCardCount(cards.length);
  cards.sort((a, b) => getCardCreatedAt(b) - getCardCreatedAt(a));
  const cardIds = new Set(cards.map(card => card.id));
  deckSelectedCardIds.forEach(cardId => {
    if (!cardIds.has(cardId)) deckSelectedCardIds.delete(cardId);
  });
  const grid = el('cardsGrid');
  if (!cards.length) {
    setDeckSelectionMode(false);
    grid.innerHTML = '<div class="tiny">No cards yet.</div>';
    return;
  }
  updateDeckSelectionUi();
  grid.innerHTML = '';
  cards.forEach((c, idx) => {
    grid.appendChild(buildCardTile(c, idx));
  });
}

/**
 * @function migrateExistingCardsToCenteredQa
 * @description Migrates existing cards to centered Q/A.
 */

async function migrateExistingCardsToCenteredQa() {
  const cards = await getAll('cards');
  if (!cards.length) return;
  const isValidAlign = value => {
    const v = String(value || '').toLowerCase();
    return v === 'left' || v === 'center' || v === 'justify';
  };
  for (const card of cards) {
    const questionAlignRaw = card.questionTextAlign ?? card.textAlign;
    const answerAlignRaw = card.answerTextAlign ?? card.textAlign;
    const optionsAlignRaw = card.optionsTextAlign;

    const nextQuestionAlign = isValidAlign(questionAlignRaw) ? normalizeTextAlign(questionAlignRaw) : 'center';
    const nextAnswerAlign = isValidAlign(answerAlignRaw) ? normalizeTextAlign(answerAlignRaw) : 'center';
    const nextTextAlign = isValidAlign(card.textAlign) ? normalizeTextAlign(card.textAlign) : nextQuestionAlign;
    const nextOptionsAlign = isValidAlign(optionsAlignRaw) ? normalizeTextAlign(optionsAlignRaw) : 'center';

    const needsUpdate =
      card.questionTextAlign !== nextQuestionAlign ||
      card.answerTextAlign !== nextAnswerAlign ||
      card.textAlign !== nextTextAlign ||
      card.optionsTextAlign !== nextOptionsAlign;
    if (!needsUpdate) continue;
    const updated = {
      ...card,
      textAlign: nextTextAlign,
      questionTextAlign: nextQuestionAlign,
      answerTextAlign: nextAnswerAlign,
      optionsTextAlign: nextOptionsAlign
    };
    await put('cards', updated);
    await putCardBank(updated);
  }
}

/**
 * @function getCardCreatedAt
 * @description Returns the card created at.
 */

function getCardCreatedAt(card) {
  const raw = card?.meta?.createdAt ?? card?.createdAt ?? 0;
  if (!raw) return 0;
  if (typeof raw === 'number') return raw;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * @function loadEditorCards
 * @description Loads editor cards.
 */

async function loadEditorCards() {
  if (!selectedTopic) return;
  const cards = await getCardsByTopicIds([selectedTopic.id]);
  cards.sort((a, b) => getCardCreatedAt(b) - getCardCreatedAt(a));
  const list = el('editorCardsList');
  if (!cards.length) {
    list.innerHTML = '<div class="tiny">No cards yet.</div>';
    return;
  }
  list.innerHTML = '';
  cards.forEach((c, idx) => {
    list.appendChild(buildCardTile(c, idx, true));
  });
}

// ============================================================================
// StudySession
// ============================================================================
/**
 * @function shuffleArrayInPlace
 * @description Randomly shuffles an array in place using Fisher-Yates.
 */

function shuffleArrayInPlace(items = []) {
  const arr = Array.isArray(items) ? items : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * @function pickWeightedTopicId
 * @description Picks one topic ID weighted by remaining bucket size.
 */

function pickWeightedTopicId(topicIds = [], bucketsByTopicId = new Map()) {
  const ids = Array.isArray(topicIds) ? topicIds : [];
  if (!ids.length) return '';
  let totalWeight = 0;
  ids.forEach(topicId => {
    const bucket = bucketsByTopicId.get(topicId);
    totalWeight += Array.isArray(bucket) ? bucket.length : 0;
  });
  if (totalWeight <= 0) return ids[0];
  let roll = Math.random() * totalWeight;
  for (const topicId of ids) {
    const bucket = bucketsByTopicId.get(topicId);
    const weight = Array.isArray(bucket) ? bucket.length : 0;
    if (weight <= 0) continue;
    if (roll < weight) return topicId;
    roll -= weight;
  }
  return ids[ids.length - 1];
}

/**
 * @function interleaveCardsByTopic
 * @description Reorders cards to avoid same-topic streaks when multiple topics are present.
 */

function interleaveCardsByTopic(cards = []) {
  const list = Array.isArray(cards) ? cards.filter(Boolean) : [];
  if (list.length <= 2) return [...list];

  const bucketsByTopicId = new Map();
  list.forEach(card => {
    const topicId = String(card?.topicId || '__unknown__').trim() || '__unknown__';
    if (!bucketsByTopicId.has(topicId)) bucketsByTopicId.set(topicId, []);
    bucketsByTopicId.get(topicId).push(card);
  });

  const topicIds = Array.from(bucketsByTopicId.keys());
  if (topicIds.length <= 1) {
    const onlyTopic = [...list];
    shuffleArrayInPlace(onlyTopic);
    return onlyTopic;
  }

  topicIds.forEach(topicId => {
    shuffleArrayInPlace(bucketsByTopicId.get(topicId));
  });
  shuffleArrayInPlace(topicIds);

  const mixed = [];
  let previousTopicId = '';
  while (mixed.length < list.length) {
    const availableTopicIds = topicIds.filter(topicId => {
      const bucket = bucketsByTopicId.get(topicId);
      return Array.isArray(bucket) && bucket.length > 0;
    });
    if (!availableTopicIds.length) break;
    const preferredTopicIds = availableTopicIds.filter(topicId => topicId !== previousTopicId);
    const pool = preferredTopicIds.length ? preferredTopicIds : availableTopicIds;
    const chosenTopicId = pickWeightedTopicId(pool, bucketsByTopicId);
    const chosenBucket = bucketsByTopicId.get(chosenTopicId);
    const nextCard = Array.isArray(chosenBucket) ? chosenBucket.shift() : null;
    if (!nextCard) break;
    mixed.push(nextCard);
    previousTopicId = chosenTopicId;
  }

  return mixed.length === list.length ? mixed : list;
}

/**
* @function startSession
 * @description Builds and starts a study session queue from selected topics, cards, and filters.
 */

async function startSession(options = {}) {
  if (sessionStartInFlight) return;
  sessionStartInFlight = true;
  resetSessionImagePreloadCache();
  setAppLoadingState(true, 'Preparing session...');
  try {
    const opts = (options && typeof options === 'object') ? options : {};
    const explicitTopicIds = Array.isArray(opts.topicIds) && opts.topicIds.length
      ? Array.from(new Set(opts.topicIds.map(topicId => String(topicId || '').trim()).filter(Boolean)))
      : [];
    const explicitCardIds = Array.isArray(opts.cardIds) && opts.cardIds.length
      ? Array.from(new Set(opts.cardIds.map(cardId => String(cardId || '').trim()).filter(Boolean)))
      : [];
    let topicIds = [...explicitTopicIds];
    if (!topicIds.length && !selectedSubject && !explicitCardIds.length) {
      alert('Pick a subject first.');
      return;
    }
    if (!topicIds.length && selectedSubject) {
      const topics = await getTopicsBySubject(selectedSubject.id);
      topicIds = topics.map(t => t.id).filter(id => selectedTopicIds.has(id));
    }
    if (!topicIds.length && !explicitCardIds.length) {
      alert('Select at least one topic.');
      return;
    }

    const reviewMode = opts.reviewMode === true;
    const filterConfig = normalizeSessionFilters(opts.filters || sessionFilterState);
    let eligibleCardIds = [];
    let cardRefs = [];
    if (explicitCardIds.length) {
      eligibleCardIds = await getEligibleSessionCardIdsByCardIds(explicitCardIds, filterConfig, {
        payloadLabel: reviewMode ? 'daily-review-session-refs' : 'session-card-refs'
      });
      if (eligibleCardIds.length) {
        cardRefs = await getCardRefsByCardIds(eligibleCardIds, {
          payloadLabel: reviewMode ? 'daily-review-session-refs' : 'session-card-refs'
        });
      }
    } else {
      eligibleCardIds = await getEligibleSessionCardIdsByTopicIds(topicIds, filterConfig);
    }
    if (!eligibleCardIds.length) {
      alert(reviewMode
        ? 'No review cards match the current selection.'
        : 'No cards match the current session filter.'
      );
      return;
    }
    if (!topicIds.length) {
      if (!cardRefs.length) {
        cardRefs = await getCardRefsByCardIds(eligibleCardIds, {
          payloadLabel: reviewMode ? 'daily-review-session-refs' : 'session-card-refs'
        });
      }
      topicIds = Array.from(new Set(
        cardRefs.map(ref => String(ref?.topicId || '').trim()).filter(Boolean)
      ));
    }

    const maxSelectable = eligibleCardIds.length;
    const rawRequested = Number(opts.forcedSize ?? sessionSize);
    const requestedSize = Number.isFinite(rawRequested) ? rawRequested : sessionSize;
    sessionSize = Math.min(Math.max(requestedSize, 1), maxSelectable);
    availableSessionCards = maxSelectable;
    renderSessionSizeCounter();
    await preloadTopicDirectory();

    const randomizedEligibleCardIds = [...eligibleCardIds];
    shuffleArrayInPlace(randomizedEligibleCardIds);
    const selectedCardIds = randomizedEligibleCardIds.slice(0, sessionSize);
    const fetchedCards = await getCardsByCardIds(selectedCardIds, {
      payloadLabel: reviewMode ? 'daily-review-session' : 'session-cards'
    });
    const cardsById = new Map(
      fetchedCards.map(card => [String(card?.id || '').trim(), card])
    );
    const selectedCards = selectedCardIds
      .map(cardId => cardsById.get(cardId))
      .filter(Boolean);
    if (!selectedCards.length) {
      alert(reviewMode
        ? 'No review cards match the current selection.'
        : 'No cards match the current session filter.'
      );
      return;
    }
    const mixedCards = interleaveCardsByTopic(selectedCards);

    const reviewCardIdSet = new Set(explicitCardIds);
    const sessionCards = mixedCards.map(card => ({
      ...card,
      topicName: resolveCardTopicName(card),
      sessionCorrectCount: 0,
      // In daily review, only cards whose latest persisted status is green
      // should start as one-step carry-over candidates.
      reviewCarryOver: reviewMode
        && reviewCardIdSet.has(card.id)
        && getDailyReviewCardStatus(card.id) === 'green',
      reviewDowngraded: false
    }));
    const initialGradeMap = {};
    if (reviewMode) {
      sessionCards.forEach(card => {
        const status = getDailyReviewCardStatus(card.id);
        if (status === 'yellow') initialGradeMap[card.id] = 'partial';
        else if (status === 'red') initialGradeMap[card.id] = 'wrong';
      });
    }
    session = {
      active: true,
      activeQueue: sessionCards,
      mastered: [],
      counts: Object.fromEntries(sessionCards.map(c => [c.id, 0])),
      gradeMap: initialGradeMap,
      mode: reviewMode ? 'daily-review' : 'default'
    };
    sessionRunState = {
      startedAt: Date.now(),
      topicIds: [...topicIds],
      cardIds: [...eligibleCardIds],
      filters: { ...filterConfig },
      mode: reviewMode ? 'daily-review' : 'default'
    };
    warmUpcomingSessionCards(2);
    closeDialog(el('sessionCompleteDialog'));
    setDeckTitle(reviewMode ? 'Daily Review' : (selectedSubject?.name || 'Study Session'));
    el('cardsOverviewSection').classList.add('hidden');
    el('studySessionSection')?.classList.remove('hidden');
    el('flashcard').classList.remove('hidden');
    setView(2);
    renderSessionPills();
    renderSessionCard();
  } finally {
    sessionStartInFlight = false;
    setAppLoadingState(false);
  }
}

/**
 * @function getSessionTextMetrics
 * @description Returns the session text metrics.
 */

function getSessionTextMetrics(content = '') {
  const parser = document.createElement('div');
  parser.innerHTML = markdownToHtml(content || '');
  const plainText = (parser.textContent || '').replace(/\s+/g, ' ').trim();
  const lines = String(content || '').split('\n').filter(line => line.trim().length > 0).length;
  const words = plainText ? plainText.split(' ').filter(Boolean).length : 0;
  return {
    chars: plainText.length,
    words,
    lines
  };
}

/**
 * @function computeSessionTextSizeRem
 * @description Handles compute session text size rem logic.
 */

function computeSessionTextSizeRem(content = '', options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const metrics = getSessionTextMetrics(content);
  const chars = metrics.chars;
  const lines = metrics.lines;
  const words = metrics.words;
  let sizeRem = 1.18;

  if (chars <= 20 && lines <= 1) sizeRem = 2.05;
  else if (chars <= 45 && lines <= 2) sizeRem = 1.82;
  else if (chars <= 80 && lines <= 3) sizeRem = 1.58;
  else if (chars <= 130 && lines <= 4) sizeRem = 1.36;
  else if (chars <= 210) sizeRem = 1.2;
  else sizeRem = 1.08;

  if (words >= 35) sizeRem -= 0.08;
  if (lines >= 6) sizeRem -= 0.1;
  if (opts.hasImage) sizeRem -= 0.2;
  if (opts.isMcq) sizeRem -= 0.08;

  const optionCount = Math.max(0, Math.trunc(Number(opts.optionCount) || 0));
  if (opts.forMcqOption && optionCount > 0) {
    if (optionCount >= 4) sizeRem -= 0.12;
    if (optionCount >= 6) sizeRem -= 0.08;
    if (chars <= 42 && lines <= 2) sizeRem += 0.08;
  }

  if (opts.preferLargerBack && !opts.hasImage && !opts.isMcq) {
    if (chars <= 170 && lines <= 5) sizeRem += 0.12;
    if (chars <= 90 && lines <= 3) sizeRem += 0.08;
  }

  const maxRem = opts.preferLargerBack ? 2.24 : 2.1;
  return Math.max(0.98, Math.min(maxRem, sizeRem));
}

/**
 * @function applySessionTextSize
 * @description Applies session text size.
 */

function applySessionTextSize(container, content = '', options = {}) {
  if (!container) return;
  const sizeRem = computeSessionTextSizeRem(content, options);
  container.classList.add('session-dynamic-text');
  container.style.setProperty('--session-text-size', `${sizeRem.toFixed(3)}rem`);
}

/**
 * @function canFlipPreviewFlashcard
 * @description Returns whether flip preview flashcard.
 */

function canFlipPreviewFlashcard(eventTarget = null, { allowButtonTarget = false } = {}) {
  const target = eventTarget instanceof Element ? eventTarget : null;
  if (target && target.closest('input, textarea, select, [contenteditable="true"]')) return false;
  if (!allowButtonTarget && target && target.closest('button')) return false;
  return true;
}

/**
 * @function flipPreviewFlashcard
 * @description Handles flip preview flashcard logic.
 */

function flipPreviewFlashcard() {
  const flashcard = el('previewFlashcard');
  if (!flashcard || flashcard.classList.contains('mcq-mode')) return;
  flashcard.classList.toggle('flipped');
}

/**
 * @function applyMcqOptionsGridLayout
 * @description Applies adaptive MCQ options grid layout.
 */

function applyMcqOptionsGridLayout(optionsWrap, optionCount = 0) {
  if (!optionsWrap) return;
  const total = Math.max(0, Math.trunc(Number(optionCount) || 0));
  const shouldUseGrid = total >= 2;
  optionsWrap.classList.toggle('two-row-grid', shouldUseGrid);
  if (!shouldUseGrid) {
    optionsWrap.style.removeProperty('--mcq-grid-cols');
    return;
  }
  const cols = total === 2 ? 2 : Math.max(2, Math.ceil(total / 2));
  optionsWrap.style.setProperty('--mcq-grid-cols', String(cols));
  applyEqualMcqOptionTileSize(optionsWrap);
}

/**
 * @function resolveCardTopicName
 * @description Handles resolve card topic name logic.
 */

function resolveCardTopicName(card) {
  const directTopicName = String(card?.topicName || '').trim();
  if (directTopicName) return directTopicName;
  const topicId = String(card?.topicId || '').trim();
  if (topicId) {
    const topic = topicDirectoryById.get(topicId) || null;
    const topicName = String(topic?.name || '').trim();
    if (topicName) return topicName;
    if (selectedTopic && String(selectedTopic.id || '').trim() === topicId) {
      const selectedName = String(selectedTopic.name || '').trim();
      if (selectedName) return selectedName;
    }
  }
  if (!topicId && selectedTopic) {
    const selectedName = String(selectedTopic.name || '').trim();
    if (selectedName) return selectedName;
  }
  if (sessionRunState.topicIds.length === 1) {
    const fallbackTopicId = String(sessionRunState.topicIds[0] || '').trim();
    const fallbackTopic = topicDirectoryById.get(fallbackTopicId) || null;
    const fallbackName = String(fallbackTopic?.name || '').trim();
    if (fallbackName) return fallbackName;
  }
  return '';
}

/**
 * @function ensureFaceTopicPill
 * @description Ensures a topic pill element exists in a flashcard face and returns it.
 */

function ensureFaceTopicPill(faceId, pillId) {
  const faceEl = el(faceId);
  if (!faceEl) return null;
  let pillEl = el(pillId);
  if (pillEl) return pillEl;
  pillEl = document.createElement('div');
  pillEl.id = pillId;
  pillEl.className = 'study-topic-pill face-topic-pill hidden';
  const editBtn = faceEl.querySelector('.card-edit-btn');
  if (editBtn) faceEl.insertBefore(pillEl, editBtn);
  else faceEl.appendChild(pillEl);
  return pillEl;
}

/**
 * @function ensureSessionTopicPills
 * @description Ensures both study-session topic pill elements exist.
 */

function ensureSessionTopicPills() {
  return {
    front: ensureFaceTopicPill('frontFace', 'frontTopicPill'),
    back: ensureFaceTopicPill('backFace', 'backTopicPill')
  };
}

/**
 * @function setCardTopicPill
 * @description Sets the card topic pill.
 */

function setCardTopicPill(pillEl, topicName = '') {
  if (!pillEl) return;
  const name = String(topicName || '').trim();
  if (!name) {
    pillEl.textContent = '';
    pillEl.removeAttribute('title');
    pillEl.classList.add('hidden');
    return;
  }
  pillEl.textContent = name;
  pillEl.title = name;
  pillEl.classList.remove('hidden');
}

/**
 * @function renderSessionTopicPills
 * @description Renders session topic pills.
 */

function renderSessionTopicPills(card) {
  const topicName = resolveCardTopicName(card);
  const pills = ensureSessionTopicPills();
  setCardTopicPill(pills.front, topicName);
  setCardTopicPill(pills.back, topicName);
}

/**
 * @function renderPreviewTopicPills
 * @description Renders preview topic pills.
 */

function renderPreviewTopicPills(card) {
  const topicName = resolveCardTopicName(card);
  setCardTopicPill(el('previewFrontTopicPill'), topicName);
  setCardTopicPill(el('previewBackTopicPill'), topicName);
}

/**
 * @function renderCardPreviewContent
 * @description Renders card preview content.
 */

function renderCardPreviewContent(card) {
  const flashcardEl = el('previewFlashcard');
  const front = el('previewFrontContent');
  const back = el('previewBackContent');
  if (!flashcardEl || !front || !back || !card) return;
  renderPreviewTopicPills(card);

  const isMcq = card.type === 'mcq' && (card.options || []).length > 1;
  const qImages = getCardImageList(card, 'Q');
  const aImages = getCardImageList(card, 'A');
  flashcardEl.classList.remove('flipped');
  flashcardEl.dataset.type = isMcq ? 'mcq' : 'qa';
  flashcardEl.classList.toggle('mcq-mode', isMcq);

  front.innerHTML = `<div class="qtxt"></div>`;
  const qtxtEl = front.querySelector('.qtxt');
  renderRich(qtxtEl, card.prompt || '', { textAlign: card.questionTextAlign || card.textAlign || 'center' });
  applySessionTextSize(qtxtEl, card.prompt || '', { hasImage: qImages.length > 0, isMcq });
  appendSessionImages(front, qImages, 'Question image');

  if (isMcq) {
    back.innerHTML = '';
    const optionsWrap = document.createElement('div');
    optionsWrap.className = 'mcq-options';
    const optionCount = (card.options || []).length;
    const optionsAlign = card.optionsTextAlign || card.answerTextAlign || card.textAlign || 'center';
    (card.options || []).forEach(option => {
      const optionEl = document.createElement('button');
      optionEl.type = 'button';
      optionEl.className = 'mcq-option';
      optionEl.disabled = true;
      optionEl.tabIndex = -1;
      const textEl = document.createElement('span');
      textEl.className = 'mcq-text';
      renderRich(textEl, option?.text || '', { textAlign: optionsAlign });
      applySessionTextSize(textEl, option?.text || '', {
        forMcqOption: true,
        optionCount
      });
      optionEl.appendChild(textEl);
      optionsWrap.appendChild(optionEl);
    });
    applyMcqOptionsGridLayout(optionsWrap, optionCount);
    const answerZone = document.createElement('div');
    answerZone.className = 'mcq-answer-zone';
    const separator = document.createElement('div');
    separator.className = 'card-tile-separator';
    const checkRow = document.createElement('div');
    checkRow.className = 'mcq-check-row';
    const checkBtn = document.createElement('button');
    checkBtn.className = 'btn mcq-check-btn';
    checkBtn.type = 'button';
    checkBtn.textContent = 'Check';
    checkBtn.disabled = true;
    checkRow.appendChild(checkBtn);
    answerZone.append(separator, optionsWrap, checkRow);
    front.append(answerZone);
  } else {
    back.innerHTML = `<div class="atxt"></div>`;
    const atxtEl = back.querySelector('.atxt');
    renderRich(atxtEl, card.answer || '', { textAlign: card.answerTextAlign || card.textAlign || 'center' });
    applySessionTextSize(atxtEl, card.answer || '', {
      hasImage: aImages.length > 0,
      preferLargerBack: true
    });
  }
  appendSessionImages(back, aImages, 'Answer image');
}

/**
 * @function openCardPreviewDialog
 * @description Opens the card preview dialog.
 */

function openCardPreviewDialog(card) {
  if (!card) return;
  const dialog = el('cardPreviewDialog');
  if (!dialog) return;
  renderCardPreviewContent(card);
  showDialog(dialog);
}

/**
 * @function renderCardContent
 * @description Renders card content.
 */

function renderCardContent(card) {
  const isMcq = card.type === 'mcq' && (card.options || []).length > 1;
  const front = el('frontContent');
  const back = el('backContent');
  const qImages = getCardImageList(card, 'Q');
  const aImages = getCardImageList(card, 'A');
  applySessionCardTheme(card);
  renderSessionTopicPills(card);
  const flashcardEl = el('flashcard');
  if (flashcardEl) {
    flashcardEl.dataset.type = isMcq ? 'mcq' : 'qa';
    flashcardEl.classList.toggle('mcq-mode', isMcq);
  }
  const sessionSection = el('studySessionSection');
  if (sessionSection) sessionSection.classList.toggle('mcq-mode', isMcq);

  let promptHtml = `<div></div><div class="qtxt"></div>`;
  front.innerHTML = promptHtml;
  const qtxtEl = front.querySelector('.qtxt');
  renderRich(qtxtEl, card.prompt, { textAlign: card.questionTextAlign || card.textAlign || 'center' });
  applySessionTextSize(qtxtEl, card.prompt, { hasImage: qImages.length > 0, isMcq });
  appendSessionImages(front, qImages, 'Question image');
  if (isMcq) {
    const opts = card.options || [];
    const optionCount = opts.length;
    const shuffledOptions = opts
      .map((option, originalIndex) => ({ option, originalIndex, sortKey: Math.random() }))
      .sort((a, b) => a.sortKey - b.sortKey);
    const optionsWrap = document.createElement('div');
    optionsWrap.className = 'mcq-options';
    shuffledOptions.forEach(({ option, originalIndex }, renderIndex) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mcq-option';
      btn.dataset.idx = String(originalIndex);
      const keyNumber = renderIndex + 1;
      if (keyNumber <= 9) {
        btn.dataset.key = String(keyNumber);
        const keyHint = document.createElement('span');
        keyHint.className = 'mcq-key-hint';
        keyHint.textContent = String(keyNumber);
        btn.appendChild(keyHint);
      }
      const textEl = document.createElement('span');
      textEl.className = 'mcq-text';
      renderRich(textEl, option.text || '', {
        textAlign: card.optionsTextAlign || 'center'
      });
      applySessionTextSize(textEl, option.text || '', {
        forMcqOption: true,
        optionCount
      });
      btn.appendChild(textEl);
      btn.addEventListener('click', () => {
        btn.classList.toggle('selected');
      });
      optionsWrap.appendChild(btn);
    });
    applyMcqOptionsGridLayout(optionsWrap, optionCount);
    const answerZone = document.createElement('div');
    answerZone.className = 'mcq-answer-zone';
    const checkRow = document.createElement('div');
    checkRow.className = 'mcq-check-row';
    const checkBtn = document.createElement('button');
    checkBtn.className = 'btn mcq-check-btn';
    checkBtn.textContent = 'Check';
    checkBtn.dataset.mode = 'check';
    checkRow.appendChild(checkBtn);
    const separator = document.createElement('div');
    separator.className = 'card-tile-separator';
    answerZone.append(separator, optionsWrap, checkRow);
    front.appendChild(answerZone);

    checkBtn.onclick = async e => {
      e.stopPropagation();
      const buttons = Array.from(optionsWrap.querySelectorAll('.mcq-option'));
      const selected = buttons
        .filter(b => b.classList.contains('selected'))
        .map(b => Number(b.dataset.idx));
      const correctIdx = opts.map((o, i) => o.correct ? i : null).filter(i => i !== null);
      const correctSet = new Set(correctIdx);
      const selectedCorrect = selected.filter(i => correctSet.has(i)).length;
      const selectedWrong = selected.filter(i => !correctSet.has(i)).length;
      const correctCount = correctIdx.length || 0;

      // visual feedback
      buttons.forEach(btn => {
        const optionIdx = Number(btn.dataset.idx);
        btn.classList.remove('correct', 'wrong');
        if (correctSet.has(optionIdx)) btn.classList.add('correct');
        if (btn.classList.contains('selected') && !correctSet.has(optionIdx)) btn.classList.add('wrong');
      });

      let result = 'wrong';
      if (selectedWrong > 0) {
        result = 'wrong';
      } else if (selectedCorrect === correctCount && correctCount > 0) {
        result = 'correct';
      } else if (correctCount > 1 && selectedCorrect / correctCount >= 0.5) {
        result = 'partial';
      } else {
        result = 'wrong';
      }

      checkBtn.textContent = 'Next';
      checkBtn.dataset.mode = 'next';
      checkBtn.onclick = ev => {
        ev.stopPropagation();
        checkBtn.textContent = 'Check';
        checkBtn.dataset.mode = 'check';
        // reset option visuals for next card
        buttons.forEach(btn => btn.classList.remove('correct', 'wrong', 'selected'));
        gradeCard(result);
      };
    };
  } else {
    back.innerHTML = `<div></div><div class="atxt"></div>`;
    const atxtEl = back.querySelector('.atxt');
    renderRich(atxtEl, card.answer || '', { textAlign: card.answerTextAlign || card.textAlign || 'center' });
    applySessionTextSize(atxtEl, card.answer || '', {
      hasImage: aImages.length > 0,
      preferLargerBack: true
    });
  }
  appendSessionImages(back, aImages, 'Answer image');
  queueSessionFaceOverflowSync();
}

/**
 * @function syncSessionFaceOverflowState
 * @description Keeps large study card content below the header/pill area and enables downward scrolling.
 */

function syncSessionFaceOverflowState() {
  const flashcard = el('flashcard');
  const isMcq = !!flashcard?.classList.contains('mcq-mode');
  ['frontContent', 'backContent'].forEach(id => {
    const content = el(id);
    if (!content) return;
    if (isMcq) {
      content.classList.remove('is-overflowing');
      content.scrollTop = 0;
      return;
    }
    content.classList.remove('is-overflowing');
    const isOverflowing = content.scrollHeight > (content.clientHeight + 2);
    if (isOverflowing) {
      content.classList.add('is-overflowing');
      content.scrollTop = 0;
    }
  });
}

/**
 * @function queueSessionFaceOverflowSync
 * @description Defers overflow sync by two frames so layout/image updates are reflected before measurement.
 */

function queueSessionFaceOverflowSync() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      syncSessionFaceOverflowState();
    });
  });
}

/**
 * @function getActiveSessionMcqControls
 * @description Returns the currently rendered MCQ controls (options + check button) from the session front face.
 */

function getActiveSessionMcqControls() {
  const front = el('frontContent');
  if (!front) return { optionButtons: [], checkBtn: null };
  const optionButtons = Array.from(front.querySelectorAll('.mcq-options .mcq-option'));
  const checkBtn = front.querySelector('.mcq-check-btn');
  return { optionButtons, checkBtn };
}

/**
 * @function resetSessionFlashcardToFrontInstant
 * @description Resets a flipped study flashcard to front immediately (without flip animation) before rendering next card content.
 */

function resetSessionFlashcardToFrontInstant(flashcard) {
  if (!flashcard) return;
  if (!flashcard.classList.contains('flipped')) return;
  const previousTransition = flashcard.style.transition;
  flashcard.style.transition = 'none';
  flashcard.classList.remove('flipped');
  flashcard.style.transform = '';
  // Force reflow so the browser commits the front-facing state before new content is injected.
  void flashcard.offsetWidth;
  flashcard.style.transition = previousTransition;
}

/**
 * @function renderSessionCard
 * @description Renders the currently active study card with text, media, and mode-specific UI.
 */

async function renderSessionCard() {
  if (!session.active) return;
  const flashcard = el('flashcard');
  if (!flashcard) return;
  resetSessionFlashcardToFrontInstant(flashcard);
  closeStudyImageLightbox();
  flashcard.classList.remove('flipped', 'swiping', 'swipe-correct', 'swipe-wrong', 'swipe-partial');
  flashcard.style.removeProperty('--swipe-intensity');
  flashcard.style.transform = '';
  flashcard.style.transition = '';
  flashcard.style.willChange = '';
  const swipeBadge = el('swipeBadge');
  if (swipeBadge) swipeBadge.textContent = '';
  if (!session.activeQueue.length) {
    session.active = false;
    resetSessionImagePreloadCache();
    syncSidebarHiddenState();
    renderSessionPills();
    await openSessionCompleteDialog();
    if (selectedSubject) {
      // Refresh meta in background so the completion dialog appears immediately.
      void refreshTopicSessionMeta();
    }
    return;
  }
  const card = session.activeQueue[0];
  warmUpcomingSessionCards(2);
  flashcard.classList.remove('flipped');
  renderCardContent(card);
}

/**
 * @function getSessionCardMasteryTarget
 * @description Returns the session card mastery target.
 */

function getSessionCardMasteryTarget(card) {
  if (session.mode === 'daily-review' && card?.reviewCarryOver === true && card?.reviewDowngraded !== true) {
    return 1;
  }
  return 3;
}

/**
 * @function gradeCard
 * @description Applies a grading result, persists progress, and updates the session queue order.
 */

async function gradeCard(result) {
  if (!session.active) return;
  const card = session.activeQueue.shift();
  if (!card) return;
  // Remaining cards that can still appear in this session (mastered cards are excluded).
  const remainingActiveCount = Math.max(0, session.activeQueue.length);
  // Same count including the currently graded card.
  const remainingNonMasteredCount = remainingActiveCount + 1;
  let count = session.counts[card.id] ?? 0;

  if (result === 'correct') count += 1;
  else count = 0;

  if (result !== 'correct' && session.mode === 'daily-review' && card.reviewCarryOver === true) {
    card.reviewCarryOver = false;
    card.reviewDowngraded = true;
  }
  const masteryTarget = getSessionCardMasteryTarget(card);

  session.counts[card.id] = count;
  card.sessionCorrectCount = count;
  await recordCardProgress(card.id, result, { masteryTarget });

  if (result === 'correct' && count >= masteryTarget) {
    session.mastered.push(card);
    delete session.gradeMap[card.id];
  } else if (result === 'wrong') {
    // Red stays relatively near the front, but not at the very end when the queue gets short.
    const target = Math.min(4, Math.max(0, remainingActiveCount - 1));
    session.activeQueue.splice(target, 0, card);
    session.gradeMap[card.id] = result;
  } else if (result === 'partial') {
    // Yellow should always be behind red in the remaining queue.
    const redTarget = Math.min(4, Math.max(0, remainingActiveCount - 1));
    let target = remainingNonMasteredCount - 3;
    if (target < 0 || target > remainingActiveCount || target <= redTarget) {
      target = remainingActiveCount;
    }
    session.activeQueue.splice(target, 0, card);
    session.gradeMap[card.id] = result;
  } else {
    session.activeQueue.push(card); // correct, aber noch nicht mastered
    session.gradeMap[card.id] = result;
  }

  renderSessionPills();
  await renderSessionCard();
  const cardsOverviewSection = el('cardsOverviewSection');
  const overviewVisible = cardsOverviewSection
    ? !cardsOverviewSection.classList.contains('hidden')
    : false;
  if (overviewVisible) void loadDeck();
}

/**
 * @function renderSessionPills
 * @description Renders session pills.
 */

function renderSessionPills() {
  const masteredWrap = el('masteredPills');
  const activeWrap = el('activePills');
  if (!masteredWrap || !activeWrap) return;
  if (!session.active) {
    masteredWrap.innerHTML = '';
    activeWrap.innerHTML = '';
    return;
  }

  const prev = new Map();
  document.querySelectorAll('.pill-dot').forEach(el => {
    prev.set(el.dataset.id, el.getBoundingClientRect());
  });

  masteredWrap.innerHTML = '';
  activeWrap.innerHTML = '';

  session.mastered.forEach(card => {
    const dot = document.createElement('div');
    dot.className = 'pill-dot mastered';
    dot.dataset.id = card.id;
    masteredWrap.appendChild(dot);
  });

  session.activeQueue.forEach((card, idx) => {
    const dot = document.createElement('div');
    dot.className = 'pill-dot';
    dot.dataset.id = card.id;
    if (idx === 0) dot.classList.add('current');
    if (card.reviewCarryOver) dot.classList.add('review-ready');
    const correctCount = session.counts[card.id] ?? card.sessionCorrectCount ?? 0;
    if (correctCount >= 2) dot.classList.add('near-master');
    const grade = session.gradeMap[card.id];
    if (grade) dot.classList.add(grade);
    activeWrap.appendChild(dot);
  });

  requestAnimationFrame(() => {
    document.querySelectorAll('.pill-dot').forEach(el => {
      const prevRect = prev.get(el.dataset.id);
      if (!prevRect) return;
      const nextRect = el.getBoundingClientRect();
      const dx = prevRect.left - nextRect.left;
      const dy = prevRect.top - nextRect.top;
      if (dx || dy) {
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.style.transition = 'transform 0s';
        requestAnimationFrame(() => {
          el.style.transform = '';
          el.style.transition = 'transform 0.3s ease';
        });
      }
    });
  });
}

/**
 * @function wireSwipe
 * @description Wires swipe.
 */

function wireSwipe() {
  const card = el('flashcard');
  if (!card) return;
  const rotateLimit = 15;
  let dragging = false;
  let swipeDecisionPending = false;
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dy = 0;

  /**
   * @function clamp
   * @description Clamps state.
   */

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /**
   * @function swipeBaseTransform
   * @description Handles swipe base transform logic.
   */

  function swipeBaseTransform() {
    return card.classList.contains('flipped') ? ' rotateX(180deg)' : '';
  }

  /**
   * @function setSwipeTransform
   * @description Sets the swipe transform.
   */

  function setSwipeTransform(x = 0, y = 0, rotate = 0) {
    card.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotate}deg)${swipeBaseTransform()}`;
  }

  /**
   * @function clearSwipeFeedback
   * @description Handles clear swipe feedback logic.
   */

  function clearSwipeFeedback() {
    card.classList.remove('swiping', 'swipe-correct', 'swipe-wrong', 'swipe-partial');
    card.style.removeProperty('--swipe-intensity');
    const badge = el('swipeBadge');
    if (badge) badge.textContent = '';
  }

  /**
   * @function resetSwipeDragState
   * @description Resets transient swipe drag styling/state so native scroll can take over.
   */

  function resetSwipeDragState() {
    dragging = false;
    swipeDecisionPending = false;
    card.style.transition = '';
    card.style.willChange = '';
    card.style.transform = '';
    clearSwipeFeedback();
  }

  /**
   * @function applySwipeFeedback
   * @description Applies swipe feedback.
   */

  function applySwipeFeedback(result, intensity) {
    clearSwipeFeedback();
    if (!result || intensity <= 0) return;
    const labels = {
      correct: 'Korrekt',
      wrong: 'Falsch',
      partial: 'Teilweise'
    };
    const cls = {
      correct: 'swipe-correct',
      wrong: 'swipe-wrong',
      partial: 'swipe-partial'
    }[result];
    card.classList.add('swiping', cls);
    card.style.setProperty('--swipe-intensity', String(clamp(intensity, 0, 1)));
    const badge = el('swipeBadge');
    if (badge) badge.textContent = labels[result] || '';
  }

  /**
   * @function getSwipeResult
   * @description Returns the swipe result.
   */

  function getSwipeResult() {
    const xThreshold = Math.max(card.clientWidth * 0.25, 60);
    const yThreshold = Math.max(card.clientHeight * 0.25, 80);
    if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > xThreshold) {
      return dx < 0 ? 'correct' : 'wrong';
    }
    if (dy > yThreshold) return 'partial';
    return null;
  }

  /**
   * @function snapBack
   * @description Handles snap back logic.
   */

  function snapBack() {
    card.style.transition = 'transform 380ms cubic-bezier(0.18, 0.89, 0.32, 1.28)';
    applySwipeFeedback(null, 0);
    requestAnimationFrame(() => setSwipeTransform(0, 0, 0));
    setTimeout(() => {
      card.style.transition = '';
      card.style.willChange = '';
      card.style.transform = '';
      clearSwipeFeedback();
    }, 390);
  }

  /**
   * @function flyOut
   * @description Handles fly out logic.
   */

  function flyOut(result) {
    const width = Math.max(card.clientWidth, 1);
    let outX = dx;
    let outY = dy;
    let outRotate = clamp((dx / width) * rotateLimit, -rotateLimit, rotateLimit);

    if (result === 'correct') {
      outX = -window.innerWidth * 1.15;
      outY = dy * 0.15;
      outRotate = -rotateLimit;
    } else if (result === 'wrong') {
      outX = window.innerWidth * 1.15;
      outY = dy * 0.15;
      outRotate = rotateLimit;
    } else {
      outX = dx * 0.2;
      outY = window.innerHeight * 1.1;
      outRotate = clamp((dx / width) * 8, -8, 8);
    }

    card.style.transition = 'transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1)';
    applySwipeFeedback(result, 1);
    requestAnimationFrame(() => setSwipeTransform(outX, outY, outRotate));
    setTimeout(() => {
      gradeCard(result);
    }, 210);
  }

  card.addEventListener('touchstart', e => {
    if (card.dataset.type === 'mcq' || !session.active) return;
    if (!e.touches[0]) return;
    const startTarget = e.target instanceof Element ? e.target : null;
    const startFace = startTarget ? startTarget.closest('.face') : null;
    const faceCanScroll = !!startFace && (startFace.scrollHeight - startFace.clientHeight > 2);
    dragging = true;
    swipeDecisionPending = faceCanScroll;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dx = 0;
    dy = 0;
    card.style.transition = 'none';
    card.style.willChange = 'transform';
    clearSwipeFeedback();
  }, { passive: true });

  card.addEventListener('touchmove', e => {
    if (!dragging || card.dataset.type === 'mcq') return;
    if (!e.touches[0]) return;
    dx = e.touches[0].clientX - startX;
    dy = e.touches[0].clientY - startY;

    // If content can scroll inside the card face, prefer native vertical scroll
    // and only commit to swipe once horizontal intent is clear.
    if (swipeDecisionPending) {
      const travel = Math.abs(dx) + Math.abs(dy);
      if (travel < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        resetSwipeDragState();
        return;
      }
      swipeDecisionPending = false;
    }

    if (Math.abs(dx) + Math.abs(dy) > 4) e.preventDefault();

    const width = Math.max(card.clientWidth, 1);
    const xThreshold = Math.max(width * 0.25, 60);
    const yThreshold = Math.max(card.clientHeight * 0.25, 80);
    const rotate = clamp((dx / width) * rotateLimit, -rotateLimit, rotateLimit);
    setSwipeTransform(dx, dy, rotate);

    let result = null;
    let intensity = 0;
    if (Math.abs(dx) >= Math.abs(dy)) {
      result = dx <= 0 ? 'correct' : 'wrong';
      intensity = Math.min(Math.abs(dx) / xThreshold, 1);
    } else if (dy > 0) {
      result = 'partial';
      intensity = Math.min(dy / yThreshold, 1);
    }
    applySwipeFeedback(result, intensity);
  }, { passive: false });

  const finishSwipe = () => {
    if (!dragging) return;
    dragging = false;
    swipeDecisionPending = false;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      suppressFlashcardTapUntil = Date.now() + 260;
    }
    const result = getSwipeResult();
    if (result) {
      flyOut(result);
      return;
    }
    snapBack();
  };

  card.addEventListener('touchend', finishSwipe);
  card.addEventListener('touchcancel', finishSwipe);
}

/**
 * @function isStudySessionVisible
 * @description Returns whether study session visible.
 */

function isStudySessionVisible() {
  const section = el('studySessionSection');
  return currentView === 2 && section && !section.classList.contains('hidden');
}

/**
 * @function isCoarsePointerDevice
 * @description Returns whether coarse pointer device.
 */

function isCoarsePointerDevice() {
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

/**
 * @function canOpenSidebarBySwipe
 * @description Returns whether open sidebar by swipe.
 */

function canOpenSidebarBySwipe(target = null) {
  if (!isCoarsePointerDevice()) return false;
  if (document.body.classList.contains('sidebar-open')) return false;
  if (isStudySessionVisible()) return false;
  const element = target instanceof Element ? target : target?.parentElement;
  if (element && element.closest('input, textarea, select, [contenteditable="true"], dialog[open], .flashcard')) {
    return false;
  }
  return true;
}

/**
 * @function wireSidebarSwipeGesture
 * @description Wires sidebar swipe gesture.
 */

function wireSidebarSwipeGesture() {
  const edgeZone = 200;
  const openThreshold = 68;
  const verticalCancelThreshold = 28;
  let tracking = false;
  let startX = 0;
  let startY = 0;

  const resetTracking = () => {
    tracking = false;
    startX = 0;
    startY = 0;
  };

  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    if (!touch || touch.clientX > edgeZone) return;
    if (!canOpenSidebarBySwipe(e.target)) return;
    tracking = true;
    startX = touch.clientX;
    startY = touch.clientY;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (!tracking) return;
    const touch = e.touches[0];
    if (!touch) {
      resetTracking();
      return;
    }
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    if (Math.abs(dy) > verticalCancelThreshold && Math.abs(dy) > Math.abs(dx)) {
      resetTracking();
      return;
    }
    if (dx > 0 && Math.abs(dx) > Math.abs(dy)) e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', e => {
    if (!tracking) return;
    const touch = e.changedTouches?.[0];
    const dx = touch ? touch.clientX - startX : 0;
    const dy = touch ? touch.clientY - startY : 0;
    const horizontalSwipe = dx > 0 && Math.abs(dx) > Math.abs(dy);
    if (horizontalSwipe && dx >= openThreshold && canOpenSidebarBySwipe()) {
      document.body.classList.add('sidebar-open');
      triggerHaptic('light');
    }
    resetTracking();
  }, { passive: true });

  document.addEventListener('touchcancel', resetTracking, { passive: true });
}

// ============================================================================
// Settings, Import/Export, and Management Dialogs
// ============================================================================
/**
* @function openSubjectDialog
 * @description Opens the subject dialog.
 */

function openSubjectDialog() {
  el('subjectNameInput').value = '';
  el('subjectAccentPicker').value = '#2dd4bf';
  el('subjectAccentText').value = '#2dd4bf';
  showDialog(el('subjectDialog'));
}

/**
 * @function addSubjectFromDialog
 * @description Reads subject form values, creates the subject, and refreshes the sidebar.
 */

async function addSubjectFromDialog() {
  const name = el('subjectNameInput').value.trim();
  if (!name) return;
  const accent = el('subjectAccentText').value.trim() || '#2dd4bf';
  const subject = buildSubjectRecord({ id: uid(), name, accent });
  await put('subjects', subject);
  closeDialog(el('subjectDialog'));
  refreshSidebar();
}

/**
 * @function exportJSON
 * @description Exports JSON.
 */

async function exportJSON() {
  const subjects = await getAll('subjects');
  const topics = await getAll('topics');
  const cards = await getAll('cards');
  const subjectMap = Object.fromEntries(subjects.map(s => [s.id, s]));
  const topicMap = Object.fromEntries(topics.map(t => [t.id, t]));
  const payload = {
    subjects,
    topics: topics.map(t => ({
      ...t,
      subjectName: subjectMap[t.subjectId]?.name || ''
    })),
    cards: cards.map(c => ({
      ...c,
      topicName: topicMap[c.topicId]?.name || '',
      subjectName: subjectMap[topicMap[c.topicId]?.subjectId]?.name || ''
    })),
    progress: await getAll('progress')
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'flashcards-export.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * @function exportCSV
 * @description Exports CSV.
 */

async function exportCSV() {
  const subjects = await getAll('subjects');
  const topics = await getAll('topics');
  const cards = await getAll('cards');
  const subjectMap = Object.fromEntries(subjects.map(s => [s.id, s]));
  const topicMap = Object.fromEntries(topics.map(t => [t.id, t]));
  const lines = ['id,topicId,topicName,subjectName,type,prompt,answer,options'];
  cards.forEach(c => {
    const options = c.options ? JSON.stringify(c.options).replaceAll('"', '""') : '';
    const esc = s => `"${String(s || '').replaceAll('"', '""')}"`;
    const topic = topicMap[c.topicId];
    const subject = topic ? subjectMap[topic.subjectId] : null;
    lines.push([
      c.id,
      c.topicId,
      esc(topic?.name || ''),
      esc(subject?.name || ''),
      c.type,
      esc(c.prompt),
      esc(c.answer),
      esc(options)
    ].join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'flashcards-cards.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * @function importJSON
 * @description Imports JSON.
 */

async function importJSON(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  for (const s of ['subjects', 'topics', 'cards', 'progress']) {
    for (const row of (data[s] || [])) {
      if (s === 'cards') {
        const cardId = String(row?.id || '').trim() || uid();
        const migratedImagePayload = await buildCardImagePayloadForSave(
          cardId,
          getCardImageList(row, 'Q'),
          getCardImageList(row, 'A')
        );
        const nextCard = {
          ...row,
          id: cardId,
          ...migratedImagePayload
        };
        await put('cards', nextCard);
        await putCardBank(nextCard);
      } else {
        await put(s, row);
      }
    }
  }
  progressByCardId = new Map();
  alert('Imported successfully.');
  refreshSidebar();
  if (selectedSubject) loadTopics();
  if (selectedTopic) loadDeck();
}

// ============================================================================
// Bootstrap + Event Wiring
// ============================================================================
/**
* @function boot
 * @description Initializes app state, wires UI events, and loads initial data for the first screen.
 */

async function boot() {
  void registerOfflineServiceWorker();
  let backendReachable = false;
  try {
    backendReachable = await openDB();
    await openCardBankDB();
    await preloadTopicDirectory({ force: true });
  } catch (err) {
    alert(err.message || 'Unable to connect to Supabase backend.');
    return;
  }
  if (!backendReachable) {
    console.info('Backend not reachable. Running with offline cache and queued local changes.');
  }
  wireNoZoomGuards();
  wireSwipe();
  wireHapticFeedback();
  wireSidebarSwipeGesture();
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!appLoadingDebugPinned) return;
    e.preventDefault();
    e.stopPropagation();
    closeDebugLoadingOverlay();
  });
  window.addEventListener('online', () => { void openDB(); });

  el('homeBtn').onclick = () => {
    setView(0);
    document.body.classList.remove('sidebar-open');
    void refreshDailyReviewHomePanel({ useExisting: false });
  };
  el('settingsBtn').onclick = () => document.getElementById('settingsDialog').showModal();
  const closeSettingsBtn = el('closeSettingsBtn');
  if (closeSettingsBtn) closeSettingsBtn.onclick = () => closeDialog(el('settingsDialog'));
  const quickAddSubjectBtn = el('quickAddSubject');
  if (quickAddSubjectBtn) quickAddSubjectBtn.onclick = openSubjectDialog;
  el('addSubjectBtn').onclick = openSubjectDialog;
  const quickExportBtn = el('quickExport');
  if (quickExportBtn) quickExportBtn.onclick = exportJSON;
  const exportJsonBtn = el('exportJsonBtn');
  if (exportJsonBtn) exportJsonBtn.onclick = exportJSON;
  const exportCsvBtn = el('exportCsvBtn');
  if (exportCsvBtn) exportCsvBtn.onclick = exportCSV;
  const importInput = el('importInput');
  if (importInput) {
    importInput.addEventListener('change', e => {
      const file = e.target?.files?.[0];
      if (file) importJSON(file);
      importInput.value = '';
    });
  }
  const openProgressCheckBtn = el('openProgressCheckBtn');
  if (openProgressCheckBtn) openProgressCheckBtn.onclick = openProgressCheckDialog;
  const openProgressCheckFromSettingsBtn = el('openProgressCheckFromSettingsBtn');
  if (openProgressCheckFromSettingsBtn) {
    openProgressCheckFromSettingsBtn.onclick = async () => {
      const settingsDialog = el('settingsDialog');
      if (settingsDialog?.open) closeDialog(settingsDialog);
      await openProgressCheckDialog();
    };
  }
  const startBtn = el('startSessionBtn');
  if (startBtn) startBtn.onclick = startSession;
  const openSessionFilterBtn = el('openSessionFilterBtn');
  if (openSessionFilterBtn) {
    openSessionFilterBtn.onclick = () => {
      fillSessionFilterDialogFromState();
      showDialog(el('sessionFilterDialog'));
    };
  }

  const sessionFilterDialog = el('sessionFilterDialog');
  if (sessionFilterDialog) {
    sessionFilterDialog.addEventListener('click', e => {
      if (e.target === sessionFilterDialog) closeDialog(sessionFilterDialog);
    });
  }
  const sessionFilterAll = el('sessionFilterAll');
  const sessionFilterCorrect = el('sessionFilterCorrect');
  const sessionFilterWrong = el('sessionFilterWrong');
  const sessionFilterPartial = el('sessionFilterPartial');
  const sessionFilterNotAnswered = el('sessionFilterNotAnswered');
  const sessionFilterNotAnsweredYet = el('sessionFilterNotAnsweredYet');
  if (sessionFilterAll) {
    sessionFilterAll.addEventListener('change', () => {
      if (sessionFilterAll.checked) {
        if (sessionFilterCorrect) sessionFilterCorrect.checked = false;
        if (sessionFilterWrong) sessionFilterWrong.checked = false;
        if (sessionFilterPartial) sessionFilterPartial.checked = false;
        if (sessionFilterNotAnswered) sessionFilterNotAnswered.checked = false;
        if (sessionFilterNotAnsweredYet) sessionFilterNotAnsweredYet.checked = false;
      }
      syncSessionFilterDialogControls();
    });
  }
  [sessionFilterCorrect, sessionFilterWrong, sessionFilterPartial, sessionFilterNotAnswered, sessionFilterNotAnsweredYet].forEach(input => {
    if (!input) return;
    input.addEventListener('change', () => {
      if (input.checked && sessionFilterAll) sessionFilterAll.checked = false;
      syncSessionFilterDialogControls();
    });
  });
  const closeSessionFilterBtn = el('closeSessionFilterBtn');
  if (closeSessionFilterBtn) {
    closeSessionFilterBtn.onclick = () => closeDialog(el('sessionFilterDialog'));
  }
  const saveSessionFilterBtn = el('saveSessionFilterBtn');
  if (saveSessionFilterBtn) {
    saveSessionFilterBtn.onclick = async () => {
      const next = pullSessionFiltersFromDialog();
      await setSessionFilterState(next, { refresh: true });
      closeDialog(el('sessionFilterDialog'));
    };
  }

  const sessionCompleteDialog = el('sessionCompleteDialog');
  if (sessionCompleteDialog) {
    sessionCompleteDialog.addEventListener('click', e => {
      if (e.target === sessionCompleteDialog) dismissSessionCompleteDialog();
    });
    sessionCompleteDialog.addEventListener('close', () => {
      if (sessionCompleteConfettiEmitter && typeof sessionCompleteConfettiEmitter.reset === 'function') {
        sessionCompleteConfettiEmitter.reset();
      }
    });
    sessionCompleteDialog.addEventListener('cancel', e => {
      e.preventDefault();
      dismissSessionCompleteDialog();
    });
  }
  const closeSessionCompleteBtn = el('closeSessionCompleteBtn');
  if (closeSessionCompleteBtn) {
    closeSessionCompleteBtn.onclick = () => dismissSessionCompleteDialog();
  }
  const sessionRepeatMinus = el('sessionRepeatMinus');
  if (sessionRepeatMinus) {
    sessionRepeatMinus.onclick = () => {
      if (sessionRepeatState.remaining <= 0) return;
      sessionRepeatState.size = Math.max(1, sessionRepeatState.size - 1);
      updateSessionRepeatCounter();
    };
  }
  const sessionRepeatPlus = el('sessionRepeatPlus');
  if (sessionRepeatPlus) {
    sessionRepeatPlus.onclick = () => {
      if (sessionRepeatState.remaining <= 0) return;
      sessionRepeatState.size = Math.min(sessionRepeatState.remaining, sessionRepeatState.size + 1);
      updateSessionRepeatCounter();
    };
  }
  const startAnotherSessionBtn = el('startAnotherSessionBtn');
  if (startAnotherSessionBtn) {
    startAnotherSessionBtn.onclick = async () => {
      if (sessionRepeatState.remaining <= 0) {
        dismissSessionCompleteDialog();
        return;
      }
      const forcedSize = Math.min(Math.max(sessionRepeatState.size, 1), sessionRepeatState.remaining);
      closeDialog(el('sessionCompleteDialog'));
      await startSession({
        topicIds: [...sessionRepeatState.topicIds],
        cardIds: [...sessionRepeatState.cardIds],
        filters: { ...sessionRepeatState.filters },
        forcedSize,
        reviewMode: sessionRepeatState.mode === 'daily-review'
      });
    };
  }

  const startDailyReviewBtn = el('startDailyReviewBtn');
  if (startDailyReviewBtn) startDailyReviewBtn.onclick = startDailyReviewFromHomePanel;
  const debugLoaderBtn = el('debugLoaderBtn');
  if (debugLoaderBtn) debugLoaderBtn.onclick = openDebugLoadingOverlay;
  const dailyReviewFilterIds = ['dailyReviewFilterGreen', 'dailyReviewFilterYellow', 'dailyReviewFilterRed'];
  dailyReviewFilterIds.forEach(filterId => {
    const input = el(filterId);
    if (!input) return;
    input.addEventListener('change', () => {
      dailyReviewState.statusFilter = pullDailyReviewStatusFilterFromControls();
      syncDailyReviewDateKeysFromStatus();
      renderDailyReviewDateSlider();
      renderDailyReviewFilterSummary();
      renderDailyReviewTopicList();
    });
  });
  const dailyReviewDateStart = el('dailyReviewDateStart');
  const dailyReviewDateEnd = el('dailyReviewDateEnd');
  const commitDailyReviewDateFromActiveHandle = () => {
    const sliderWrap = el('dailyReviewDateSliderWrap');
    if (!sliderWrap) return;
    const isStartActive = sliderWrap.classList.contains('active-start');
    const isEndActive = sliderWrap.classList.contains('active-end');
    if (!isStartActive && !isEndActive) return;
    applyDailyReviewDateRangeFromControls(isEndActive ? 'end' : 'start');
    setDailyReviewActiveRangeHandle('');
  };
  if (dailyReviewDateStart) {
    const commitStart = () => applyDailyReviewDateRangeFromControls('start');
    const activateStart = () => setDailyReviewActiveRangeHandle('start');
    dailyReviewDateStart.addEventListener('pointerdown', activateStart);
    dailyReviewDateStart.addEventListener('mousedown', activateStart);
    dailyReviewDateStart.addEventListener('touchstart', activateStart, { passive: true });
    dailyReviewDateStart.addEventListener('focus', activateStart);
    dailyReviewDateStart.addEventListener('input', () => applyDailyReviewDateRangeFromControls('start', { preview: true }));
    dailyReviewDateStart.addEventListener('change', commitStart);
    dailyReviewDateStart.addEventListener('mouseup', commitStart);
    dailyReviewDateStart.addEventListener('touchend', commitStart);
    dailyReviewDateStart.addEventListener('blur', commitStart);
  }
  if (dailyReviewDateEnd) {
    const commitEnd = () => applyDailyReviewDateRangeFromControls('end');
    const activateEnd = () => setDailyReviewActiveRangeHandle('end');
    dailyReviewDateEnd.addEventListener('pointerdown', activateEnd);
    dailyReviewDateEnd.addEventListener('mousedown', activateEnd);
    dailyReviewDateEnd.addEventListener('touchstart', activateEnd, { passive: true });
    dailyReviewDateEnd.addEventListener('focus', activateEnd);
    dailyReviewDateEnd.addEventListener('input', () => applyDailyReviewDateRangeFromControls('end', { preview: true }));
    dailyReviewDateEnd.addEventListener('change', commitEnd);
    dailyReviewDateEnd.addEventListener('mouseup', commitEnd);
    dailyReviewDateEnd.addEventListener('touchend', commitEnd);
    dailyReviewDateEnd.addEventListener('blur', commitEnd);
  }
  document.addEventListener('pointerup', commitDailyReviewDateFromActiveHandle);
  document.addEventListener('pointercancel', commitDailyReviewDateFromActiveHandle);
  const dailyReviewMinus = el('dailyReviewMinus');
  if (dailyReviewMinus) {
    dailyReviewMinus.onclick = () => {
      const selectedCount = getDailyReviewSelectedCardIds().length;
      if (selectedCount <= 0) return;
      dailyReviewState.size = Math.max(1, dailyReviewState.size - 1);
      updateDailyReviewSizeCounter();
    };
  }
  const dailyReviewPlus = el('dailyReviewPlus');
  if (dailyReviewPlus) {
    dailyReviewPlus.onclick = () => {
      const selectedCount = getDailyReviewSelectedCardIds().length;
      if (selectedCount <= 0) return;
      dailyReviewState.size = Math.min(selectedCount, dailyReviewState.size + 1);
      updateDailyReviewSizeCounter();
    };
  }
  renderSessionFilterSummary();

  el('backToTopicsBtn').onclick = async () => {
    setDeckSelectionMode(false);

    await preloadTopicDirectory({ force: true });
    await loadTopics();

    console.log('Back to topics loaded (counts refreshed)');

    if (selectedSubject) refreshTopicSessionMeta();
    setView(1);
  };
  el('backToTopicsBtnSession').onclick = () => {
    closeStudyImageLightbox();
    setDeckSelectionMode(false);
    session.active = false;
    el('cardsOverviewSection').classList.remove('hidden');
    el('studySessionSection')?.classList.add('hidden');
    renderSessionPills();
    if (selectedSubject) refreshTopicSessionMeta();
    const returnToHome = session.mode === 'daily-review';
    setView(returnToHome ? 0 : 1);
    if (returnToHome) void refreshDailyReviewHomePanel({ useExisting: false });
  };
  el('backToDeckBtn').onclick = () => setView(2);
  const flashcardEl = el('flashcard');
  if (flashcardEl) {
    const canFlipSessionFlashcard = (eventTarget = null, opts = {}) => {
      const options = opts && typeof opts === 'object' ? opts : {};
      const allowButtonTarget = !!options.allowButtonTarget;
      if (!session.active || !isStudySessionVisible()) return false;
      if (document.body.classList.contains('session-image-open')) return false;
      if (document.querySelector('dialog[open]')) return false;
      if (Date.now() < suppressFlashcardTapUntil) return false;
      if (flashcardEl.classList.contains('swiping')) return false;
      if (flashcardEl.dataset.type === 'mcq') return false;
      if (hasActiveTextSelection()) return false;
      const target = eventTarget instanceof Element ? eventTarget : null;
      if (target && target.closest('.card-edit-btn, input, textarea, select, [contenteditable="true"]')) {
        return false;
      }
      if (!allowButtonTarget && target && target.closest('button')) return false;
      return true;
    };
    const flipSessionFlashcard = () => {
      flashcardEl.classList.toggle('flipped');
    };

    flashcardEl.onclick = e => {
      if (!canFlipSessionFlashcard(e.target)) return;
      flipSessionFlashcard();
    };

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeStudyImageLightbox();
      const target = e.target instanceof Element ? e.target : null;
      const editingTarget = target && target.closest('input, textarea, select, [contenteditable="true"]');
      const isSessionShortcutContext = (
        !editingTarget
        && !hasActiveTextSelection()
        && session.active
        && isStudySessionVisible()
        && !document.body.classList.contains('session-image-open')
        && !document.querySelector('dialog[open]')
      );
      const isMcqSessionCard = isSessionShortcutContext && flashcardEl.dataset.type === 'mcq';

      if (
        isMcqSessionCard &&
        !e.repeat &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        const isEnter = (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') && !e.shiftKey;
        if (isEnter) {
          const { checkBtn } = getActiveSessionMcqControls();
          if (checkBtn) {
            e.preventDefault();
            checkBtn.click();
            return;
          }
        }
        if (!e.shiftKey) {
          let optionNumber = 0;
          if (/^Digit[1-9]$/.test(e.code)) optionNumber = Number(e.code.slice(5));
          else if (/^Numpad[1-9]$/.test(e.code)) optionNumber = Number(e.code.slice(6));
          else if (/^[1-9]$/.test(e.key)) optionNumber = Number(e.key);
          if (optionNumber > 0) {
            const { optionButtons, checkBtn } = getActiveSessionMcqControls();
            const checkMode = String(checkBtn?.dataset?.mode || checkBtn?.textContent || '').trim().toLowerCase();
            if (checkMode.startsWith('check')) {
              const optionBtn = optionButtons[optionNumber - 1] || null;
              if (optionBtn) {
                e.preventDefault();
                optionBtn.click();
                return;
              }
            }
          }
        }
      }

      const gradeByCode = {
        Digit1: 'correct',
        Numpad1: 'correct',
        Digit2: 'partial',
        Numpad2: 'partial',
        Digit3: 'wrong',
        Numpad3: 'wrong'
      };
      const gradeFromCode = gradeByCode[e.code] || null;
      const gradeFromKey = e.key === '1' ? 'correct' : e.key === '2' ? 'partial' : e.key === '3' ? 'wrong' : null;
      const gradeResult = gradeFromCode || gradeFromKey;
      if (
        gradeResult &&
        !e.repeat &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        isSessionShortcutContext &&
        !isMcqSessionCard
      ) {
        e.preventDefault();
        gradeCard(gradeResult);
        return;
      }
      const isShiftBackspace = (e.code === 'Backspace' || e.key === 'Backspace')
        && e.shiftKey
        && !e.repeat
        && !e.metaKey
        && !e.ctrlKey
        && !e.altKey;
      if (
        isShiftBackspace &&
        isSessionShortcutContext
      ) {
        e.preventDefault();
        el('editSessionCardBtn')?.click();
        return;
      }
      const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar' || e.code === 'Numpad0';
      if (!isSpace || e.repeat) return;
      if (!canFlipSessionFlashcard(e.target, { allowButtonTarget: true })) return;
      e.preventDefault();
      flipSessionFlashcard();
    });
    document.addEventListener('keyup', e => {
      const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar' || e.code === 'Numpad0';
      if (!isSpace) return;
      if (!canFlipSessionFlashcard(e.target, { allowButtonTarget: true })) return;
      e.preventDefault();
    });
  }
  const editBtn = el('editSessionCardBtn');
  if (editBtn) {
    editBtn.onclick = () => {
      if (!session.active) return;
      const card = session.activeQueue[0];
      if (!card) return;
      openEditDialog(card);
    };
  }
  const editBtnBack = el('editSessionCardBtnBack');
  if (editBtnBack && editBtn) editBtnBack.onclick = () => editBtn.click();
  const editDialog = el('editCardDialog');
  if (editDialog) {
    editDialog.addEventListener('click', e => {
      if (e.target === editDialog) editDialog.close();
    });
    editDialog.addEventListener('close', () => {
      editingCardId = null;
      editingCardSnapshot = null;
    });
  }
  const cardPreviewDialog = el('cardPreviewDialog');
  const closeCardPreviewBtn = el('closeCardPreviewBtn');
  const previewFlashcardEl = el('previewFlashcard');
  if (closeCardPreviewBtn && cardPreviewDialog) {
    closeCardPreviewBtn.onclick = () => closeDialog(cardPreviewDialog);
  }
  if (cardPreviewDialog) {
    cardPreviewDialog.addEventListener('click', e => {
      if (e.target === cardPreviewDialog) closeDialog(cardPreviewDialog);
    });
    cardPreviewDialog.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDialog(cardPreviewDialog);
        return;
      }
      const isSpace = e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
      if (!isSpace || e.repeat) return;
      if (!canFlipPreviewFlashcard(e.target, { allowButtonTarget: true })) return;
      e.preventDefault();
      flipPreviewFlashcard();
    });
  }
  if (previewFlashcardEl) {
    previewFlashcardEl.addEventListener('click', e => {
      if (!canFlipPreviewFlashcard(e.target)) return;
      flipPreviewFlashcard();
    });
  }

  const sessionImageLightbox = el('sessionImageLightbox');
  const sessionImageLightboxImg = el('sessionImageLightboxImg');
  if (sessionImageLightbox) {
    sessionImageLightbox.addEventListener('click', e => {
      if (e.target !== sessionImageLightbox) return;
      closeStudyImageLightbox();
    });
  }
  if (sessionImageLightboxImg) {
    sessionImageLightboxImg.addEventListener('click', handleStudyImageLightboxImageClick);
    sessionImageLightboxImg.addEventListener('touchstart', handleStudyImageLightboxTouchStart, { passive: false });
    sessionImageLightboxImg.addEventListener('touchmove', handleStudyImageLightboxTouchMove, { passive: false });
    sessionImageLightboxImg.addEventListener('touchend', handleStudyImageLightboxTouchEnd, { passive: false });
    sessionImageLightboxImg.addEventListener('touchcancel', handleStudyImageLightboxTouchEnd, { passive: false });
    sessionImageLightboxImg.addEventListener('wheel', handleStudyImageLightboxWheel, { passive: false });
  }

  const moveCardsDialog = el('moveCardsDialog');
  if (moveCardsDialog) {
    moveCardsDialog.addEventListener('click', e => {
      if (e.target === moveCardsDialog) closeDialog(moveCardsDialog);
    });
  }

  const toggleCardSelectBtn = el('toggleCardSelectBtn');
  if (toggleCardSelectBtn) {
    toggleCardSelectBtn.onclick = () => {
      setDeckSelectionMode(!deckSelectionMode);
      loadDeck();
    };
  }
  const cancelCardSelectionBtn = el('cancelCardSelectionBtn');
  if (cancelCardSelectionBtn) {
    cancelCardSelectionBtn.onclick = () => {
      setDeckSelectionMode(false);
      loadDeck();
    };
  }
  const deleteSelectedCardsBtn = el('deleteSelectedCardsBtn');
  if (deleteSelectedCardsBtn) deleteSelectedCardsBtn.onclick = deleteSelectedDeckCards;
  const moveSelectedCardsBtn = el('moveSelectedCardsBtn');
  if (moveSelectedCardsBtn) moveSelectedCardsBtn.onclick = openMoveCardsDialog;

  const moveCardsSubjectSelect = el('moveCardsSubjectSelect');
  if (moveCardsSubjectSelect) {
    moveCardsSubjectSelect.addEventListener('change', () => populateMoveTopics(moveCardsSubjectSelect.value));
  }
  const confirmMoveCardsBtn = el('confirmMoveCardsBtn');
  if (confirmMoveCardsBtn) confirmMoveCardsBtn.onclick = moveSelectedDeckCards;
  const cancelMoveCardsBtn = el('cancelMoveCardsBtn');
  if (cancelMoveCardsBtn) cancelMoveCardsBtn.onclick = () => closeDialog(el('moveCardsDialog'));
  updateDeckSelectionUi();

  const moveTopicsDialog = el('moveTopicsDialog');
  if (moveTopicsDialog) {
    moveTopicsDialog.addEventListener('click', e => {
      if (e.target === moveTopicsDialog) closeDialog(moveTopicsDialog);
    });
  }
  const progressCheckDialog = el('progressCheckDialog');
  if (progressCheckDialog) {
    progressCheckDialog.addEventListener('click', e => {
      if (e.target === progressCheckDialog) {
        closeProgressCheckHeaderMenu();
        closeDialog(progressCheckDialog);
      }
    });
  }
  const closeProgressCheckBtn = el('closeProgressCheckBtn');
  if (closeProgressCheckBtn) {
    closeProgressCheckBtn.onclick = () => {
      closeProgressCheckHeaderMenu();
      closeDialog(el('progressCheckDialog'));
    };
  }
  const refreshProgressCheckBtn = el('refreshProgressCheckBtn');
  if (refreshProgressCheckBtn) {
    refreshProgressCheckBtn.onclick = async () => {
      await renderProgressCheckTable();
      if (progressCheckHeaderMenuState.column) renderProgressCheckHeaderMenu();
    };
  }
  wireProgressCheckHeaderMenus();
  const topicSearchDialog = el('topicSearchDialog');
  if (topicSearchDialog) {
    topicSearchDialog.addEventListener('click', e => {
      if (e.target === topicSearchDialog) closeDialog(topicSearchDialog);
    });
  }
  const toggleTopicSelectBtn = el('toggleTopicSelectBtn');
  if (toggleTopicSelectBtn) {
    toggleTopicSelectBtn.onclick = () => {
      setTopicSelectionMode(!topicSelectionMode);
      loadTopics();
    };
  }
  const openTopicSearchBtn = el('openTopicSearchBtn');
  if (openTopicSearchBtn) openTopicSearchBtn.onclick = openTopicSearchModal;
  const closeTopicSearchBtn = el('closeTopicSearchBtn');
  if (closeTopicSearchBtn) closeTopicSearchBtn.onclick = () => closeDialog(el('topicSearchDialog'));
  const runTopicSearchBtn = el('runTopicSearchBtn');
  if (runTopicSearchBtn) runTopicSearchBtn.onclick = runTopicSearch;
  const topicSearchInput = el('topicSearchInput');
  if (topicSearchInput) {
    topicSearchInput.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      runTopicSearch();
    });
  }
  const cancelTopicSelectionBtn = el('cancelTopicSelectionBtn');
  if (cancelTopicSelectionBtn) {
    cancelTopicSelectionBtn.onclick = () => {
      setTopicSelectionMode(false);
      loadTopics();
    };
  }
  const deleteSelectedTopicsBtn = el('deleteSelectedTopicsBtn');
  if (deleteSelectedTopicsBtn) deleteSelectedTopicsBtn.onclick = deleteSelectedTopics;
  const moveSelectedTopicsBtn = el('moveSelectedTopicsBtn');
  if (moveSelectedTopicsBtn) moveSelectedTopicsBtn.onclick = openMoveTopicsDialog;
  const confirmMoveTopicsBtn = el('confirmMoveTopicsBtn');
  if (confirmMoveTopicsBtn) confirmMoveTopicsBtn.onclick = moveSelectedTopics;
  const cancelMoveTopicsBtn = el('cancelMoveTopicsBtn');
  if (cancelMoveTopicsBtn) cancelMoveTopicsBtn.onclick = () => closeDialog(el('moveTopicsDialog'));
  updateTopicSelectionUi();

  const sidebar = document.querySelector('.sidebar');
  const sidebarToggle = el('sidebarToggle');
  const sidebarToggleHome = el('sidebarToggleHome');
  const sidebarToggleButtons = [sidebarToggle, sidebarToggleHome].filter(Boolean);
  const sidebarOverlay = el('sidebarOverlay');
  sidebarToggleButtons.forEach(toggleBtn => {
    toggleBtn.onclick = () => document.body.classList.toggle('sidebar-open');
  });
  if (sidebarOverlay) {
    sidebarOverlay.onclick = () => document.body.classList.remove('sidebar-open');
  }
  document.addEventListener('click', e => {
    if (!document.body.classList.contains('sidebar-open')) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (sidebarToggleButtons.some(toggleBtn => toggleBtn.contains(target))) return;
    if (sidebar && sidebar.contains(target)) return;
    document.body.classList.remove('sidebar-open');
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) document.body.classList.remove('sidebar-open');
  });

  const editorShell = document.querySelector('#editorPanel .editor-shell');
  const editorOverlay = el('editorOverlay');
  const toggleSidebarBtn = el('toggleEditorSidebarBtn');
  if (toggleSidebarBtn && editorShell) {
    toggleSidebarBtn.onclick = () => editorShell.classList.toggle('sidebar-open');
  }
  if (editorOverlay && editorShell) {
    editorOverlay.onclick = () => editorShell.classList.remove('sidebar-open');
  }
  window.addEventListener('resize', () => {
    if (window.innerWidth > 980 && editorShell) editorShell.classList.remove('sidebar-open');
    if (currentView !== 3 && editorShell) editorShell.classList.remove('sidebar-open');
  });
  window.addEventListener('resize', queueSessionFaceOverflowSync);
  window.addEventListener('resize', scheduleOverviewTableFit);
  el('closeEditCardBtn').onclick = () => {
    editingCardId = null;
    editingCardSnapshot = null;
    el('editCardDialog').close();
  };
  el('editAddMcqOptionBtn').onclick = () => {
    setMcqModeState(true, true);
    addEditMcqRow();
    syncMcqPrimaryAnswerMode(true);
  };
  el('openCreateCardBtn').onclick = openCreateCardEditor;
  el('addMcqOptionBtn').onclick = () => {
    setMcqModeState(false, true);
    addMcqRow();
    syncMcqPrimaryAnswerMode(false);
  };
  attachAutoClose(el('cardPrompt'));
  attachAutoClose(el('cardAnswer'));
  attachAutoClose(el('editCardPrompt'));
  attachAutoClose(el('editCardAnswer'));
  [el('cardAnswer'), el('editCardAnswer')].forEach(input => {
    if (!(input instanceof HTMLTextAreaElement)) return;
    input.addEventListener('keydown', handlePrimaryMcqAnswerKeydown);
    input.addEventListener('input', () => enforcePrimaryMcqAnswerSingleLine(input));
  });
  ['dragover', 'drop'].forEach(evt => {
    document.addEventListener(evt, e => {
      e.preventDefault();
    }, true);
  });
  const plusLikeCode = new Set(['NumpadAdd', 'Equal', 'BracketRight', 'Backslash', 'IntlBackslash']);
  const isAddAnswerShortcut = e => {
    const isPlusLikeKey = e.key === '+' || e.key === '*';
    const isCtrlPlus = e.ctrlKey
      && !e.metaKey
      && !e.altKey
      && (isPlusLikeKey || plusLikeCode.has(e.code));
    return isCtrlPlus;
  };
  const createShortcut = e => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      el('addCardBtn').click();
      return;
    }
    if (isAddAnswerShortcut(e)) {
      e.preventDefault();
      el('addMcqOptionBtn')?.click();
    }
  };
  el('cardPrompt').addEventListener('keydown', createShortcut);
  el('cardAnswer').addEventListener('keydown', createShortcut);
  el('mcqOptions')?.addEventListener('keydown', createShortcut);
  el('cardPrompt').addEventListener('input', () => updateCreateValidation());
  el('cardAnswer').addEventListener('input', () => updateCreateValidation());
  wireLivePreview('cardPrompt', 'questionPreview', () => createQuestionTextAlign);
  wireLivePreview('cardAnswer', 'answerPreview', () => createAnswerTextAlign);
  const saveShortcut = e => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      el('saveEditCardBtn').click();
      return;
    }
    if (isAddAnswerShortcut(e)) {
      e.preventDefault();
      el('editAddMcqOptionBtn')?.click();
    }
  };
  el('editCardPrompt').addEventListener('keydown', saveShortcut);
  el('editCardAnswer').addEventListener('keydown', saveShortcut);
  el('editMcqOptions')?.addEventListener('keydown', saveShortcut);
  wireLivePreview('editCardPrompt', 'editQuestionPreview', () => editQuestionTextAlign);
  wireLivePreview('editCardAnswer', 'editAnswerPreview', () => editAnswerTextAlign);
  wireTextFormattingToolbar();
  document.querySelectorAll('.formula-btn').forEach(btn => {
    btn.onclick = () => openFormulaDialog(btn.dataset.formulaTarget);
  });
  const formulaDialog = el('formulaDialog');
  if (formulaDialog) {
    formulaDialog.addEventListener('click', e => {
      if (e.target === formulaDialog) formulaDialog.close();
    });
  }
  const closeFormulaBtn = el('closeFormulaBtn');
  const cancelFormulaBtn = el('cancelFormulaBtn');
  if (closeFormulaBtn) closeFormulaBtn.onclick = () => formulaDialog?.close();
  if (cancelFormulaBtn) cancelFormulaBtn.onclick = () => formulaDialog?.close();
  const formulaInput = el('formulaInput');
  const formulaDisplayToggle = el('formulaDisplayToggle');
  const insertFormulaBtn = el('insertFormulaBtn');
  const debouncedFormulaPreview = debounce(renderFormulaPreview, 300);
  if (formulaInput) formulaInput.addEventListener('input', debouncedFormulaPreview);
  if (formulaDisplayToggle) formulaDisplayToggle.addEventListener('change', renderFormulaPreview);
  if (insertFormulaBtn) insertFormulaBtn.onclick = insertFormulaImage;
  const tableDialog = el('tableDialog');
  if (tableDialog) {
    tableDialog.addEventListener('click', e => {
      if (e.target === tableDialog) closeDialog(tableDialog);
    });
    tableDialog.addEventListener('pointerdown', handleTableBuilderPointerDown);
    tableDialog.addEventListener('input', handleTableBuilderInput);
    tableDialog.addEventListener('focusin', handleTableBuilderSelection);
    tableDialog.addEventListener('click', handleTableBuilderSelection);
    tableDialog.addEventListener('keydown', e => {
      const isShiftEnter = e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
      const isMetaEnter = e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey;
      if (!isShiftEnter && !isMetaEnter) return;
      e.preventDefault();
      insertTableFromDialog();
    });
  }
  const closeTableBtn = el('closeTableBtn');
  const cancelTableBtn = el('cancelTableBtn');
  const insertTableBtn = el('insertTableBtn');
  const tableRowsInput = el('tableRowsInput');
  const tableColsInput = el('tableColsInput');
  const tableHeaderToggle = el('tableHeaderToggle');
  const tableRowsDownBtn = el('tableRowsDownBtn');
  const tableRowsUpBtn = el('tableRowsUpBtn');
  const tableColsDownBtn = el('tableColsDownBtn');
  const tableColsUpBtn = el('tableColsUpBtn');
  const tableBuilderGrid = el('tableBuilderGrid');
  const tableAlignLeftBtn = el('tableAlignLeftBtn');
  const tableAlignCenterBtn = el('tableAlignCenterBtn');
  const tableAlignRightBtn = el('tableAlignRightBtn');
  const tableMergeBtn = el('tableMergeBtn');
  const tableUnmergeBtn = el('tableUnmergeBtn');
  if (closeTableBtn) closeTableBtn.onclick = () => closeDialog(el('tableDialog'));
  if (cancelTableBtn) cancelTableBtn.onclick = () => closeDialog(el('tableDialog'));
  if (insertTableBtn) insertTableBtn.onclick = insertTableFromDialog;
  if (tableRowsInput) tableRowsInput.addEventListener('input', updateTableBuilderFromControls);
  if (tableColsInput) tableColsInput.addEventListener('input', updateTableBuilderFromControls);
  if (tableHeaderToggle) tableHeaderToggle.addEventListener('change', updateTableBuilderFromControls);
  if (tableRowsDownBtn) tableRowsDownBtn.onclick = () => stepTableBuilderSize('rows', -1);
  if (tableRowsUpBtn) tableRowsUpBtn.onclick = () => stepTableBuilderSize('rows', 1);
  if (tableColsDownBtn) tableColsDownBtn.onclick = () => stepTableBuilderSize('cols', -1);
  if (tableColsUpBtn) tableColsUpBtn.onclick = () => stepTableBuilderSize('cols', 1);
  if (tableBuilderGrid) {
    tableBuilderGrid.addEventListener('click', e => {
      const target = e.target;
      if (target instanceof HTMLInputElement && target.classList.contains('table-builder-cell-input')) return;
      clearTableBuilderSelection();
    });
  }
  if (tableAlignLeftBtn) tableAlignLeftBtn.onclick = () => applyTableBuilderSelectedAlignment('left');
  if (tableAlignCenterBtn) tableAlignCenterBtn.onclick = () => applyTableBuilderSelectedAlignment('center');
  if (tableAlignRightBtn) tableAlignRightBtn.onclick = () => applyTableBuilderSelectedAlignment('right');
  if (tableMergeBtn) tableMergeBtn.onclick = mergeTableBuilderSelection;
  if (tableUnmergeBtn) tableUnmergeBtn.onclick = unmergeTableBuilderSelection;
  attachImageDrop(el('cardPrompt'), dataUrls => {
    appendImagesToField(
      el('cardPrompt'),
      el('questionImagePreview'),
      dataUrls,
      'imageDataQ',
      updateCreateValidation
    );
  });
  attachImageDrop(el('questionImagePreview'), dataUrls => {
    appendImagesToField(
      el('cardPrompt'),
      el('questionImagePreview'),
      dataUrls,
      'imageDataQ',
      updateCreateValidation
    );
  });
  attachImagePicker(el('questionImagePreview'), dataUrls => {
    appendImagesToField(
      el('cardPrompt'),
      el('questionImagePreview'),
      dataUrls,
      'imageDataQ',
      updateCreateValidation
    );
  });
  attachImageDrop(el('cardAnswer'), dataUrls => {
    appendImagesToField(
      el('cardAnswer'),
      el('answerImagePreview'),
      dataUrls,
      'imageDataA',
      updateCreateValidation
    );
  });
  attachImageDrop(el('answerImagePreview'), dataUrls => {
    appendImagesToField(
      el('cardAnswer'),
      el('answerImagePreview'),
      dataUrls,
      'imageDataA',
      updateCreateValidation
    );
  });
  attachImagePicker(el('answerImagePreview'), dataUrls => {
    appendImagesToField(
      el('cardAnswer'),
      el('answerImagePreview'),
      dataUrls,
      'imageDataA',
      updateCreateValidation
    );
  });
  attachImageDrop(el('editCardPrompt'), dataUrls => {
    appendImagesToField(el('editCardPrompt'), el('editQuestionImagePreview'), dataUrls, 'imageDataQ');
  });
  attachImageDrop(el('editQuestionImagePreview'), dataUrls => {
    appendImagesToField(el('editCardPrompt'), el('editQuestionImagePreview'), dataUrls, 'imageDataQ');
  });
  attachImagePicker(el('editQuestionImagePreview'), dataUrls => {
    appendImagesToField(el('editCardPrompt'), el('editQuestionImagePreview'), dataUrls, 'imageDataQ');
  });
  attachImageDrop(el('editCardAnswer'), dataUrls => {
    appendImagesToField(el('editCardAnswer'), el('editAnswerImagePreview'), dataUrls, 'imageDataA');
  });
  attachImageDrop(el('editAnswerImagePreview'), dataUrls => {
    appendImagesToField(el('editCardAnswer'), el('editAnswerImagePreview'), dataUrls, 'imageDataA');
  });
  attachImagePicker(el('editAnswerImagePreview'), dataUrls => {
    appendImagesToField(el('editCardAnswer'), el('editAnswerImagePreview'), dataUrls, 'imageDataA');
  });

  el('cancelSubjectBtn').onclick = () => closeDialog(el('subjectDialog'));
  el('createSubjectBtn').onclick = addSubjectFromDialog;
  el('cancelSubjectEditBtn').onclick = () => el('subjectEditDialog').close();
  el('saveSubjectEditBtn').onclick = async () => {
    if (!editingSubjectId) return;
    const name = el('editSubjectName').value.trim();
    const accent = el('editSubjectColor').value || '#2dd4bf';
    if (!name) return;
    const existingSubject = (await getAll('subjects')).find(subject => subject.id === editingSubjectId);
    if (!existingSubject) return;
    const updatedSubject = buildSubjectRecord(existingSubject, { name, accent });
    await put('subjects', updatedSubject);
    if (selectedSubject?.id === editingSubjectId) {
      selectedSubject = { ...selectedSubject, ...updatedSubject };
      applySubjectTheme(accent);
    }
    editingSubjectId = null;
    el('subjectEditDialog').close();
    refreshSidebar();
    if (selectedSubject) loadTopics();
  };
  el('deleteSubjectBtn').onclick = async () => {
    if (!editingSubjectId) return;
    if (!confirm('Delete this subject and all its topics/cards?')) return;
    const id = editingSubjectId;
    editingSubjectId = null;
    el('subjectEditDialog').close();
    await deleteSubjectById(id);
  };

  el('subjectAccentPicker').addEventListener('input', e => {
    el('subjectAccentText').value = e.target.value;
  });
  el('subjectAccentText').addEventListener('input', e => {
    const v = e.target.value.trim();
    if (/^#([0-9a-fA-F]{3}){1,2}$/.test(v)) el('subjectAccentPicker').value = v;
  });
  el('subjectPalette').addEventListener('click', e => {
    const btn = e.target.closest('button[data-color]');
    if (!btn) return;
    const c = btn.dataset.color;
    el('subjectAccentPicker').value = c;
    el('subjectAccentText').value = c;
  });

  // subject accent editing moved to subject edit dialog

  const sessionMinus = el('sessionMinus');
  const sessionPlus = el('sessionPlus');
  const sessionSizeValue = el('sessionSizeValue');
  if (sessionMinus && sessionPlus && sessionSizeValue) {
    const SESSION_PLUS_LONG_PRESS_MS = 420;
    let sessionPlusLongPressTimer = null;
    let sessionPlusDidLongPress = false;

    const clearSessionPlusLongPress = () => {
      if (sessionPlusLongPressTimer !== null) {
        clearTimeout(sessionPlusLongPressTimer);
        sessionPlusLongPressTimer = null;
      }
    };

    const setSessionSizeToMax = () => {
      if (availableSessionCards <= 0) {
        sessionSize = 0;
        renderSessionSizeCounter();
        return;
      }
      const next = Math.max(1, availableSessionCards);
      if (sessionSize !== next) {
        sessionSize = next;
        renderSessionSizeCounter();
      }
    };

    const startSessionPlusLongPress = () => {
      clearSessionPlusLongPress();
      sessionPlusDidLongPress = false;
      sessionPlusLongPressTimer = setTimeout(() => {
        sessionPlusLongPressTimer = null;
        sessionPlusDidLongPress = true;
        setSessionSizeToMax();
      }, SESSION_PLUS_LONG_PRESS_MS);
    };

    sessionMinus.onclick = () => {
      if (availableSessionCards <= 0) {
        sessionSize = 0;
        renderSessionSizeCounter();
        return;
      }
      sessionSize = Math.max(1, sessionSize - 1);
      renderSessionSizeCounter();
    };
    sessionPlus.onclick = () => {
      if (sessionPlusDidLongPress) {
        sessionPlusDidLongPress = false;
        return;
      }
      if (availableSessionCards <= 0) {
        sessionSize = 0;
        renderSessionSizeCounter();
        return;
      }
      sessionSize = Math.min(availableSessionCards, sessionSize + 1);
      renderSessionSizeCounter();
    };
    sessionPlus.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      startSessionPlusLongPress();
    });
    sessionPlus.addEventListener('pointerup', clearSessionPlusLongPress);
    sessionPlus.addEventListener('pointercancel', clearSessionPlusLongPress);
    sessionPlus.addEventListener('pointerleave', clearSessionPlusLongPress);
    sessionPlus.addEventListener('blur', clearSessionPlusLongPress);
    renderSessionSizeCounter();
  }

  const addTopicFromInput = async () => {
    if (!selectedSubject) return alert('Pick a subject first.');
    const name = el('topicName').value.trim();
    if (!name) return;
    await put('topics', { id: uid(), subjectId: selectedSubject.id, name });
    await touchSubject(selectedSubject.id);
    el('topicName').value = '';
    loadTopics();
    refreshSidebar();
  };
  el('addTopicBtn').onclick = addTopicFromInput;
  el('topicName').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addTopicFromInput();
  });

  el('addCardBtn').onclick = async () => {
    if (!selectedTopic) return alert('Pick a topic first.');
    if (!updateCreateValidation(true)) {
      createTouched = true;
      updateCreateValidation(true);
      return;
    }
    const imagesQ = getFieldImageList(el('cardPrompt'), 'imageDataQ');
    const imagesA = getFieldImageList(el('cardAnswer'), 'imageDataA');
    const cardId = uid();
    let imagePayload;
    try {
      imagePayload = await buildCardImagePayloadForSave(cardId, imagesQ, imagesA);
    } catch (err) {
      alert('Image upload failed. Please check your connection and try again.');
      console.warn('Card image upload failed:', err);
      return;
    }
    const options = parseMcqOptions();
    const type = options.length > 1 ? 'mcq' : 'qa';
    const createdAt = new Date().toISOString();
    const card = {
      id: cardId,
      topicId: selectedTopic.id,
      type,
      textAlign: normalizeTextAlign(createQuestionTextAlign),
      questionTextAlign: normalizeTextAlign(createQuestionTextAlign),
      answerTextAlign: normalizeTextAlign(createAnswerTextAlign),
      optionsTextAlign: normalizeTextAlign(createOptionsTextAlign),
      prompt: el('cardPrompt').value,
      answer: el('cardAnswer').value,
      options: type === 'mcq' ? options : [],
      ...imagePayload,
      createdAt,
      meta: { createdAt }
    };
    await put('cards', card);
    applyOptimisticCardCreate(card);
    el('cardPrompt').value = '';
    el('cardAnswer').value = '';
    replaceFieldImages(el('cardPrompt'), el('questionImagePreview'), [], 'imageDataQ', updateCreateValidation);
    replaceFieldImages(el('cardAnswer'), el('answerImagePreview'), [], 'imageDataA', updateCreateValidation);
    const primaryToggle = el('primaryAnswerToggle');
    if (primaryToggle) primaryToggle.checked = true;
    el('mcqOptions').innerHTML = '';
    setMcqModeState(false, false);
    createTouched = false;
    updateCreateValidation();
    applyCreateQuestionTextAlign('center');
    applyCreateAnswerTextAlign('center');
    applyCreateOptionsTextAlign('center');
    void (async () => {
      try {
        await putCardBank(card, { uiBlocking: false });
        if (selectedSubject?.id) await touchSubject(selectedSubject.id, undefined, { uiBlocking: false });
      } catch (err) {
        console.warn('Deferred post-create sync failed:', err);
      } finally {
        try {
          await refreshSidebar({ uiBlocking: false });
          if (selectedTopic?.id === card.topicId) {
            void loadDeck();
            void loadEditorCards();
          }
        } catch (err) {
          console.warn('Deferred post-create refresh failed:', err);
        }
      }
    })();
  };

  el('saveEditCardBtn').onclick = async () => {
    const saveBtn = el('saveEditCardBtn');
    if (!saveBtn || !editingCardId) return;
    if (saveBtn.dataset.busy === '1') return;
    saveBtn.dataset.busy = '1';
    saveBtn.disabled = true;

    const editingId = String(editingCardId || '').trim();
    const snapshot = (editingCardSnapshot && String(editingCardSnapshot?.id || '').trim() === editingId)
      ? cloneData(editingCardSnapshot)
      : null;
    const card = snapshot || await getById('cards', editingId);
    if (!card) {
      saveBtn.dataset.busy = '0';
      saveBtn.disabled = false;
      return;
    }

    const createdAt = card?.meta?.createdAt || card?.createdAt || new Date().toISOString();
    const updatedAt = new Date().toISOString();
    const imagesQ = getFieldImageList(el('editCardPrompt'), 'imageDataQ');
    const imagesA = getFieldImageList(el('editCardAnswer'), 'imageDataA');
    let imagePayload;
    try {
      imagePayload = await buildCardImagePayloadForSave(card.id, imagesQ, imagesA);
    } catch (err) {
      alert('Image upload failed. Please check your connection and try again.');
      console.warn('Card image upload failed:', err);
      saveBtn.dataset.busy = '0';
      saveBtn.disabled = false;
      return;
    }

    const options = parseEditMcqOptions();
    const type = options.length > 1 ? 'mcq' : 'qa';
    const updated = {
      ...card,
      createdAt,
      meta: {
        ...(card.meta || {}),
        createdAt,
        updatedAt
      },
      textAlign: normalizeTextAlign(editQuestionTextAlign),
      questionTextAlign: normalizeTextAlign(editQuestionTextAlign),
      answerTextAlign: normalizeTextAlign(editAnswerTextAlign),
      optionsTextAlign: normalizeTextAlign(editOptionsTextAlign),
      prompt: el('editCardPrompt').value,
      answer: el('editCardAnswer').value,
      options: type === 'mcq' ? options : [],
      type,
      ...imagePayload
    };

    // Immediate UI update first (fast close and optimistic rendering).
    syncSessionCard(updated);
    applyOptimisticCardUpdate(updated);
    if (session.active) void renderSessionCard();

    const editDialog = el('editCardDialog');
    if (editDialog?.open) editDialog.close();
    replaceFieldImages(el('editCardPrompt'), el('editQuestionImagePreview'), [], 'imageDataQ');
    replaceFieldImages(el('editCardAnswer'), el('editAnswerImagePreview'), [], 'imageDataA');
    setPreview('editQuestionPreview', '', editQuestionTextAlign);
    setPreview('editAnswerPreview', '', editAnswerTextAlign);

    void (async () => {
      try {
        await put('cards', updated, { uiBlocking: false });
        await putCardBank(updated, { uiBlocking: false });
        await touchSubjectByTopicId(updated.topicId, undefined, { uiBlocking: false });
      } catch (err) {
        console.warn('Deferred card edit sync failed:', err);
      } finally {
        try {
          await refreshSidebar({ uiBlocking: false });
          const cardsOverviewSection = el('cardsOverviewSection');
          const cardsOverviewVisible = cardsOverviewSection
            ? !cardsOverviewSection.classList.contains('hidden')
            : false;
          if (cardsOverviewVisible && selectedTopic?.id === updated.topicId) {
            void loadDeck();
          }
          if (currentView === 3 && selectedTopic?.id === updated.topicId) {
            void loadEditorCards();
          }
        } catch (err) {
          console.warn('Deferred post-edit refresh failed:', err);
        } finally {
          saveBtn.dataset.busy = '0';
          saveBtn.disabled = false;
        }
      }
    })();
  };

  document.querySelectorAll('[data-grade]').forEach(btn => {
    btn.addEventListener('click', () => gradeCard(btn.dataset.grade));
  });

  ensureKatexLoaded().then(loaded => {
    if (!loaded) return;
    rerenderAllRichMath();
  });
  await Promise.all([
    refreshSidebar(),
    refreshDailyReviewHomePanel({ useExisting: false })
  ]);
}

window.addEventListener('DOMContentLoaded', boot);
