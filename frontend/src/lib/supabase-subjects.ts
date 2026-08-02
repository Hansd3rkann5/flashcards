import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CardRecord, ProgressRecord, SubjectRecord, TopicRecord } from './api';

let supabaseClient: SupabaseClient | null = null;
let tenantColumn = '';
let activeConfigKey = '';
const SUPABASE_OP_TIMEOUT_MS = Number(import.meta.env.VITE_SUPABASE_TIMEOUT_MS || 15000);

interface RuntimeSupabaseConfig {
  url: string;
  anonKey: string;
  table: string;
}

type SupabaseStoreName = 'subjects' | 'topics' | 'cards' | 'progress';

const STORE_KEY_FIELD: Record<SupabaseStoreName, string> = {
  subjects: 'id',
  topics: 'id',
  cards: 'id',
  progress: 'cardId'
};

function getSafeTimeoutMs(value: number, fallback = 15000): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.trunc(value);
}

async function withTimeout<T>(
  task: Promise<T> | PromiseLike<T> | T,
  label: string,
  timeoutMs = SUPABASE_OP_TIMEOUT_MS
): Promise<T> {
  const safeTimeoutMs = getSafeTimeoutMs(timeoutMs);
  let timeoutHandle: number | null = null;
  const taskPromise = Promise.resolve(task);
  try {
    return await Promise.race<T>([
      taskPromise,
      new Promise<T>((_, reject) => {
        timeoutHandle = window.setTimeout(() => {
          reject(new Error(`${label} timed out after ${safeTimeoutMs}ms.`));
        }, safeTimeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
  }
}

function getWindowRuntimeValue(key: string): string {
  if (typeof window === 'undefined') return '';
  const value = (window as unknown as Record<string, unknown>)[key];
  return String(value || '').trim();
}

function getRuntimeConfig(): RuntimeSupabaseConfig {
  const url = String(import.meta.env.VITE_SUPABASE_URL || '').trim()
    || getWindowRuntimeValue('__SUPABASE_URL__');
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()
    || getWindowRuntimeValue('__SUPABASE_ANON_KEY__');
  const table = String(import.meta.env.VITE_SUPABASE_TABLE || '').trim()
    || getWindowRuntimeValue('__SUPABASE_TABLE__')
    || 'records';
  return { url, anonKey, table };
}

function isMissingColumnError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  return code === '42703' || (message.includes('column') && message.includes('does not exist'));
}

function getErrorMessage(error: unknown, fallback: string): string {
  const message = String((error as { message?: string })?.message || '').trim();
  return message || fallback;
}

function withTenantScope<TQuery>(query: TQuery, ownerId = ''): TQuery {
  const safeOwnerId = String(ownerId || '').trim();
  if (!safeOwnerId || !tenantColumn) return query;
  const candidate = query as unknown as { eq?: (column: string, value: string) => TQuery };
  if (!candidate || typeof candidate.eq !== 'function') return query;
  return candidate.eq(tenantColumn, safeOwnerId);
}

function normalizeStorePayloadRow(
  row: Record<string, unknown>,
  keyField: string
): Record<string, unknown> {
  const payloadRaw = row?.payload;
  const payload = (payloadRaw && typeof payloadRaw === 'object')
    ? { ...(payloadRaw as Record<string, unknown>) }
    : {};
  const recordKey = String(row?.record_key || '').trim();
  if (!String(payload[keyField] || '').trim() && recordKey) payload[keyField] = recordKey;
  const rowUpdatedAt = String(row?.updated_at || '').trim();
  if (rowUpdatedAt) {
    if (!String(payload.updatedAt || '').trim()) payload.updatedAt = rowUpdatedAt;
    const meta = (payload.meta && typeof payload.meta === 'object')
      ? { ...(payload.meta as Record<string, unknown>) }
      : {};
    if (!String(meta.updatedAt || '').trim()) meta.updatedAt = rowUpdatedAt;
    payload.meta = meta;
  }
  return payload;
}

function normalizeTopicRecord(raw: Record<string, unknown>): TopicRecord {
  return {
    ...raw,
    id: String(raw.id || '').trim(),
    subjectId: String(raw.subjectId || '').trim(),
    name: String(raw.name || '').trim() || 'Untitled topic',
    cardCount: Number.isFinite(Number(raw.cardCount))
      ? Math.max(0, Math.trunc(Number(raw.cardCount)))
      : 0
  } as TopicRecord;
}

function normalizeCardRecord(raw: Record<string, unknown>): CardRecord {
  return {
    ...raw,
    id: String(raw.id || '').trim(),
    topicId: String(raw.topicId || '').trim()
  } as CardRecord;
}

function normalizeProgressRecord(raw: Record<string, unknown>): ProgressRecord {
  return {
    ...raw,
    cardId: String(raw.cardId || '').trim()
  } as ProgressRecord;
}

function getClient(): SupabaseClient | null {
  const config = getRuntimeConfig();
  if (!config.url || !config.anonKey) return null;
  const nextConfigKey = `${config.url}|${config.anonKey}`;
  if (!supabaseClient || activeConfigKey !== nextConfigKey) {
    supabaseClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    activeConfigKey = nextConfigKey;
    tenantColumn = '';
  }
  return supabaseClient;
}

export function isSupabaseConfigured(): boolean {
  const config = getRuntimeConfig();
  return !!(config.url && config.anonKey);
}

export async function hasValidSupabaseSession(): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const { data: sessionData, error: sessionError } = await withTimeout(
    client.auth.getSession(),
    'Supabase session check'
  );
  if (sessionError) throw new Error(String(sessionError.message || 'Failed to load Supabase session.'));
  if (!sessionData?.session) return false;

  const { data: userData, error: userError } = await withTimeout(
    client.auth.getUser(),
    'Supabase user check'
  );
  if (userError) return false;
  return !!userData?.user?.id;
}

async function resolveTenantColumn(client: SupabaseClient): Promise<string> {
  if (tenantColumn) return tenantColumn;
  const config = getRuntimeConfig();
  const candidates = ['uid', 'UID', 'owner_id'];
  for (const candidate of candidates) {
    const probeResult = await withTimeout(
      client.from(config.table).select(candidate).limit(1),
      'Supabase tenant column detection'
    ) as { error?: unknown };
    const error = probeResult?.error;
    if (!error) {
      tenantColumn = candidate;
      return tenantColumn;
    }
    if (!isMissingColumnError(error)) {
      throw new Error(getErrorMessage(error, 'Failed to detect Supabase tenant column.'));
    }
  }
  throw new Error('Missing tenant column in Supabase table `records` (expected uid/UID/owner_id).');
}

async function resolveOwnerId(client: SupabaseClient): Promise<string> {
  const { data, error } = await withTimeout(client.auth.getUser(), 'Supabase user lookup');
  if (error) throw new Error(String(error.message || 'Failed to load Supabase user.'));
  return String(data?.user?.id || '').trim();
}

async function listStoreRecordsSupabase(store: SupabaseStoreName, ownerId: string): Promise<Record<string, unknown>[]> {
  const client = getClient();
  if (!client) return [];
  await resolveTenantColumn(client);
  const config = getRuntimeConfig();
  const safeOwnerId = String(ownerId || '').trim();
  if (!safeOwnerId) return [];
  const keyField = STORE_KEY_FIELD[store];

  const queryResult = await withTimeout(
    withTenantScope(client
      .from(config.table)
      .select('record_key,payload,updated_at'), safeOwnerId)
      .eq('store', store)
      .order('updated_at', { ascending: true })
      .range(0, 9999),
    `Supabase ${store} list query`
  ) as { data?: unknown[] | null; error?: unknown };
  if (queryResult?.error) {
    throw new Error(getErrorMessage(queryResult.error, `Failed to list ${store} from Supabase.`));
  }
  const rows = Array.isArray(queryResult?.data) ? queryResult.data : [];
  return rows.map(row => normalizeStorePayloadRow(row as Record<string, unknown>, keyField));
}

async function upsertStoreRecordSupabase(
  store: SupabaseStoreName,
  key: string,
  payload: Record<string, unknown>,
  ownerId: string
): Promise<Record<string, unknown>> {
  const client = getClient();
  if (!client) throw new Error('Supabase configuration missing.');
  await resolveTenantColumn(client);
  const config = getRuntimeConfig();
  const safeKey = String(key || '').trim();
  const safeOwnerId = String(ownerId || '').trim();
  if (!safeKey) throw new Error(`Missing record key for Supabase ${store} upsert.`);
  if (!safeOwnerId) throw new Error('Missing Supabase owner id.');

  const updatedAt = new Date().toISOString();
  const row: Record<string, unknown> = {
    store,
    record_key: safeKey,
    payload,
    updated_at: updatedAt
  };
  if (tenantColumn) row[tenantColumn] = safeOwnerId;

  let result = await withTimeout(
    client.from(config.table).upsert(row, { onConflict: 'store,record_key' }).select('record_key,payload,updated_at').single(),
    `Supabase ${store} upsert`
  ) as { data?: unknown; error?: unknown };

  if (result?.error && tenantColumn) {
    result = await withTimeout(
      client
        .from(config.table)
        .upsert(row, { onConflict: `${tenantColumn},store,record_key` })
        .select('record_key,payload,updated_at')
        .single(),
      `Supabase ${store} tenant upsert`
    ) as { data?: unknown; error?: unknown };
  }

  if (result?.error) {
    throw new Error(getErrorMessage(result.error, `Failed to upsert ${store} in Supabase.`));
  }
  return normalizeStorePayloadRow(
    result?.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : row,
    STORE_KEY_FIELD[store]
  );
}

function normalizeSubjectRow(row: Record<string, unknown>): SubjectRecord {
  const payloadRaw = row?.payload;
  const payload = (payloadRaw && typeof payloadRaw === 'object')
    ? { ...(payloadRaw as Record<string, unknown>) }
    : { ...row };
  const id = String(payload.id || row.id || row.record_key || '').trim();
  const name = String(payload.name || '').trim() || 'Untitled subject';
  return {
    id,
    name,
    accent: String(payload.accent || '').trim() || undefined,
    isArchived: payload.isArchived === true,
    createdAt: payload.createdAt as string | number | undefined,
    updatedAt: payload.updatedAt as string | number | undefined,
    meta: (payload.meta && typeof payload.meta === 'object')
      ? {
        createdAt: (payload.meta as Record<string, unknown>).createdAt as string | number | undefined,
        updatedAt: (payload.meta as Record<string, unknown>).updatedAt as string | number | undefined
      }
      : undefined
  };
}

export async function getSubjectsFromSupabaseIfConfigured(): Promise<SubjectRecord[] | null> {
  const client = getClient();
  if (!client) return null;
  const ownerId = await resolveOwnerId(client);
  if (!ownerId) return [];
  const rows = await listStoreRecordsSupabase('subjects', ownerId);
  return rows
    .map(row => normalizeSubjectRow(row))
    .filter(subject => String(subject.id || '').trim().length > 0);
}

export async function upsertSubjectToSupabaseIfConfigured(subject: SubjectRecord): Promise<SubjectRecord | null> {
  const client = getClient();
  if (!client) return null;
  const ownerId = await resolveOwnerId(client);
  if (!ownerId) return null;
  const subjectId = String(subject?.id || '').trim();
  if (!subjectId) throw new Error('Missing subject id for Supabase subject upsert.');
  const payload = {
    ...subject,
    id: subjectId
  } as Record<string, unknown>;
  const row = await upsertStoreRecordSupabase('subjects', subjectId, payload, ownerId);
  return normalizeSubjectRow(row);
}

export async function getTopicsFromSupabaseIfConfigured(
  subjectId = '',
  includeCounts = true
): Promise<TopicRecord[] | null> {
  const client = getClient();
  if (!client) return null;
  const ownerId = await resolveOwnerId(client);
  if (!ownerId) return [];

  const safeSubjectId = String(subjectId || '').trim();
  const rows = await listStoreRecordsSupabase('topics', ownerId);
  const topics = rows
    .map(normalizeTopicRecord)
    .filter(topic => String(topic.id || '').trim().length > 0)
    .filter(topic => !safeSubjectId || String(topic.subjectId || '').trim() === safeSubjectId);

  if (!includeCounts) return topics;
  const cards = await listStoreRecordsSupabase('cards', ownerId);
  const countsByTopicId = new Map<string, number>();
  cards.forEach(raw => {
    const topicKey = String(raw.topicId || '').trim();
    if (!topicKey) return;
    countsByTopicId.set(topicKey, (countsByTopicId.get(topicKey) || 0) + 1);
  });
  return topics.map(topic => ({
    ...topic,
    cardCount: countsByTopicId.get(String(topic.id || '').trim()) || 0
  }));
}

export async function getCardsFromSupabaseByTopicIdsIfConfigured(topicIds: string[]): Promise<CardRecord[] | null> {
  const client = getClient();
  if (!client) return null;
  const ownerId = await resolveOwnerId(client);
  if (!ownerId) return [];
  const safeTopicIds = Array.from(new Set(
    (Array.isArray(topicIds) ? topicIds : [])
      .map(topicId => String(topicId || '').trim())
      .filter(Boolean)
  ));
  if (!safeTopicIds.length) return [];

  const topicIdSet = new Set(safeTopicIds);
  const cards = await listStoreRecordsSupabase('cards', ownerId);
  return cards
    .map(normalizeCardRecord)
    .filter(card => {
      const topicId = String(card.topicId || '').trim();
      return !!topicId && topicIdSet.has(topicId);
    });
}

export async function getProgressFromSupabaseByCardIdsIfConfigured(cardIds: string[]): Promise<ProgressRecord[] | null> {
  const client = getClient();
  if (!client) return null;
  const ownerId = await resolveOwnerId(client);
  if (!ownerId) return [];
  const safeCardIds = Array.from(new Set(
    (Array.isArray(cardIds) ? cardIds : [])
      .map(cardId => String(cardId || '').trim())
      .filter(Boolean)
  ));
  if (!safeCardIds.length) return [];

  const cardIdSet = new Set(safeCardIds);
  const progressRows = await listStoreRecordsSupabase('progress', ownerId);
  return progressRows
    .map(normalizeProgressRecord)
    .filter(progress => {
      const cardId = String(progress.cardId || '').trim();
      return !!cardId && cardIdSet.has(cardId);
    });
}

export async function signInWithSupabase(email: string, password: string): Promise<void> {
  const client = getClient();
  if (!client) throw new Error('Supabase configuration missing.');
  const safeEmail = String(email || '').trim();
  const safePassword = String(password || '');
  if (!safeEmail || !safePassword) throw new Error('Email and password are required.');
  const { error } = await withTimeout(
    client.auth.signInWithPassword({
      email: safeEmail,
      password: safePassword
    }),
    'Supabase sign in'
  );
  if (error) throw new Error(String(error.message || 'Sign in failed.'));
}

export async function signUpWithSupabase(email: string, password: string): Promise<void> {
  const client = getClient();
  if (!client) throw new Error('Supabase configuration missing.');
  const safeEmail = String(email || '').trim();
  const safePassword = String(password || '');
  if (!safeEmail || !safePassword) throw new Error('Email and password are required.');
  const { error } = await withTimeout(
    client.auth.signUp({
      email: safeEmail,
      password: safePassword
    }),
    'Supabase sign up'
  );
  if (error) throw new Error(String(error.message || 'Sign up failed.'));
}

export async function signOutFromSupabase(): Promise<void> {
  const client = getClient();
  if (!client) throw new Error('Supabase configuration missing.');
  const { error } = await withTimeout(client.auth.signOut(), 'Supabase sign out');
  if (error) throw new Error(String(error.message || 'Sign out failed.'));
}
