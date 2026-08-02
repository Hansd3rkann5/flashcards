import {
  ArrowLeftOutlined,
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  FilterOutlined,
  InfoCircleOutlined,
  MenuOutlined,
  PlusOutlined,
  SearchOutlined,
  UnorderedListOutlined
} from '@ant-design/icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { ReactNode } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { AppButton } from '../components/ui/AppButton';
import { AppHeader } from '../components/ui/AppHeader';
import { useAppLoading } from '../components/ui/AppLoadingOverlay';
import { AppPanel } from '../components/ui/AppPanel';
import { TopicCardEditorPanel, type TopicCardEditorPayload } from '../components/ui/TopicCardEditorPanel';
import { TopicDeckOverview } from '../components/ui/TopicDeckOverview';
import type { TopicDeckCardRecord } from '../components/ui/TopicDeckCardTile';
import { TopicProgressStrip, type TopicProgressCounts } from '../components/ui/TopicProgressStrip';
import { TopicSessionSizeCounter } from '../components/ui/TopicSessionSizeCounter';
import {
  getCardsFromSupabaseByTopicIdsIfConfigured,
  getProgressFromSupabaseByCardIdsIfConfigured,
  getTopicsFromSupabaseIfConfigured
} from '../lib/supabase-subjects';
import {
  deleteCardById,
  deleteProgressByCardId,
  deleteTopicById,
  getCardsByTopicIds,
  getProgressByCardIds,
  getTopicsBySubject,
  hasFreshApiQueryCache,
  upsertCard,
  type CardRecord,
  type ProgressRecord,
  type SubjectRecord,
  type TopicRecord,
  upsertTopic
} from '../lib/api';
import { normalizeHexColor } from '../lib/subjects';
import '../styles/topic-panel.css';

const DEFAULT_SESSION_SIZE = 15;
const TOPIC_VIEW_SLIDE_MS = 520;

interface LayoutOutletContext {
  subjects: SubjectRecord[];
  subjectsLoading: boolean;
  subjectsError: string;
  openSidebar?: () => void;
  toggleSidebar?: () => void;
  panelSurfaceStyle?: CSSProperties;
  setSidebarForcedHidden?: (hidden: boolean) => void;
}

interface NormalizedDayProgress {
  correct: number;
  wrong: number;
  partial: number;
  correctStreak: number;
  mastered: boolean;
  lastGrade: string;
  lastAnsweredAt: string;
}

interface TopicPanelTopic extends TopicRecord {
  cardCount: number;
  progressCounts: TopicProgressCounts;
  lastUpdatedTs: number;
}

interface TopicPanelCacheEntry {
  ts: number;
  data: TopicPanelTopic[];
}

interface TopicDeckCacheData {
  cards: TopicDeckCardRecord[];
  progressByCardId: Record<string, ProgressRecord>;
}

interface TopicDeckCacheEntry {
  ts: number;
  data: TopicDeckCacheData;
}

type SubjectPanelMode = 'subject' | 'deck' | 'editor';
type SubjectPanelDirection = 'left' | 'right';

interface SubjectPanelTransitionState {
  direction: SubjectPanelDirection;
  active: boolean;
  leavingMode: SubjectPanelMode;
  enteringMode: SubjectPanelMode;
}

const TOPIC_PANEL_CACHE_PREFIX = 'flashcards.topicPanel.';
const TOPIC_PANEL_CACHE_TTL_MS = 1800000;
const topicPanelCache = new Map<string, TopicPanelCacheEntry>();
const TOPIC_DECK_CACHE_PREFIX = 'flashcards.topicDeck.';
const TOPIC_DECK_CACHE_TTL_MS = 1800000;
const topicDeckCache = new Map<string, TopicDeckCacheEntry>();

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

function toCounterInt(value: unknown): number {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return 0;
  return Math.max(0, Math.trunc(safe));
}

function toTimestamp(value: unknown): number {
  const raw = value;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  const text = String(raw || '').trim();
  if (!text) return 0;
  const dateTs = Date.parse(text);
  if (Number.isFinite(dateTs) && dateTs > 0) return dateTs;
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return 0;
}

function emptyProgressCounts(): TopicProgressCounts {
  return {
    mastered: 0,
    correct: 0,
    partial: 0,
    wrong: 0,
    notAnswered: 0
  };
}

function normalizeDayProgress(raw: unknown): NormalizedDayProgress {
  const source = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  const dayLastGrade = typeof source.lastGrade === 'string' ? source.lastGrade : '';
  const correctStreakRaw = Number(source.correctStreak);
  const correctStreak = Number.isFinite(correctStreakRaw) ? Math.max(0, Math.trunc(correctStreakRaw)) : 0;
  const legacyMastered = Number(source.correct) >= 3 && dayLastGrade === 'correct';
  const explicitMastered = source.mastered === true && dayLastGrade === 'correct';
  const derivedStreak = correctStreak > 0
    ? correctStreak
    : legacyMastered
      ? 3
      : dayLastGrade === 'correct'
        ? 1
        : 0;
  return {
    correct: toCounterInt(source.correct),
    wrong: toCounterInt(source.wrong),
    partial: toCounterInt(source.partial),
    correctStreak: derivedStreak,
    mastered: explicitMastered || legacyMastered || derivedStreak >= 3,
    lastGrade: dayLastGrade,
    lastAnsweredAt: typeof source.lastAnsweredAt === 'string' ? source.lastAnsweredAt : ''
  };
}

function getLatestProgressDayEntry(record: ProgressRecord | null): { day: NormalizedDayProgress } | null {
  const safeByDay = (record?.byDay && typeof record.byDay === 'object') ? record.byDay : {};
  const entries = Object.entries(safeByDay)
    .map(([dayKey, rawDay]) => {
      const day = normalizeDayProgress(rawDay);
      const attempts = toCounterInt(day.correct) + toCounterInt(day.wrong) + toCounterInt(day.partial);
      if (attempts <= 0) return null;
      const parsedTs = Date.parse(String(day.lastAnsweredAt || ''));
      const ts = Number.isFinite(parsedTs) ? parsedTs : Date.parse(`${dayKey}T23:59:59`);
      return {
        day,
        ts: Number.isFinite(ts) ? ts : 0,
        dayKey
      };
    })
    .filter((entry): entry is { day: NormalizedDayProgress; ts: number; dayKey: string } => !!entry);
  if (!entries.length) return null;
  entries.sort((a, b) => b.ts - a.ts || b.dayKey.localeCompare(a.dayKey));
  return { day: entries[0].day };
}

function getProgressStateKey(record: ProgressRecord | null): keyof TopicProgressCounts {
  const totals = {
    correct: toCounterInt(record?.totals?.correct),
    wrong: toCounterInt(record?.totals?.wrong),
    partial: toCounterInt(record?.totals?.partial)
  };
  const attemptsTotal = totals.correct + totals.wrong + totals.partial;
  if (attemptsTotal <= 0) return 'notAnswered';
  const latest = getLatestProgressDayEntry(record);
  const day = latest?.day || normalizeDayProgress(null);
  const lastGradeRaw = String(day.lastGrade || record?.lastGrade || '').trim();
  const streak = toCounterInt(day.correctStreak);
  if (lastGradeRaw === 'correct' && (day.mastered || streak >= 3)) return 'mastered';
  if (lastGradeRaw === 'correct') return 'correct';
  if (lastGradeRaw === 'wrong') return 'wrong';
  return 'partial';
}

function hexToRgba(hex: string, alpha: number): string {
  const safeHex = normalizeHexColor(hex);
  const normalized = safeHex.slice(1);
  const full = normalized.length === 3
    ? normalized.split('').map(char => `${char}${char}`).join('')
    : normalized;
  const red = parseInt(full.slice(0, 2), 16);
  const green = parseInt(full.slice(2, 4), 16);
  const blue = parseInt(full.slice(4, 6), 16);
  const safeAlpha = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;
  return `rgba(${red}, ${green}, ${blue}, ${safeAlpha})`;
}

function toDomIdSuffix(value: string): string {
  const safe = String(value || '').trim();
  if (!safe) return 'unknown';
  return safe.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function cloneTopicPanelTopics(topics: TopicPanelTopic[]): TopicPanelTopic[] {
  if (typeof structuredClone === 'function') return structuredClone(topics);
  return JSON.parse(JSON.stringify(topics)) as TopicPanelTopic[];
}

function cloneTopicDeckData(data: TopicDeckCacheData): TopicDeckCacheData {
  if (typeof structuredClone === 'function') return structuredClone(data);
  return JSON.parse(JSON.stringify(data)) as TopicDeckCacheData;
}

function getTopicPanelStorageKey(subjectId: string): string {
  return `${TOPIC_PANEL_CACHE_PREFIX}${subjectId}`;
}

function getTopicDeckStorageKey(topicId: string): string {
  return `${TOPIC_DECK_CACHE_PREFIX}${topicId}`;
}

function getFreshCachedTopicPanelState(subjectId: string): TopicPanelTopic[] | null {
  const safeSubjectId = String(subjectId || '').trim();
  if (!safeSubjectId) return null;
  const cached = topicPanelCache.get(safeSubjectId);
  if (cached && Date.now() - cached.ts <= TOPIC_PANEL_CACHE_TTL_MS) {
    return cloneTopicPanelTopics(cached.data);
  }
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(getTopicPanelStorageKey(safeSubjectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TopicPanelCacheEntry;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.data) || !Number.isFinite(Number(parsed.ts))) {
      window.sessionStorage.removeItem(getTopicPanelStorageKey(safeSubjectId));
      return null;
    }
    if (Date.now() - Number(parsed.ts) > TOPIC_PANEL_CACHE_TTL_MS) {
      topicPanelCache.delete(safeSubjectId);
      window.sessionStorage.removeItem(getTopicPanelStorageKey(safeSubjectId));
      return null;
    }
    const next = cloneTopicPanelTopics(parsed.data);
    topicPanelCache.set(safeSubjectId, { ts: Number(parsed.ts), data: next });
    return cloneTopicPanelTopics(next);
  } catch {
    return null;
  }
}

function setCachedTopicPanelState(subjectId: string, topics: TopicPanelTopic[]): void {
  const safeSubjectId = String(subjectId || '').trim();
  if (!safeSubjectId) return;
  const entry: TopicPanelCacheEntry = {
    ts: Date.now(),
    data: cloneTopicPanelTopics(topics)
  };
  topicPanelCache.set(safeSubjectId, entry);
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(getTopicPanelStorageKey(safeSubjectId), JSON.stringify(entry));
  } catch {
    // Ignore storage failures and keep memory cache only.
  }
}

function invalidateCachedTopicPanelState(subjectId: string): void {
  const safeSubjectId = String(subjectId || '').trim();
  if (!safeSubjectId) return;
  topicPanelCache.delete(safeSubjectId);
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(getTopicPanelStorageKey(safeSubjectId));
  } catch {
    // Ignore storage failures.
  }
}

function getFreshCachedTopicDeckState(topicId: string): TopicDeckCacheData | null {
  const safeTopicId = String(topicId || '').trim();
  if (!safeTopicId) return null;
  const cached = topicDeckCache.get(safeTopicId);
  if (cached && Date.now() - cached.ts <= TOPIC_DECK_CACHE_TTL_MS) {
    return cloneTopicDeckData(cached.data);
  }
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(getTopicDeckStorageKey(safeTopicId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TopicDeckCacheEntry;
    if (!parsed || typeof parsed !== 'object' || !parsed.data || !Number.isFinite(Number(parsed.ts))) {
      window.sessionStorage.removeItem(getTopicDeckStorageKey(safeTopicId));
      return null;
    }
    if (Date.now() - Number(parsed.ts) > TOPIC_DECK_CACHE_TTL_MS) {
      topicDeckCache.delete(safeTopicId);
      window.sessionStorage.removeItem(getTopicDeckStorageKey(safeTopicId));
      return null;
    }
    const next = cloneTopicDeckData(parsed.data);
    topicDeckCache.set(safeTopicId, { ts: Number(parsed.ts), data: next });
    return cloneTopicDeckData(next);
  } catch {
    return null;
  }
}

function setCachedTopicDeckState(topicId: string, data: TopicDeckCacheData): void {
  const safeTopicId = String(topicId || '').trim();
  if (!safeTopicId) return;
  const entry: TopicDeckCacheEntry = {
    ts: Date.now(),
    data: cloneTopicDeckData(data)
  };
  topicDeckCache.set(safeTopicId, entry);
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(getTopicDeckStorageKey(safeTopicId), JSON.stringify(entry));
  } catch {
    // Ignore storage failures and keep memory cache only.
  }
}

function invalidateCachedTopicDeckState(topicId: string): void {
  const safeTopicId = String(topicId || '').trim();
  if (!safeTopicId) return;
  topicDeckCache.delete(safeTopicId);
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(getTopicDeckStorageKey(safeTopicId));
  } catch {
    // Ignore storage failures.
  }
}

export default function SubjectView() {
  const { subjectId = '' } = useParams();
  const { withTask } = useAppLoading();
  const { subjects, subjectsLoading, subjectsError, toggleSidebar, panelSurfaceStyle, setSidebarForcedHidden } = useOutletContext<LayoutOutletContext>();
  const activeSubject = useMemo(
    () => subjects.find(subject => String(subject?.id || '').trim() === String(subjectId).trim()),
    [subjects, subjectId]
  );

  const [topics, setTopics] = useState<TopicPanelTopic[]>(() => getFreshCachedTopicPanelState(subjectId) || []);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicsError, setTopicsError] = useState('');
  const [topicName, setTopicName] = useState('');
  const [panelMessage, setPanelMessage] = useState('');
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());
  const [topicSelectionMode, setTopicSelectionMode] = useState(false);
  const [topicSelectedIds, setTopicSelectedIds] = useState<Set<string>>(new Set());
  const [activeTopicId, setActiveTopicId] = useState('');
  const [deckCards, setDeckCards] = useState<TopicDeckCardRecord[]>([]);
  const [deckProgressByCardId, setDeckProgressByCardId] = useState<Record<string, ProgressRecord>>({});
  const [deckLoading, setDeckLoading] = useState(false);
  const [deckError, setDeckError] = useState('');
  const [deckSelectionMode, setDeckSelectionMode] = useState(false);
  const [deckSelectedCardIds, setDeckSelectedCardIds] = useState<Set<string>>(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSidebarOpen, setEditorSidebarOpen] = useState(() => window.innerWidth > 980);
  const [editorShortcutsOpen, setEditorShortcutsOpen] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [displayedPanelMode, setDisplayedPanelMode] = useState<SubjectPanelMode>('subject');
  const [panelTransition, setPanelTransition] = useState<SubjectPanelTransitionState | null>(null);
  const [sessionSize, setSessionSize] = useState(DEFAULT_SESSION_SIZE);
  const [sessionSizeManualOverride, setSessionSizeManualOverride] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const latestSubjectIdRef = useRef('');
  const latestDeckTopicIdRef = useRef('');
  const lastDeckTopicIdRef = useRef('');
  const lastDeckTopicNameRef = useRef('');

  const subjectAccent = useMemo(
    () => normalizeHexColor(String(activeSubject?.accent || '#2dd4bf')),
    [activeSubject?.accent]
  );
  const themeStyle = useMemo<CSSProperties>(() => ({
    '--subject-accent': subjectAccent,
    '--accent': subjectAccent,
    '--accent-glow': hexToRgba(subjectAccent, 0.12),
    '--accent-ring': hexToRgba(subjectAccent, 0.42),
    '--accent-glow-strong': hexToRgba(subjectAccent, 0.22),
    '--accent-glow-soft': hexToRgba(subjectAccent, 0.1),
    '--tile-accent-bg': hexToRgba(subjectAccent, 0.1),
    '--subject-accent-bg': hexToRgba(subjectAccent, 0.1)
  }) as CSSProperties, [subjectAccent]);
  const panelStyle = useMemo<CSSProperties>(() => ({
    ...(panelSurfaceStyle || {}),
    '--panel-accent': hexToRgba(subjectAccent, 0.5),
    background: 'linear-gradient(180deg, var(--panel-accent, rgba(16, 24, 45, 0.82)) 0%, rgba(16, 24, 45, 0.82) 65%)'
  }) as CSSProperties, [subjectAccent, panelSurfaceStyle]);

  const topicIds = useMemo(() => topics.map(topic => String(topic.id || '').trim()).filter(Boolean), [topics]);
  const activeTopic = useMemo(
    () => topics.find(topic => String(topic.id || '').trim() === activeTopicId) || null,
    [topics, activeTopicId]
  );
  const isDeckView = !!activeTopic;
  const currentPanelMode: SubjectPanelMode = activeTopic
    ? (editorOpen ? 'editor' : 'deck')
    : 'subject';
  const allSessionTopicsSelected = useMemo(
    () => topicIds.length > 0 && topicIds.every(topicId => selectedTopicIds.has(topicId)),
    [topicIds, selectedTopicIds]
  );
  const allBulkTopicsSelected = useMemo(
    () => topicIds.length > 0 && topicIds.every(topicId => topicSelectedIds.has(topicId)),
    [topicIds, topicSelectedIds]
  );
  const selectedTopics = useMemo(
    () => topics.filter(topic => selectedTopicIds.has(String(topic.id || '').trim())),
    [topics, selectedTopicIds]
  );
  const availableSessionCards = useMemo(
    () => selectedTopics.reduce((sum, topic) => sum + toCounterInt(topic.cardCount), 0),
    [selectedTopics]
  );

  const subjectProgress = useMemo<TopicProgressCounts>(() => {
    return topics.reduce((aggregate, topic) => ({
      mastered: aggregate.mastered + toCounterInt(topic.progressCounts.mastered),
      correct: aggregate.correct + toCounterInt(topic.progressCounts.correct),
      partial: aggregate.partial + toCounterInt(topic.progressCounts.partial),
      wrong: aggregate.wrong + toCounterInt(topic.progressCounts.wrong),
      notAnswered: aggregate.notAnswered + toCounterInt(topic.progressCounts.notAnswered)
    }), emptyProgressCounts());
  }, [topics]);

  const totalCardsInSubject = useMemo(
    () => topics.reduce((sum, topic) => sum + toCounterInt(topic.cardCount), 0),
    [topics]
  );
  const hasWarmTopicPanelCache = useMemo(
    () => !!getFreshCachedTopicPanelState(String(activeSubject?.id || '').trim()),
    [activeSubject?.id]
  );
  const hasWarmTopicDeckCache = useMemo(
    () => !!getFreshCachedTopicDeckState(activeTopicId),
    [activeTopicId]
  );

  const loadTopics = useCallback(async (showLoader = true) => {
    const activeSubjectId = String(activeSubject?.id || '').trim();
    if (!activeSubjectId) {
      setTopics([]);
      setTopicsError('');
      setTopicsLoading(false);
      return;
    }

    const execute = async () => {
      setTopicsLoading(true);
      setTopicsError('');
      try {
        let topicRows: TopicRecord[] = [];
        let topicApiError: unknown = null;
        let topicFallbackUsed = false;
        try {
          topicRows = await getTopicsBySubject(activeSubjectId, true);
        } catch (error) {
          topicApiError = error;
        }
        if (!topicRows.length || topicApiError) {
          const fallbackRows = await getTopicsFromSupabaseIfConfigured(activeSubjectId, true);
          if (Array.isArray(fallbackRows)) {
            topicRows = fallbackRows;
            topicFallbackUsed = true;
          }
        }
        if (topicApiError && !topicFallbackUsed) throw topicApiError;

        const safeTopics = (Array.isArray(topicRows) ? topicRows : [])
          .filter(topic => String(topic?.id || '').trim().length > 0)
          .map(topic => ({
            ...topic,
            id: String(topic.id || '').trim(),
            subjectId: String(topic.subjectId || '').trim(),
            name: String(topic.name || '').trim() || 'Untitled topic'
          }));
        const safeTopicIds = safeTopics.map(topic => topic.id);
        let cards: CardRecord[] = [];
        if (safeTopicIds.length) {
          let cardsApiError: unknown = null;
          let cardsFallbackUsed = false;
          try {
            cards = await getCardsByTopicIds(safeTopicIds);
          } catch (error) {
            cardsApiError = error;
          }
          if (!cards.length || cardsApiError) {
            const fallbackCards = await getCardsFromSupabaseByTopicIdsIfConfigured(safeTopicIds);
            if (Array.isArray(fallbackCards)) {
              cards = fallbackCards;
              cardsFallbackUsed = true;
            }
          }
          if (cardsApiError && !cardsFallbackUsed) throw cardsApiError;
        }

        const cardsByTopicId = new Map<string, CardRecord[]>();
        let progressCardIds: string[] = [];

        cards.forEach(card => {
          const cardId = String(card?.id || '').trim();
          const topicId = String(card?.topicId || '').trim();
          if (!cardId || !topicId) return;
          const bucket = cardsByTopicId.get(topicId) || [];
          bucket.push(card);
          cardsByTopicId.set(topicId, bucket);
          progressCardIds.push(cardId);
        });
        progressCardIds = Array.from(new Set(progressCardIds));

        let progressRows: ProgressRecord[] = [];
        if (progressCardIds.length) {
          let progressApiError: unknown = null;
          let progressFallbackUsed = false;
          try {
            progressRows = await getProgressByCardIds(progressCardIds);
          } catch (error) {
            progressApiError = error;
          }
          if (!progressRows.length || progressApiError) {
            const fallbackProgress = await getProgressFromSupabaseByCardIdsIfConfigured(progressCardIds);
            if (Array.isArray(fallbackProgress)) {
              progressRows = fallbackProgress;
              progressFallbackUsed = true;
            }
          }
          if (progressApiError && !progressFallbackUsed) throw progressApiError;
        }
        const progressByCardId = new Map<string, ProgressRecord>();
        progressRows.forEach(progress => {
          const key = String(progress?.cardId || '').trim();
          if (!key) return;
          progressByCardId.set(key, progress);
        });

        const nextTopics: TopicPanelTopic[] = safeTopics.map(topic => {
          const topicCards = cardsByTopicId.get(topic.id) || [];
          const counts = emptyProgressCounts();
          let latestCardTs = 0;

          topicCards.forEach(card => {
            const cardId = String(card?.id || '').trim();
            const cardStateKey = getProgressStateKey(progressByCardId.get(cardId) || null);
            counts[cardStateKey] += 1;
            latestCardTs = Math.max(
              latestCardTs,
              toTimestamp(card?.meta?.updatedAt),
              toTimestamp(card?.updatedAt),
              toTimestamp(card?.meta?.createdAt),
              toTimestamp(card?.createdAt)
            );
          });

          const topicTimestamp = Math.max(
            toTimestamp(topic?.meta?.updatedAt),
            toTimestamp(topic?.updatedAt),
            toTimestamp(topic?.meta?.createdAt),
            toTimestamp(topic?.createdAt),
            latestCardTs
          );

          return {
            ...topic,
            cardCount: Number.isFinite(Number(topic.cardCount))
              ? Math.max(0, Math.trunc(Number(topic.cardCount)))
              : topicCards.length,
            progressCounts: counts,
            lastUpdatedTs: topicTimestamp
          };
        });

        nextTopics.sort((a, b) => {
          const tsDiff = Number(b.lastUpdatedTs || 0) - Number(a.lastUpdatedTs || 0);
          if (tsDiff !== 0) return tsDiff;
          return String(a.name || '').localeCompare(String(b.name || ''));
        });

        if (latestSubjectIdRef.current !== activeSubjectId) return;
        const validTopicIdSet = new Set(nextTopics.map(topic => topic.id));
        setCachedTopicPanelState(activeSubjectId, nextTopics);
        setTopics(nextTopics);
        setSelectedTopicIds(prev => {
          const retained = Array.from(prev).filter(topicId => validTopicIdSet.has(topicId));
          return new Set(retained);
        });
        setTopicSelectedIds(prev => {
          const retained = Array.from(prev).filter(topicId => validTopicIdSet.has(topicId));
          return new Set(retained);
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setTopicsError(`Could not load topics: ${message}`);
        setTopics([]);
      } finally {
        setTopicsLoading(false);
      }
    };

    if (showLoader) {
      await withTask(() => execute(), 'Loading topics...');
      return;
    }
    await execute();
  }, [activeSubject?.id, withTask]);

  const loadTopicDeck = useCallback(async (topicId: string, showLoader = true) => {
    const safeTopicId = String(topicId || '').trim();
    if (!safeTopicId) {
      setDeckCards([]);
      setDeckProgressByCardId({});
      setDeckError('');
      setDeckLoading(false);
      return;
    }

    const execute = async () => {
      setDeckLoading(true);
      setDeckError('');
      try {
        let cards: TopicDeckCardRecord[] = [];
        let cardsApiError: unknown = null;
        let cardsFallbackUsed = false;
        try {
          cards = await getCardsByTopicIds([safeTopicId]) as TopicDeckCardRecord[];
        } catch (error) {
          cardsApiError = error;
        }
        if (!cards.length || cardsApiError) {
          const fallbackCards = await getCardsFromSupabaseByTopicIdsIfConfigured([safeTopicId]);
          if (Array.isArray(fallbackCards)) {
            cards = fallbackCards as TopicDeckCardRecord[];
            cardsFallbackUsed = true;
          }
        }
        if (cardsApiError && !cardsFallbackUsed) throw cardsApiError;

        const safeCards = cards
          .filter(card => String(card?.id || '').trim().length > 0)
          .map(card => ({
            ...card,
            id: String(card.id || '').trim(),
            topicId: String(card.topicId || '').trim()
          }))
          .sort((left, right) => (
            Math.max(
              toTimestamp(right?.meta?.createdAt),
              toTimestamp(right?.createdAt),
              toTimestamp(right?.meta?.updatedAt),
              toTimestamp(right?.updatedAt)
            ) - Math.max(
              toTimestamp(left?.meta?.createdAt),
              toTimestamp(left?.createdAt),
              toTimestamp(left?.meta?.updatedAt),
              toTimestamp(left?.updatedAt)
            )
          ));

        const cardIds = safeCards.map(card => card.id);
        let progressRows: ProgressRecord[] = [];
        if (cardIds.length) {
          let progressApiError: unknown = null;
          let progressFallbackUsed = false;
          try {
            progressRows = await getProgressByCardIds(cardIds);
          } catch (error) {
            progressApiError = error;
          }
          if (!progressRows.length || progressApiError) {
            const fallbackProgress = await getProgressFromSupabaseByCardIdsIfConfigured(cardIds);
            if (Array.isArray(fallbackProgress)) {
              progressRows = fallbackProgress;
              progressFallbackUsed = true;
            }
          }
          if (progressApiError && !progressFallbackUsed) throw progressApiError;
        }

        if (latestDeckTopicIdRef.current !== safeTopicId) return;

        const nextProgressByCardId = progressRows.reduce<Record<string, ProgressRecord>>((accumulator, progress) => {
          const cardId = String(progress?.cardId || '').trim();
          if (!cardId) return accumulator;
          accumulator[cardId] = progress;
          return accumulator;
        }, {});
        const nextDeckData: TopicDeckCacheData = {
          cards: safeCards,
          progressByCardId: nextProgressByCardId
        };
        setCachedTopicDeckState(safeTopicId, nextDeckData);
        setDeckCards(nextDeckData.cards);
        setDeckProgressByCardId(nextDeckData.progressByCardId);
        setDeckSelectedCardIds(prev => {
          const validCardIds = new Set(nextDeckData.cards.map(card => card.id));
          return new Set(Array.from(prev).filter(cardId => validCardIds.has(cardId)));
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setDeckError(`Could not load cards: ${message}`);
        setDeckCards([]);
        setDeckProgressByCardId({});
      } finally {
        setDeckLoading(false);
      }
    };

    if (showLoader) {
      await withTask(() => execute(), 'Loading cards...');
      return;
    }
    await execute();
  }, [withTask]);

  useEffect(() => {
    const activeSubjectId = String(activeSubject?.id || '').trim();
    const cached = getFreshCachedTopicPanelState(activeSubjectId);
    if (!cached) return;
    setTopics(cached);
    setTopicsError('');
    setTopicsLoading(false);
  }, [activeSubject?.id]);

  useEffect(() => {
    latestSubjectIdRef.current = String(activeSubject?.id || '').trim();
  }, [activeSubject?.id]);

  useEffect(() => {
    latestDeckTopicIdRef.current = activeTopicId;
  }, [activeTopicId]);

  useEffect(() => {
    if (!activeTopic) return;
    lastDeckTopicIdRef.current = String(activeTopic.id || '').trim();
    lastDeckTopicNameRef.current = String(activeTopic.name || '').trim() || 'Topic';
  }, [activeTopic]);

  useEffect(() => {
    setSelectedTopicIds(new Set());
    setTopicSelectedIds(new Set());
    setTopicSelectionMode(false);
    setActiveTopicId('');
    setDeckCards([]);
    setDeckProgressByCardId({});
    setDeckError('');
    setDeckLoading(false);
    setDeckSelectionMode(false);
    setDeckSelectedCardIds(new Set());
    setEditorOpen(false);
    setEditorSidebarOpen(window.innerWidth > 980);
    setEditorShortcutsOpen(false);
    setEditorSaving(false);
    setSessionSizeManualOverride(false);
    setSessionSize(DEFAULT_SESSION_SIZE);
    setTopicName('');
    setPanelMessage('');
    lastDeckTopicIdRef.current = '';
    lastDeckTopicNameRef.current = '';
  }, [activeSubject?.id]);

  useEffect(() => {
    if (!activeSubject) return;
    if (hasWarmTopicPanelCache) return;
    const activeSubjectId = String(activeSubject?.id || '').trim();
    const queryPath = `/api/topics?subjectId=${encodeURIComponent(activeSubjectId)}&includeCounts=1`;
    const shouldShowLoader = !hasFreshApiQueryCache(queryPath);
    void loadTopics(shouldShowLoader);
  }, [activeSubject, hasWarmTopicPanelCache, loadTopics]);

  useEffect(() => {
    if (availableSessionCards <= 0) {
      setSessionSize(0);
      return;
    }
    setSessionSize(previous => {
      if (!sessionSizeManualOverride || previous <= 0) {
        return Math.min(DEFAULT_SESSION_SIZE, availableSessionCards);
      }
      return Math.min(Math.max(previous, 1), availableSessionCards);
    });
  }, [availableSessionCards, sessionSizeManualOverride]);

  useEffect(() => {
    if (!activeTopicId) return;
    const cached = getFreshCachedTopicDeckState(activeTopicId);
    if (!cached) return;
    setDeckCards(cached.cards);
    setDeckProgressByCardId(cached.progressByCardId);
    setDeckError('');
    setDeckLoading(false);
  }, [activeTopicId]);

  useEffect(() => {
    if (!activeTopicId) return;
    if (!activeTopic) {
      setActiveTopicId('');
      setDeckCards([]);
      setDeckProgressByCardId({});
      setDeckError('');
      setDeckLoading(false);
      setDeckSelectionMode(false);
      setDeckSelectedCardIds(new Set());
      setEditorOpen(false);
      setEditorShortcutsOpen(false);
      return;
    }
    if (hasWarmTopicDeckCache) return;
    const query = new URLSearchParams();
    query.append('topicId', activeTopicId);
    const shouldShowLoader = !hasFreshApiQueryCache(`/api/cards?${query.toString()}`);
    void loadTopicDeck(activeTopicId, shouldShowLoader);
  }, [activeTopic, activeTopicId, hasWarmTopicDeckCache, loadTopicDeck]);

  useEffect(() => {
    if (panelTransition || displayedPanelMode === currentPanelMode) return;
    const previousIndex = getSubjectPanelModeIndex(displayedPanelMode);
    const nextIndex = getSubjectPanelModeIndex(currentPanelMode);
    setPanelTransition({
      direction: nextIndex > previousIndex ? 'left' : 'right',
      active: false,
      leavingMode: displayedPanelMode,
      enteringMode: currentPanelMode
    });
  }, [currentPanelMode, displayedPanelMode, panelTransition]);

  useEffect(() => {
    if (!panelTransition || panelTransition.active) return;
    const frame = window.requestAnimationFrame(() => {
      setPanelTransition(previous => (previous ? { ...previous, active: true } : previous));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [panelTransition]);

  useEffect(() => {
    if (!panelTransition?.active) return;
    const timeout = window.setTimeout(() => {
      setDisplayedPanelMode(panelTransition.enteringMode);
      setPanelTransition(null);
    }, TOPIC_VIEW_SLIDE_MS);
    return () => window.clearTimeout(timeout);
  }, [panelTransition]);

  useEffect(() => {
    setSidebarForcedHidden?.(currentPanelMode === 'editor');
    return () => {
      setSidebarForcedHidden?.(false);
    };
  }, [currentPanelMode, setSidebarForcedHidden]);

  const handleAddTopic = async () => {
    const activeSubjectId = String(activeSubject?.id || '').trim();
    const safeName = String(topicName || '').trim();
    if (!activeSubjectId) {
      setPanelMessage('Pick a subject first.');
      return;
    }
    if (!safeName) return;
    const nowIso = new Date().toISOString();
    setIsMutating(true);
    try {
      invalidateCachedTopicPanelState(activeSubjectId);
      await withTask(async () => {
        await upsertTopic({
          id: createId(),
          subjectId: activeSubjectId,
          name: safeName,
          createdAt: nowIso,
          updatedAt: nowIso,
          meta: {
            createdAt: nowIso,
            updatedAt: nowIso
          }
        });
      }, 'Adding topic...');
      setTopicName('');
      setPanelMessage('');
      await loadTopics(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPanelMessage(`Could not add topic: ${message}`);
    } finally {
      setIsMutating(false);
    }
  };

  const handleTopicNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void handleAddTopic();
  };

  const handleToggleTopicSelectionMode = () => {
    setTopicSelectionMode(prev => {
      const next = !prev;
      if (!next) setTopicSelectedIds(new Set());
      return next;
    });
  };

  const handleToggleSessionTopic = (topicId: string, selected: boolean) => {
    setSelectedTopicIds(prev => {
      const next = new Set(prev);
      if (selected) next.add(topicId);
      else next.delete(topicId);
      return next;
    });
  };

  const handleToggleBulkTopic = (topicId: string, selected: boolean) => {
    setTopicSelectedIds(prev => {
      const next = new Set(prev);
      if (selected) next.add(topicId);
      else next.delete(topicId);
      return next;
    });
  };

  const handleSelectAllSessionTopics = () => {
    if (!topicIds.length) return;
    if (allSessionTopicsSelected) {
      setSelectedTopicIds(new Set());
      return;
    }
    setSelectedTopicIds(new Set(topicIds));
  };

  const handleSelectAllBulkTopics = () => {
    if (!topicIds.length) return;
    if (allBulkTopicsSelected) {
      setTopicSelectedIds(new Set());
      return;
    }
    setTopicSelectedIds(new Set(topicIds));
  };

  const handleDeleteSelectedTopics = async () => {
    const ids = Array.from(topicSelectedIds).map(topicId => String(topicId || '').trim()).filter(Boolean);
    if (!ids.length) return;
    const label = ids.length === 1 ? 'this topic' : `these ${ids.length} topics`;
    if (!window.confirm(`Delete ${label} and all cards inside?`)) return;

    setIsMutating(true);
    try {
      invalidateCachedTopicPanelState(String(activeSubject?.id || '').trim());
      ids.forEach(topicId => invalidateCachedTopicDeckState(topicId));
      await withTask(async () => {
        const cardsToDelete = await getCardsByTopicIds(ids);
        for (const card of cardsToDelete) {
          const cardId = String(card?.id || '').trim();
          if (!cardId) continue;
          await Promise.allSettled([
            deleteProgressByCardId(cardId),
            deleteCardById(cardId)
          ]);
        }
        for (const topicId of ids) {
          await deleteTopicById(topicId);
        }
      }, 'Deleting topics...');
      setTopicSelectionMode(false);
      setTopicSelectedIds(new Set());
      setSelectedTopicIds(prev => {
        const next = new Set(prev);
        ids.forEach(topicId => next.delete(topicId));
        return next;
      });
      if (ids.includes(String(activeTopic?.id || '').trim())) {
        setActiveTopicId('');
        setDeckCards([]);
        setDeckProgressByCardId({});
        setDeckError('');
        setDeckLoading(false);
        setDeckSelectionMode(false);
        setDeckSelectedCardIds(new Set());
      }
      setPanelMessage('');
      await loadTopics(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPanelMessage(`Could not delete selected topics: ${message}`);
    } finally {
      setIsMutating(false);
    }
  };

  const handleOpenTopicDeck = (topicId: string) => {
    const safeTopicId = String(topicId || '').trim();
    if (!safeTopicId) return;
    setPanelMessage('');
    setDeckSelectionMode(false);
    setDeckSelectedCardIds(new Set());
    setEditorOpen(false);
    setEditorShortcutsOpen(false);
    setActiveTopicId(safeTopicId);
  };

  const handleBackToTopics = () => {
    setPanelMessage('');
    setDeckSelectionMode(false);
    setDeckSelectedCardIds(new Set());
    setEditorOpen(false);
    setEditorShortcutsOpen(false);
    setActiveTopicId('');
  };

  const handleOpenCreateCardEditor = () => {
    if (!activeTopic) return;
    setPanelMessage('');
    setEditorShortcutsOpen(false);
    setEditorSidebarOpen(window.innerWidth > 980);
    setEditorOpen(true);
  };

  const handleBackToDeckFromEditor = () => {
    setPanelMessage('');
    setEditorShortcutsOpen(false);
    setEditorOpen(false);
  };

  const handleToggleDeckCardSelection = (cardId: string, nextSelected: boolean) => {
    setDeckSelectedCardIds(prev => {
      const next = new Set(prev);
      if (nextSelected) next.add(cardId);
      else next.delete(cardId);
      return next;
    });
  };

  const handleDeleteCard = async (cardId: string) => {
    const safeCardId = String(cardId || '').trim();
    const safeTopicId = String(activeTopic?.id || '').trim();
    if (!safeCardId || !safeTopicId) return;
    if (!window.confirm('Delete this flashcard?')) return;

    setIsMutating(true);
    try {
      invalidateCachedTopicDeckState(safeTopicId);
      invalidateCachedTopicPanelState(String(activeSubject?.id || '').trim());
      await withTask(async () => {
        await Promise.allSettled([
          deleteProgressByCardId(safeCardId),
          deleteCardById(safeCardId)
        ]);
      }, 'Deleting card...');
      setDeckSelectedCardIds(prev => {
        const next = new Set(prev);
        next.delete(safeCardId);
        return next;
      });
      setPanelMessage('');
      await Promise.all([
        loadTopicDeck(safeTopicId, false),
        loadTopics(false)
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPanelMessage(`Could not delete card: ${message}`);
    } finally {
      setIsMutating(false);
    }
  };

  const handleDeleteSelectedCards = async () => {
    const safeTopicId = String(activeTopic?.id || '').trim();
    const ids = Array.from(deckSelectedCardIds).map(cardId => String(cardId || '').trim()).filter(Boolean);
    if (!safeTopicId || !ids.length) return;
    const label = ids.length === 1 ? 'this flashcard' : `these ${ids.length} flashcards`;
    if (!window.confirm(`Delete ${label}?`)) return;

    setIsMutating(true);
    try {
      invalidateCachedTopicDeckState(safeTopicId);
      invalidateCachedTopicPanelState(String(activeSubject?.id || '').trim());
      await withTask(async () => {
        for (const cardId of ids) {
          await Promise.allSettled([
            deleteProgressByCardId(cardId),
            deleteCardById(cardId)
          ]);
        }
      }, 'Deleting cards...');
      setDeckSelectionMode(false);
      setDeckSelectedCardIds(new Set());
      setPanelMessage('');
      await Promise.all([
        loadTopicDeck(safeTopicId, false),
        loadTopics(false)
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPanelMessage(`Could not delete selected cards: ${message}`);
    } finally {
      setIsMutating(false);
    }
  };

  const handleCreateCard = async (payload: TopicCardEditorPayload): Promise<boolean> => {
    const safeTopicId = String(activeTopic?.id || '').trim();
    if (!safeTopicId) {
      setPanelMessage('Pick a topic first.');
      return false;
    }

    const safePrompt = String(payload.prompt || '').trim();
    const safeAnswer = String(payload.answer || '').trim();
    if (!safePrompt || !safeAnswer) return false;

    const createdAt = new Date().toISOString();
    const allOptions = [
      {
        text: safeAnswer,
        correct: payload.optionsRequireOrder ? true : payload.primaryAnswerCorrect,
        order: 1
      },
      ...payload.options
        .map((option, index) => ({
          text: String(option.text || '').trim(),
          correct: payload.optionsRequireOrder ? true : option.correct,
          order: index + 2
        }))
        .filter(option => option.text)
    ];
    const hasMcqOptions = allOptions.length > 1;

    setEditorSaving(true);
    setIsMutating(true);
    try {
      invalidateCachedTopicDeckState(safeTopicId);
      invalidateCachedTopicPanelState(String(activeSubject?.id || '').trim());
      await upsertCard({
        id: createId(),
        topicId: safeTopicId,
        type: hasMcqOptions ? 'mcq' : 'qa',
        textAlign: payload.questionTextAlign,
        questionTextAlign: payload.questionTextAlign,
        answerTextAlign: payload.answerTextAlign,
        optionsTextAlign: payload.optionsTextAlign,
        prompt: safePrompt,
        answer: safeAnswer,
        options: hasMcqOptions ? allOptions : [],
        optionsRequireOrder: hasMcqOptions ? payload.optionsRequireOrder : false,
        createdAt,
        updatedAt: createdAt,
        meta: {
          createdAt,
          updatedAt: createdAt
        }
      });
      setPanelMessage('');
      await Promise.all([
        loadTopicDeck(safeTopicId, false),
        loadTopics(false)
      ]);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPanelMessage(`Could not create card: ${message}`);
      return false;
    } finally {
      setEditorSaving(false);
      setIsMutating(false);
    }
  };

  const topicListTitle = topics.length === 1 ? 'Topic' : 'Topics';
  const topicCountWord = topics.length === 1 ? 'topic' : 'topics';
  const cardsWord = totalCardsInSubject === 1 ? 'card' : 'cards';
  const selectedTopicsWord = topicSelectedIds.size === 1 ? 'topic' : 'topics';
  const sessionFilterSummaryText = selectedTopics.length
    ? `All cards • ${availableSessionCards} available • session size ${sessionSize}`
    : 'Choose topics to enable a study session.';
  const resolvedDeckTopicId = String(activeTopic?.id || '').trim() || lastDeckTopicIdRef.current || 'topic';
  const displayedDeckTopicName = String(activeTopic?.name || '').trim() || lastDeckTopicNameRef.current || 'Topic';
  const deckHeaderRightSlot = (
    <div id="topicDeckHeaderActions" className="topic-deck-header-actions">
      <div
        id="deckTopicCardCount"
        className={`tiny deck-topic-card-count${deckCards.length ? '' : ' hidden'}`}
      >
        {`${deckCards.length} ${deckCards.length === 1 ? 'card' : 'cards'}`}
      </div>
      <AppButton
        id="toggleCardSelectBtn"
        className={`btn select-cards-btn${deckSelectionMode ? ' active' : ''}`}
        rect
        icon={<CheckOutlined />}
        ariaLabel="Select cards"
        title="Select cards"
        onClick={() => {
          setDeckSelectionMode(prev => {
            const next = !prev;
            if (!next) setDeckSelectedCardIds(new Set());
            return next;
          });
        }}
      />
      <AppButton
        id="openTopicEditBtn"
        className="btn select-cards-btn topic-more-btn"
        rect
        icon={<EditOutlined />}
        ariaLabel="Rename topic"
        title="Rename topic"
        onClick={() => setPanelMessage('Topic rename dialog migration is pending.')}
      />
      <AppButton
        id="openCreateCardBtn"
        className="btn select-cards-btn create-card-icon-btn"
        rect
        icon={<PlusOutlined />}
        ariaLabel="Create flashcard"
        title="Create flashcard"
        style={{ backgroundColor: '#22c55e', color: '#062314' }}
        onClick={handleOpenCreateCardEditor}
      />
    </div>
  );
  const editorHeaderRightSlot = (
    <div id="editorHeaderActions" style={{ display: 'inline-flex', gap: 'var(--s8)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <AppButton
        id="openEditorIntroBtn"
        className="btn editor-shortcuts-btn"
        icon={<InfoCircleOutlined />}
        style={{ minHeight: '40px', fontWeight: 400, borderRadius: '12px' }}
        onClick={() => setEditorShortcutsOpen(true)}
      >
        Shortcuts
      </AppButton>
      <AppButton
        id="toggleEditorSidebarBtn"
        className="btn editor-sidebar-toggle"
        icon={<UnorderedListOutlined />}
        style={{ minHeight: '40px', fontWeight: 400, borderRadius: '12px' }}
        onClick={() => setEditorSidebarOpen(previous => !previous)}
      >
        Cards
      </AppButton>
    </div>
  );
  const subjectPanelContent = (
    <div id="subjectPanelContent" className="section">
      {panelMessage ? <div id="subjectPanelMessage" className="topic-status-line tiny">{panelMessage}</div> : null}

      <div className="subject-progress-panel" id="subjectProgressPanel">
        <div id="subjectProgressHeader" className="subject-progress-header">
          <h3 id="subjectProgressTitle" className="subject-progress-title">Subject Progress</h3>
          <span className="tiny subject-progress-meta" id="subjectProgressMeta">
            {`${totalCardsInSubject} ${cardsWord}`}
          </span>
        </div>
        <div id="subjectProgressBarWrap" className="subject-progress-bar-wrap">
          <TopicProgressStrip
            counts={subjectProgress}
            idBase="subjectProgressStrip"
            wrapperId="subjectProgressStrip"
            wrapperClassName=""
            barClassName="daily-overview-segment-bar subject-progress-segment-bar topic-progress-bar"
            legendClassName="tiny daily-overview-segment-legend topic-progress-legend"
            barId="subjectProgressBar"
            legendId="subjectProgressLegend"
            compactLegend={false}
          />
        </div>
      </div>

      <div id="studySelectionSection" className="study-selection section">
        <h3 id="studySelectionTitle">Study Session</h3>
        <div id="studySelectionGrid" className="grid two study-selection-grid">
          <div id="studySelectionSessionSizeCard" className="study-selection-card size">
            <label id="sessionSizeLabel">Session Size</label>
            <TopicSessionSizeCounter
              idBase="topicSessionSizeCounter"
              value={sessionSize}
              max={availableSessionCards}
              onChange={nextValue => {
                setSessionSizeManualOverride(true);
                setSessionSize(nextValue);
              }}
            />
            <div id="sessionSizeHelp" className="tiny">Pick how many cards to study this session.</div>
          </div>
          <div id="selectedTopicsCard" className="study-selection-card selected-topics-card">
            <label id="selectedTopicsHeading" className="selected-topics-heading">Selected Topics</label>
            <div
              id="selectedTopicsSummary"
              className={`selected-topics-summary${selectedTopics.length ? '' : ' is-empty'}`}
            >
              {selectedTopics.length
                ? selectedTopics.map(topic => {
                  const topicIdSuffix = toDomIdSuffix(String(topic.id || ''));
                  return (
                    <span
                      key={topic.id}
                      id={`selectedTopicPill-${topicIdSuffix}`}
                      className="study-topic-pill"
                      title={topic.name}
                    >
                      {topic.name}
                    </span>
                  );
                })
                : 'Choose topics below (you can mix multiple).'}
            </div>
          </div>
        </div>
        <div id="studySessionActions" className="study-session-actions">
          <AppButton
            id="startSessionBtn"
            className="btn"
            disabled={selectedTopics.length <= 0 || availableSessionCards <= 0}
            onClick={() => {
              setPanelMessage('Study session route is not migrated yet. Topic/session selection is ready.');
            }}
          >
            ▶ Start Session
          </AppButton>
          <AppButton
            id="openSessionFilterBtn"
            className="btn"
            icon={<FilterOutlined />}
            onClick={() => setPanelMessage('Session filter dialog migration is pending.')}
          >
            Filter
          </AppButton>
        </div>
        <div className="tiny session-filter-summary" id="sessionFilterSummary">{sessionFilterSummaryText}</div>
      </div>

      <div id="addTopicSection" className="section topic-input-section">
        <h3 id="addTopicTitle">Add Topic</h3>
        <div id="topicInputWrap" className="topic-input-wrap">
          <input
            id="topicName"
            className="topic-input"
            placeholder="e.g., Thermodynamics"
            value={topicName}
            onChange={event => setTopicName(event.target.value)}
            onKeyDown={handleTopicNameKeyDown}
          />
          <AppButton
            id="addTopicBtn"
            className="btn create-card-icon-btn topic-add-btn"
            icon={<PlusOutlined />}
            ariaLabel="Add topic"
            title="Add topic"
            disabled={isMutating}
            style={{ backgroundColor: '#22c55e', color: '#062314' }}
            onClick={() => void handleAddTopic()}
          />
        </div>
      </div>

      <div id="topicListHead" className="topic-list-head">
        <div id="topicListTitleWrap" className="topic-list-title-wrap">
          <h3 id="topicListTitle" className="topic-list-title">{topicListTitle}</h3>
          <span id="topicListTotalCards" className="tiny topic-list-total-cards">{`${topics.length} ${topicCountWord}`}</span>
        </div>
        <div id="topicListActions" className="topic-list-actions">
          <AppButton
            className="btn select-cards-btn topic-search-btn scale"
            id="openTopicSearchBtn"
            ariaLabel="Search cards"
            title="Search cards"
            icon={<SearchOutlined />}
            onClick={() => setPanelMessage('Topic search dialog migration is pending.')}
          />
          <AppButton
            className={`btn select-cards-btn${allSessionTopicsSelected ? ' active' : ''}`}
            id="selectAllSessionTopicsBtn"
            disabled={!topics.length}
            onClick={handleSelectAllSessionTopics}
          >
            All
          </AppButton>
          <AppButton
            className={`btn select-cards-btn${topicSelectionMode ? ' active' : ''}`}
            id="toggleTopicSelectBtn"
            ariaLabel="Select topics"
            title="Select topics"
            icon={<CheckOutlined />}
            onClick={handleToggleTopicSelectionMode}
          />
        </div>
      </div>

      <div className={`topic-bulk-actions${topicSelectionMode ? '' : ' hidden'}`} id="topicBulkActions">
        <div className="tiny" id="topicSelectionCount">{`${topicSelectedIds.size} ${selectedTopicsWord} selected`}</div>
        <AppButton
          className={`btn topic-all-btn${allBulkTopicsSelected ? ' active' : ''}`}
          id="selectAllBulkTopicsBtn"
          disabled={!topics.length}
          onClick={handleSelectAllBulkTopics}
        >
          All
        </AppButton>
        <AppButton
          className="btn"
          id="moveSelectedTopicsBtn"
          disabled={topicSelectedIds.size <= 0}
          onClick={() => setPanelMessage('Move selected topics dialog migration is pending.')}
        >
          Move
        </AppButton>
        <AppButton
          className="btn red"
          id="deleteSelectedTopicsBtn"
          icon={<DeleteOutlined />}
          disabled={topicSelectedIds.size <= 0 || isMutating}
          onClick={() => void handleDeleteSelectedTopics()}
        >
          Delete
        </AppButton>
        <AppButton
          className="btn"
          id="cancelTopicSelectionBtn"
          onClick={() => {
            setTopicSelectionMode(false);
            setTopicSelectedIds(new Set());
          }}
        >
          Cancel
        </AppButton>
      </div>

      <div id="topicList" className="topic-list">
        {topicsLoading ? <div id="topicListLoading" className="tiny">Loading topics…</div> : null}
        {!topicsLoading && topicsError ? <div id="topicListError" className="tiny">{topicsError}</div> : null}
        {!topicsLoading && !topicsError && !topics.length ? <div id="topicListEmpty" className="tiny">No topics yet.</div> : null}
        {!topicsLoading && !topicsError && topics.map(topic => {
          const topicIdValue = String(topic.id || '').trim();
          const topicIdSuffix = toDomIdSuffix(topicIdValue);
          const isSelectedForSession = selectedTopicIds.has(topicIdValue);
          const isSelectedForBulk = topicSelectedIds.has(topicIdValue);
          const rowClassName = [
            'tile',
            'topic-tile',
            topicSelectionMode ? 'selection-mode' : '',
            !topicSelectionMode && isSelectedForSession ? 'selected' : '',
            topicSelectionMode && isSelectedForBulk ? 'selected-for-bulk' : ''
          ].filter(Boolean).join(' ');
          const checkboxId = topicSelectionMode
            ? `topicBulkCheckbox-${topicIdSuffix}`
            : `topicSessionCheckbox-${topicIdSuffix}`;

          return (
            <div
              key={topicIdValue}
              id={`topicTile-${topicIdSuffix}`}
              className={rowClassName}
              data-topic-id={topicIdValue}
              onClick={() => {
                if (topicSelectionMode) {
                  handleToggleBulkTopic(topicIdValue, !isSelectedForBulk);
                  return;
                }
                handleOpenTopicDeck(topicIdValue);
              }}
            >
              <div id={`topicTileCheck-${topicIdSuffix}`} className="tile-check">
                <div id={`topicTileMain-${topicIdSuffix}`} className="topic-tile-main">
                  <div id={`topicTileName-${topicIdSuffix}`} className="topic-tile-name">{topic.name}</div>
                  <div id={`topicTileCardCount-${topicIdSuffix}`} className="tiny topic-card-count">
                    {`${topic.cardCount} ${topic.cardCount === 1 ? 'card' : 'cards'}`}
                  </div>
                  <TopicProgressStrip
                    counts={topic.progressCounts}
                    idBase={`topicProgressStrip-${topicIdSuffix}`}
                    wrapperId={`topicProgressStrip-${topicIdSuffix}`}
                    barId={`topicProgressBar-${topicIdSuffix}`}
                    legendId={`topicProgressLegend-${topicIdSuffix}`}
                  />
                </div>
              </div>
              <label
                id={`topicSelectControl-${topicIdSuffix}`}
                className="card-select-control"
                htmlFor={checkboxId}
                onClick={event => event.stopPropagation()}
              >
                <input
                  id={checkboxId}
                  type="checkbox"
                  data-topic-id={topicSelectionMode ? undefined : topicIdValue}
                  aria-label={topicSelectionMode ? 'Select topic' : 'Select topic for study session'}
                  checked={topicSelectionMode ? isSelectedForBulk : isSelectedForSession}
                  onChange={event => {
                    if (topicSelectionMode) {
                      handleToggleBulkTopic(topicIdValue, event.target.checked);
                      return;
                    }
                    handleToggleSessionTopic(topicIdValue, event.target.checked);
                  }}
                />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
  const deckPanelContent = (
    <TopicDeckOverview
      topicId={resolvedDeckTopicId}
      panelMessage={panelMessage}
      cards={deckCards}
      progressByCardId={deckProgressByCardId}
      loading={deckLoading}
      error={deckError}
      selectionMode={deckSelectionMode}
      selectedCardIds={deckSelectedCardIds}
      onToggleCardSelection={handleToggleDeckCardSelection}
      onDeleteCard={cardId => void handleDeleteCard(cardId)}
      onDuplicateCard={() => setPanelMessage('Card duplication migration is pending.')}
      onMoveSelectedCards={() => setPanelMessage('Move selected cards dialog migration is pending.')}
      onDeleteSelectedCards={() => void handleDeleteSelectedCards()}
      onCancelSelection={() => {
        setDeckSelectionMode(false);
        setDeckSelectedCardIds(new Set());
      }}
      onEditCard={() => setPanelMessage('Card editor migration is pending.')}
      getProgressStateKey={getProgressStateKey}
    />
  );
  const editorPanelContent = (
    <TopicCardEditorPanel
      topicName={displayedDeckTopicName}
      cards={deckCards}
      panelMessage={panelMessage}
      saving={editorSaving || isMutating}
      sidebarOpen={editorSidebarOpen}
      shortcutsOpen={editorShortcutsOpen}
      onCloseShortcuts={() => setEditorShortcutsOpen(false)}
      onCloseSidebar={() => setEditorSidebarOpen(false)}
      onOpenRecentQuestionImages={() => setPanelMessage('Recent question images are not migrated yet.')}
      onOpenRecentAnswerImages={() => setPanelMessage('Recent answer images are not migrated yet.')}
      onSubmit={handleCreateCard}
    />
  );
  const subjectPanelNode = (
    <AppPanel
      id="subjectAppPanel"
      headerWrapId="subjectAppPanelHeaderWrap"
      sectionsId="subjectAppPanelSections"
      sectionIdPrefix="subjectAppPanelSection"
      style={panelStyle}
      header={(
        <AppHeader
          id="subjectPanelHeader"
          titleId="subjectPanelHeaderTitle"
          leftSlotId="subjectPanelHeaderLeftSlot"
          rightSlotId="subjectPanelHeaderRightSlot"
          title={String(activeSubject?.name || 'Subject')}
          leftSlot={(
            <AppButton
              id="subjectPanelSidebarToggleBtn"
              rect
              icon={<MenuOutlined />}
              ariaLabel="Toggle sidebar"
              title="Toggle sidebar"
              onClick={() => toggleSidebar?.()}
            />
          )}
        />
      )}
      sections={[
        {
          framed: false,
          content: subjectPanelContent
        }
      ]}
    />
  );
  const deckPanelNode = (
    <AppPanel
      id="topicDeckAppPanel"
      headerWrapId="topicDeckAppPanelHeaderWrap"
      sectionsId="topicDeckAppPanelSections"
      sectionIdPrefix="topicDeckAppPanelSection"
      style={panelStyle}
      header={(
        <AppHeader
          id="topicDeckHeader"
          titleId="topicDeckHeaderTitle"
          leftSlotId="topicDeckHeaderLeftSlot"
          rightSlotId="topicDeckHeaderRightSlot"
          title={displayedDeckTopicName}
          leftSlot={(
            <AppButton
              id="backToTopicsBtn"
              rect
              icon={<ArrowLeftOutlined />}
              ariaLabel="Back to topics"
              title="Back to topics"
              onClick={handleBackToTopics}
            />
          )}
          rightSlot={deckHeaderRightSlot}
        />
      )}
      sections={[
        {
          framed: false,
          content: deckPanelContent
        }
      ]}
    />
  );
  const editorPanelNode = (
    <AppPanel
      id="editorAppPanel"
      headerWrapId="editorAppPanelHeaderWrap"
      sectionsId="editorAppPanelSections"
      sectionIdPrefix="editorAppPanelSection"
      style={panelStyle}
      header={(
        <AppHeader
          id="editorPanelHeader"
          titleId="editorPanelHeaderTitle"
          leftSlotId="editorPanelHeaderLeftSlot"
          rightSlotId="editorPanelHeaderRightSlot"
          title={displayedDeckTopicName}
          leftSlot={(
            <AppButton
              id="backToDeckBtn"
              rect
              icon={<ArrowLeftOutlined />}
              ariaLabel="Back to deck"
              title="Back to deck"
              onClick={handleBackToDeckFromEditor}
            />
          )}
          rightSlot={editorHeaderRightSlot}
        />
      )}
      sections={[
        {
          framed: false,
          content: editorPanelContent
        }
      ]}
    />
  );
  const renderPanelModeNode = (mode: SubjectPanelMode): ReactNode => {
    if (mode === 'editor') return editorPanelNode;
    if (mode === 'deck') return deckPanelNode;
    return subjectPanelNode;
  };
  const panelViewportNode = panelTransition ? (
    <div id="subjectPanelViewViewport" className="subject-panel-view-viewport">
      <div
        id="subjectPanelViewEntering"
        className="subject-panel-view-layer subject-panel-view-layer-entering"
        style={{
          transform: getSubjectPanelEnteringTransform(panelTransition.direction, panelTransition.active),
          opacity: getSubjectPanelEnteringOpacity(panelTransition.active),
          transitionDuration: `${TOPIC_VIEW_SLIDE_MS}ms`
        }}
      >
        {renderPanelModeNode(panelTransition.enteringMode)}
      </div>
      <div
        id="subjectPanelViewLeaving"
        className="subject-panel-view-layer subject-panel-view-layer-leaving"
        style={{
          transform: getSubjectPanelLeavingTransform(panelTransition.direction, panelTransition.active),
          opacity: getSubjectPanelLeavingOpacity(panelTransition.active),
          transitionDuration: `${TOPIC_VIEW_SLIDE_MS}ms`
        }}
      >
        {renderPanelModeNode(panelTransition.leavingMode)}
      </div>
    </div>
  ) : (
    <div id="subjectPanelViewActive" className="subject-panel-view-viewport">
      <div id="subjectPanelViewLayerActive" className="subject-panel-view-layer">
        {renderPanelModeNode(displayedPanelMode)}
      </div>
    </div>
  );

  if (subjectsLoading) return <section id="topicPanelLoading" className="topic-panel-legacy">Loading subject…</section>;
  if (subjectsError) return <section id="topicPanelError" className="topic-panel-legacy">{subjectsError}</section>;
  if (!activeSubject) return <section id="topicPanelNotFound" className="topic-panel-legacy">Subject not found.</section>;

  return (
    <section className="topic-panel-legacy" id="topicPanel" style={themeStyle}>
      {panelViewportNode}
    </section>
  );
}

function getSubjectPanelEnteringTransform(direction: SubjectPanelDirection, active: boolean): string {
  if (direction === 'left') return active ? 'translateX(0%)' : 'translateX(100%)';
  return active ? 'translateX(0%)' : 'translateX(-100%)';
}

function getSubjectPanelLeavingTransform(direction: SubjectPanelDirection, active: boolean): string {
  if (direction === 'left') return active ? 'translateX(-100%)' : 'translateX(0%)';
  return active ? 'translateX(100%)' : 'translateX(0%)';
}

function getSubjectPanelEnteringOpacity(active: boolean): number {
  return active ? 1 : 0.24;
}

function getSubjectPanelLeavingOpacity(active: boolean): number {
  return active ? 0.18 : 1;
}

function getSubjectPanelModeIndex(mode: SubjectPanelMode): number {
  if (mode === 'editor') return 2;
  if (mode === 'deck') return 1;
  return 0;
}
