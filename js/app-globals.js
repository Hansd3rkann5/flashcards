/**
 * Flashcards application client logic.
 * Navigation tip: search for `@function <name>` to jump directly to a function.
 */
const API_BASE = '/api';
const SUPABASE_URL = String(window.__SUPABASE_URL__ || '').trim();
const SUPABASE_ANON_KEY = String(window.__SUPABASE_ANON_KEY__ || '').trim();
const SUPABASE_PICTURES_BUCKET = String(window.__SUPABASE_PICTURES_BUCKET__ || 'Pictures').trim() || 'Pictures';
const SUPABASE_TABLE = 'records';
const LOCAL_SNAPSHOT_MODE = window.__LOCAL_SNAPSHOT_MODE__ === true;
const LOCAL_SNAPSHOT_PATH = String(window.__LOCAL_SNAPSHOT_PATH__ || '').trim();
const STORE_KEYS = {
  subjects: 'id',
  topics: 'id',
  cards: 'id',
  progress: 'cardId',
  cardbank: 'id',
  settings: 'id'
};
let dbReady = false;
let selectedSubject = null;
let selectedTopic = null;
let selectedTopicIds = new Set();
let pendingSubjectDeletionIds = new Set();
let pendingTopicDeletionIds = new Set();
let sessionSize = 10;
let pillBarResizeObserver = null;
let pillResizeTimeout = null;
const SESSION_SIZE_MODEL_STORAGE_KEY = 'flashcards.session-size-model.v1';
const SESSION_SIZE_MODEL_SETTINGS_ID = 'session-size-model';
const SESSION_SIZE_MODEL_BASELINE = 10;
const SESSION_SIZE_MODEL_MIN_SAMPLES_PER_SUBJECT = 2;
const SESSION_SIZE_MODEL_MIN_SAMPLES_GLOBAL = 3;
const SESSION_SIZE_MODEL_REPEAT_WEIGHT_STEP = 0.5;
const SESSION_SIZE_MODEL_REPEAT_WEIGHT_MAX_BONUS = 2;
let availableSessionCards = 0;
let session = { active: false, activeQueue: [], mastered: [], counts: {}, gradeMap: {}, mode: 'default' };
let sessionSizeModelCache = null;
let sessionSizeModelRemoteReady = false;
let sessionSizeModelLoadPromise = null;
let sessionSizeModelSyncTimer = null;
let sessionSizeManualOverride = false;
let sessionSizeManualOverrideSubjectId = '';
const SESSION_IMAGE_PRELOAD_CACHE_MAX = 256;
const sessionImagePreloadCache = new Map();
const storageImageResolvedUrlCache = new Map();
const storageImageResolveInFlight = new Map();
let editingCardId = null;
let editingCardSnapshot = null;
let editingSubjectId = null;
let editingTopicId = null;
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
let currentSubjectTopicIds = [];
let currentSubjectTopics = [];
let currentSubjectTopicsSubjectId = '';
let topicSearchRunId = 0;
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
  reviewPriorityByCardId: new Map(),
  latestStateByCardId: new Map(),
  latestStateCounts: {
    mastered: 0,
    correct: 0,
    partial: 0,
    wrong: 0,
    inProgress: 0,
    notAnswered: 0
  },
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
  size: 0,
  activityStreakDays: 0,
  activityDaysTotal: 0
};
const PROGRESS_CHECK_COLUMN_KEYS = Object.freeze([
  'subject',
  'topic',
  'question',
  'current',
  'score',
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
  score: 'Score',
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
let supabaseOwnerId = '';
let supabaseTenantColumn = '';

function isLocalSnapshotModeEnabled() {
  return LOCAL_SNAPSHOT_MODE;
}
const progressPersistInFlightByCardId = new Map();
let appLoadingOverlayCount = 0;
let appLoadingDebugPinned = false;
let reviewTraceRunCounter = 0;
let dailyReviewAnalyticsExpanded = true;

const el = id => document.getElementById(id);

/**
 * @function normalizeSessionSizeModelBucket
 * @description Normalizes one session-size model bucket.
 */

function normalizeSessionSizeModelBucket(bucket = null) {
  const countRaw = Number(bucket?.count);
  const meanRaw = Number(bucket?.mean);
  const weightSumRaw = Number(bucket?.weightSum);
  const streakRaw = Number(bucket?.streak);
  const lastSizeRaw = Number(bucket?.lastSize);
  const count = Number.isFinite(countRaw) && countRaw > 0 ? Math.floor(countRaw) : 0;
  const mean = Number.isFinite(meanRaw) && meanRaw > 0 ? meanRaw : SESSION_SIZE_MODEL_BASELINE;
  const fallbackWeightSum = count > 0 ? count : 0;
  const weightSum = Number.isFinite(weightSumRaw) && weightSumRaw > 0 ? weightSumRaw : fallbackWeightSum;
  const streak = Number.isFinite(streakRaw) && streakRaw > 0 ? Math.floor(streakRaw) : 0;
  const lastSize = Number.isFinite(lastSizeRaw) && lastSizeRaw > 0 ? Math.floor(lastSizeRaw) : 0;
  return { count, mean, weightSum, streak, lastSize };
}

/**
 * @function normalizeSessionSizeModelState
 * @description Normalizes complete session-size model payload.
 */

function normalizeSessionSizeModelState(model = null) {
  const source = (model && typeof model === 'object') ? model : {};
  const global = normalizeSessionSizeModelBucket(source.global);
  const subjectsRaw = (source.subjects && typeof source.subjects === 'object') ? source.subjects : {};
  const subjects = {};
  Object.entries(subjectsRaw).forEach(([subjectId, bucket]) => {
    const key = String(subjectId || '').trim();
    if (!key) return;
    subjects[key] = normalizeSessionSizeModelBucket(bucket);
  });
  const updatedAtRaw = Number(source.updatedAt);
  const updatedAt = Number.isFinite(updatedAtRaw) && updatedAtRaw > 0 ? Math.floor(updatedAtRaw) : 0;
  return { global, subjects, updatedAt };
}

/**
 * @function loadSessionSizeModel
 * @description Loads the session-size learning model from localStorage.
 */

function loadSessionSizeModel() {
  if (sessionSizeModelCache) return sessionSizeModelCache;
  const fallback = normalizeSessionSizeModelState({
    global: { count: 0, mean: SESSION_SIZE_MODEL_BASELINE },
    subjects: {},
    updatedAt: 0
  });
  if (typeof window === 'undefined' || !window.localStorage) {
    sessionSizeModelCache = fallback;
    return sessionSizeModelCache;
  }
  try {
    const raw = window.localStorage.getItem(SESSION_SIZE_MODEL_STORAGE_KEY);
    if (!raw) {
      sessionSizeModelCache = fallback;
      return sessionSizeModelCache;
    }
    const parsed = JSON.parse(raw);
    const normalized = normalizeSessionSizeModelState(parsed);
    if (normalized.updatedAt <= 0) {
      const hasAnyHistory = normalized.global.count > 0
        || Object.values(normalized.subjects).some(bucket => Number(bucket?.count || 0) > 0);
      if (hasAnyHistory) normalized.updatedAt = Date.now();
    }
    sessionSizeModelCache = normalized;
    saveSessionSizeModel();
  } catch (_) {
    sessionSizeModelCache = fallback;
  }
  return sessionSizeModelCache;
}

/**
 * @function saveSessionSizeModel
 * @description Persists the in-memory session-size learning model to localStorage.
 */

function saveSessionSizeModel() {
  if (typeof window === 'undefined' || !window.localStorage || !sessionSizeModelCache) return;
  try {
    window.localStorage.setItem(SESSION_SIZE_MODEL_STORAGE_KEY, JSON.stringify(sessionSizeModelCache));
  } catch (_) {
    // Ignore storage write errors (private mode/quota/etc.).
  }
}

/**
 * @function applySessionSizeSampleToBucket
 * @description Updates running mean/count in-place for one bucket.
 */

function applySessionSizeSampleToBucket(bucket, sampleSize) {
  const size = Number(sampleSize);
  if (!bucket || !Number.isFinite(size) || size <= 0) return;
  const normalizedSize = Math.max(1, Math.round(size));
  const prevCount = Number(bucket.count || 0);
  const prevWeightSumRaw = Number(bucket.weightSum);
  const prevWeightSum = Number.isFinite(prevWeightSumRaw) && prevWeightSumRaw > 0
    ? prevWeightSumRaw
    : Math.max(0, prevCount);
  const nextCount = prevCount + 1;
  const prevMean = Number.isFinite(Number(bucket.mean)) ? Number(bucket.mean) : SESSION_SIZE_MODEL_BASELINE;
  const prevLastSize = Number(bucket.lastSize || 0);
  const prevStreak = Number(bucket.streak || 0);
  const nextStreak = prevLastSize === normalizedSize
    ? Math.max(1, prevStreak + 1)
    : 1;
  const streakBonus = Math.min(
    SESSION_SIZE_MODEL_REPEAT_WEIGHT_MAX_BONUS,
    Math.max(0, nextStreak - 1) * SESSION_SIZE_MODEL_REPEAT_WEIGHT_STEP
  );
  const sampleWeight = 1 + streakBonus;
  const nextWeightSum = prevWeightSum + sampleWeight;
  bucket.count = nextCount;
  bucket.weightSum = nextWeightSum;
  bucket.lastSize = normalizedSize;
  bucket.streak = nextStreak;
  bucket.mean = ((prevMean * prevWeightSum) + (normalizedSize * sampleWeight)) / nextWeightSum;
}

/**
 * @function recordSessionSizeSample
 * @description Records one finished session-size choice into the local learning model.
 */

function recordSessionSizeSample(subjectId, sessionCardCount) {
  const safeSubjectId = String(subjectId || '').trim();
  const size = Number(sessionCardCount);
  if (!safeSubjectId || !Number.isFinite(size) || size <= 0) return;
  const model = loadSessionSizeModel();
  if (!model.subjects[safeSubjectId]) {
    model.subjects[safeSubjectId] = normalizeSessionSizeModelBucket(null);
  }
  applySessionSizeSampleToBucket(model.global, size);
  applySessionSizeSampleToBucket(model.subjects[safeSubjectId], size);
  model.updatedAt = Date.now();
  saveSessionSizeModel();
  queueSessionSizeModelSync();
}

/**
 * @function getSuggestedSessionSizeForSubject
 * @description Predicts a suitable session size from learned history (subject-first, then global).
 */

function getSuggestedSessionSizeForSubject(subjectId) {
  const safeSubjectId = String(subjectId || '').trim();
  const model = loadSessionSizeModel();
  const subjectBucket = safeSubjectId ? model.subjects[safeSubjectId] : null;
  if (subjectBucket && subjectBucket.count >= SESSION_SIZE_MODEL_MIN_SAMPLES_PER_SUBJECT) {
    return Math.max(1, Math.round(subjectBucket.mean));
  }
  if (model.global.count >= SESSION_SIZE_MODEL_MIN_SAMPLES_GLOBAL) {
    return Math.max(1, Math.round(model.global.mean));
  }
  return SESSION_SIZE_MODEL_BASELINE;
}

/**
 * @function markSessionSizeManualOverride
 * @description Marks that the user manually changed the session size in current subject.
 */

function markSessionSizeManualOverride() {
  sessionSizeManualOverride = true;
  sessionSizeManualOverrideSubjectId = String(selectedSubject?.id || '').trim();
}

/**
 * @function clearSessionSizeManualOverride
 * @description Clears manual session-size override so auto-size can apply again.
 */

function clearSessionSizeManualOverride() {
  sessionSizeManualOverride = false;
  sessionSizeManualOverrideSubjectId = '';
}

/**
 * @function buildSessionSizeModelSettingsPayload
 * @description Builds settings payload for server persistence.
 */

function buildSessionSizeModelSettingsPayload() {
  const model = loadSessionSizeModel();
  return {
    id: SESSION_SIZE_MODEL_SETTINGS_ID,
    global: normalizeSessionSizeModelBucket(model.global),
    subjects: normalizeSessionSizeModelState(model).subjects,
    updatedAt: Number.isFinite(Number(model.updatedAt)) ? Number(model.updatedAt) : 0
  };
}

/**
 * @function ensureSessionSizeModelLoadedFromServer
 * @description Loads session-size model from Supabase settings store and merges via timestamp.
 */

async function ensureSessionSizeModelLoadedFromServer(options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const force = !!opts.force;
  const uiBlocking = opts.uiBlocking === true;
  if (sessionSizeModelRemoteReady && !force) return loadSessionSizeModel();
  if (sessionSizeModelLoadPromise && !force) return sessionSizeModelLoadPromise;

  sessionSizeModelLoadPromise = (async () => {
    const localModel = loadSessionSizeModel();
    let loaded = false;
    try {
      const remoteRecord = await getById('settings', SESSION_SIZE_MODEL_SETTINGS_ID, {
        uiBlocking,
        loadingLabel: ''
      });
      const remoteModel = normalizeSessionSizeModelState(remoteRecord);
      if (remoteModel.updatedAt > localModel.updatedAt) {
        sessionSizeModelCache = remoteModel;
        saveSessionSizeModel();
      } else if (localModel.updatedAt > 0 && localModel.updatedAt > remoteModel.updatedAt) {
        queueSessionSizeModelSync();
      }
      loaded = true;
    } catch (_) {
      // Keep local model when remote read fails (offline/permissions/etc.).
    } finally {
      if (loaded) sessionSizeModelRemoteReady = true;
    }
    return loadSessionSizeModel();
  })();

  try {
    return await sessionSizeModelLoadPromise;
  } finally {
    sessionSizeModelLoadPromise = null;
  }
}

/**
 * @function syncSessionSizeModelToServer
 * @description Writes session-size model to Supabase settings store.
 */

async function syncSessionSizeModelToServer() {
  const payload = buildSessionSizeModelSettingsPayload();
  if (Number(payload.updatedAt || 0) <= 0) return;
  try {
    await put('settings', payload, {
      uiBlocking: false,
      loadingLabel: '',
      invalidate: 'settings'
    });
    sessionSizeModelRemoteReady = true;
  } catch (_) {
    // put() already queues offline mutations; nothing else needed here.
  }
}

/**
 * @function queueSessionSizeModelSync
 * @description Debounces server sync writes for the session-size model.
 */

function queueSessionSizeModelSync() {
  if (sessionSizeModelSyncTimer !== null) {
    clearTimeout(sessionSizeModelSyncTimer);
  }
  sessionSizeModelSyncTimer = setTimeout(() => {
    sessionSizeModelSyncTimer = null;
    void syncSessionSizeModelToServer();
  }, 600);
}

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
