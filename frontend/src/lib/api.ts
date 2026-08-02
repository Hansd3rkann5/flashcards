export interface ApiHealth {
  status: string;
}

export interface SubjectRecord {
  id: string;
  name: string;
  accent?: string;
  isArchived?: boolean;
  createdAt?: string | number;
  updatedAt?: string | number;
  meta?: {
    createdAt?: string | number;
    updatedAt?: string | number;
  };
}

export interface ApiStats {
  subjects: number;
  topics: number;
  cards: number;
  progress: number;
}

export interface TopicRecord {
  id: string;
  subjectId: string;
  name: string;
  cardCount?: number;
  createdAt?: string | number;
  updatedAt?: string | number;
  meta?: {
    createdAt?: string | number;
    updatedAt?: string | number;
  };
}

export interface CardOptionRecord {
  text?: string;
  correct?: boolean | string;
  order?: number | string;
}

export interface CardRecord {
  id: string;
  topicId: string;
  prompt?: string;
  answer?: string;
  type?: string;
  options?: CardOptionRecord[];
  optionsRequireOrder?: boolean;
  textAlign?: string;
  questionTextAlign?: string;
  answerTextAlign?: string;
  optionsTextAlign?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  meta?: {
    createdAt?: string | number;
    updatedAt?: string | number;
  };
}

export interface ProgressDayRecord {
  correct?: number;
  wrong?: number;
  partial?: number;
  correctStreak?: number;
  mastered?: boolean;
  lastGrade?: string;
  lastAnsweredAt?: string;
}

export interface ProgressRecord {
  cardId: string;
  byDay?: Record<string, ProgressDayRecord>;
  totals?: {
    correct?: number;
    wrong?: number;
    partial?: number;
  };
  lastGrade?: string;
  lastAnsweredAt?: string;
}

const apiBase = String(import.meta.env.VITE_API_BASE_URL || '').trim();
const API_REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000);
const API_QUERY_CACHE_PREFIX = 'flashcards.apiCache.';
const API_QUERY_CACHE_DEFAULT_TTL_MS = 30000;
const API_QUERY_CACHE_TTL_BY_ROUTE: Record<string, number> = {
  '/api/subjects': 60000,
  '/api/topics': 60000,
  '/api/cards': 300000,
  '/api/progress': 120000,
  '/api/stats': 30000
};

interface ApiQueryCacheEntry<T = unknown> {
  ts: number;
  data: T;
}

const apiQueryCache = new Map<string, ApiQueryCacheEntry>();
const apiQueryInFlight = new Map<string, Promise<unknown>>();

function buildUrl(path: string): string {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  if (!apiBase) return safePath;
  return `${apiBase}${safePath}`;
}

function cloneData<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function getApiRouteFromPath(path: string): string {
  const clean = String(path || '').split('?')[0];
  return clean || '/';
}

function getQueryTtlMs(path: string): number {
  const route = getApiRouteFromPath(path);
  return Number(API_QUERY_CACHE_TTL_BY_ROUTE[route] || API_QUERY_CACHE_DEFAULT_TTL_MS);
}

function getApiCacheStorageKey(cacheKey: string): string {
  return `${API_QUERY_CACHE_PREFIX}${cacheKey}`;
}

function removeStoredApiCache(cacheKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(getApiCacheStorageKey(cacheKey));
  } catch {
    // Keep cache best-effort; storage availability is not guaranteed.
  }
}

function setCachedApiQuery<T>(cacheKey: string, data: T): void {
  const entry: ApiQueryCacheEntry<T> = {
    ts: Date.now(),
    data: cloneData(data)
  };
  apiQueryCache.set(cacheKey, entry);
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(getApiCacheStorageKey(cacheKey), JSON.stringify(entry));
  } catch {
    // Ignore quota/storage failures and keep in-memory cache only.
  }
}

function getFreshCachedApiQuery<T>(cacheKey: string, ttlMs: number): T | null {
  const cached = apiQueryCache.get(cacheKey);
  if (cached && Date.now() - cached.ts <= ttlMs) {
    return cloneData(cached.data) as T;
  }

  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(getApiCacheStorageKey(cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ApiQueryCacheEntry<T>;
    if (!parsed || typeof parsed !== 'object' || !Number.isFinite(Number(parsed.ts))) {
      removeStoredApiCache(cacheKey);
      return null;
    }
    if (Date.now() - Number(parsed.ts) > ttlMs) {
      apiQueryCache.delete(cacheKey);
      removeStoredApiCache(cacheKey);
      return null;
    }
    apiQueryCache.set(cacheKey, {
      ts: Number(parsed.ts),
      data: cloneData(parsed.data)
    });
    return cloneData(parsed.data);
  } catch {
    removeStoredApiCache(cacheKey);
    return null;
  }
}

function invalidateApiQueryCacheByRoute(routePrefix: string): void {
  const safePrefix = String(routePrefix || '').trim();
  if (!safePrefix) return;
  Array.from(apiQueryCache.keys()).forEach(cacheKey => {
    if (!cacheKey.startsWith(safePrefix)) return;
    apiQueryCache.delete(cacheKey);
    removeStoredApiCache(cacheKey);
  });
}

export function hasFreshApiQueryCache(path: string, ttlMs = getQueryTtlMs(path)): boolean {
  const safePath = String(path || '').trim();
  if (!safePath) return false;
  return getFreshCachedApiQuery(safePath, ttlMs) !== null;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(API_REQUEST_TIMEOUT_MS) && API_REQUEST_TIMEOUT_MS > 0
    ? Math.trunc(API_REQUEST_TIMEOUT_MS)
    : 15000;
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`API request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const cacheKey = String(path || '').trim();
  const ttlMs = getQueryTtlMs(cacheKey);
  const cached = getFreshCachedApiQuery<T>(cacheKey, ttlMs);
  if (cached !== null) return cached;

  if (apiQueryInFlight.has(cacheKey)) {
    return cloneData(await apiQueryInFlight.get(cacheKey)) as T;
  }

  const requestPromise = (async () => {
  const response = await fetchWithTimeout(buildUrl(path), {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text || response.statusText}`);
  }
    const data = await response.json() as T;
    setCachedApiQuery(cacheKey, data);
    return data;
  })();

  apiQueryInFlight.set(cacheKey, requestPromise);
  try {
    return cloneData(await requestPromise);
  } finally {
    apiQueryInFlight.delete(cacheKey);
  }
}

async function putJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetchWithTimeout(buildUrl(path), {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text || response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function deleteRequest(path: string): Promise<void> {
  const response = await fetchWithTimeout(buildUrl(path), {
    method: 'DELETE'
  });
  if (!response.ok && response.status !== 204) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text || response.statusText}`);
  }
}

export function getApiHealth(): Promise<ApiHealth> {
  return getJson<ApiHealth>('/api/health');
}

export function getApiStats(): Promise<ApiStats> {
  return getJson<ApiStats>('/api/stats');
}

export function getSubjects(): Promise<SubjectRecord[]> {
  return getJson<SubjectRecord[]>('/api/subjects');
}

export function upsertSubject(subject: SubjectRecord): Promise<SubjectRecord> {
  return putJson<SubjectRecord>('/api/subjects', subject).then(result => {
    invalidateApiQueryCacheByRoute('/api/subjects');
    invalidateApiQueryCacheByRoute('/api/topics');
    invalidateApiQueryCacheByRoute('/api/cards');
    invalidateApiQueryCacheByRoute('/api/progress');
    invalidateApiQueryCacheByRoute('/api/stats');
    return result;
  });
}

export function getTopicsBySubject(subjectId: string, includeCounts = true): Promise<TopicRecord[]> {
  const safeSubjectId = String(subjectId || '').trim();
  const query = new URLSearchParams();
  if (safeSubjectId) query.append('subjectId', safeSubjectId);
  if (includeCounts) query.set('includeCounts', '1');
  const queryString = query.toString();
  return getJson<TopicRecord[]>(`/api/topics${queryString ? `?${queryString}` : ''}`);
}

export function getCardsByTopicIds(topicIds: string[]): Promise<CardRecord[]> {
  const safeTopicIds = Array.from(new Set(
    (Array.isArray(topicIds) ? topicIds : [])
      .map(topicId => String(topicId || '').trim())
      .filter(Boolean)
  ));
  if (!safeTopicIds.length) return Promise.resolve([]);
  const query = new URLSearchParams();
  safeTopicIds.forEach(topicId => query.append('topicId', topicId));
  return getJson<CardRecord[]>(`/api/cards?${query.toString()}`);
}

export function getProgressByCardIds(cardIds: string[]): Promise<ProgressRecord[]> {
  const safeCardIds = Array.from(new Set(
    (Array.isArray(cardIds) ? cardIds : [])
      .map(cardId => String(cardId || '').trim())
      .filter(Boolean)
  ));
  if (!safeCardIds.length) return Promise.resolve([]);
  const query = new URLSearchParams();
  safeCardIds.forEach(cardId => query.append('cardId', cardId));
  return getJson<ProgressRecord[]>(`/api/progress?${query.toString()}`);
}

export function upsertTopic(topic: TopicRecord): Promise<TopicRecord> {
  return putJson<TopicRecord>('/api/topics', topic).then(result => {
    invalidateApiQueryCacheByRoute('/api/topics');
    invalidateApiQueryCacheByRoute('/api/cards');
    invalidateApiQueryCacheByRoute('/api/progress');
    invalidateApiQueryCacheByRoute('/api/stats');
    return result;
  });
}

export function upsertCard(card: CardRecord): Promise<CardRecord> {
  return putJson<CardRecord>('/api/cards', card).then(result => {
    invalidateApiQueryCacheByRoute('/api/cards');
    invalidateApiQueryCacheByRoute('/api/topics');
    invalidateApiQueryCacheByRoute('/api/progress');
    invalidateApiQueryCacheByRoute('/api/stats');
    return result;
  });
}

export function deleteTopicById(topicId: string): Promise<void> {
  const safeTopicId = encodeURIComponent(String(topicId || '').trim());
  return deleteRequest(`/api/topics/${safeTopicId}`).then(() => {
    invalidateApiQueryCacheByRoute('/api/topics');
    invalidateApiQueryCacheByRoute('/api/cards');
    invalidateApiQueryCacheByRoute('/api/progress');
    invalidateApiQueryCacheByRoute('/api/stats');
  });
}

export function deleteCardById(cardId: string): Promise<void> {
  const safeCardId = encodeURIComponent(String(cardId || '').trim());
  return deleteRequest(`/api/cards/${safeCardId}`).then(() => {
    invalidateApiQueryCacheByRoute('/api/cards');
    invalidateApiQueryCacheByRoute('/api/topics');
    invalidateApiQueryCacheByRoute('/api/progress');
    invalidateApiQueryCacheByRoute('/api/stats');
  });
}

export function deleteProgressByCardId(cardId: string): Promise<void> {
  const safeCardId = encodeURIComponent(String(cardId || '').trim());
  return deleteRequest(`/api/progress/${safeCardId}`).then(() => {
    invalidateApiQueryCacheByRoute('/api/progress');
    invalidateApiQueryCacheByRoute('/api/cards');
    invalidateApiQueryCacheByRoute('/api/topics');
    invalidateApiQueryCacheByRoute('/api/stats');
  });
}

export function deleteCardBankById(cardId: string): Promise<void> {
  const safeCardId = encodeURIComponent(String(cardId || '').trim());
  return deleteRequest(`/api/cardbank/${safeCardId}`).then(() => {
    invalidateApiQueryCacheByRoute('/api/cardbank');
    invalidateApiQueryCacheByRoute('/api/cards');
    invalidateApiQueryCacheByRoute('/api/topics');
    invalidateApiQueryCacheByRoute('/api/stats');
  });
}

export function deleteSubjectById(subjectId: string): Promise<void> {
  const safeSubjectId = encodeURIComponent(String(subjectId || '').trim());
  return deleteRequest(`/api/subjects/${safeSubjectId}`).then(() => {
    invalidateApiQueryCacheByRoute('/api/subjects');
    invalidateApiQueryCacheByRoute('/api/topics');
    invalidateApiQueryCacheByRoute('/api/cards');
    invalidateApiQueryCacheByRoute('/api/progress');
    invalidateApiQueryCacheByRoute('/api/stats');
  });
}
