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
 * @function createEmptyDailyReviewLatestStateCounts
 * @description Builds an empty map of current card-state counters for review analytics.
 */

function createEmptyDailyReviewLatestStateCounts() {
  return {
    mastered: 0,
    correct: 0,
    partial: 0,
    wrong: 0,
    inProgress: 0,
    notAnswered: 0
  };
}

/**
 * @function normalizeDailyReviewLatestStateKey
 * @description Normalizes a progress state key to a stable analytics key.
 */

function normalizeDailyReviewLatestStateKey(stateKey = '') {
  const raw = String(stateKey || '').trim().toLowerCase();
  if (raw === 'mastered') return 'mastered';
  if (raw === 'correct') return 'correct';
  if (raw === 'partial') return 'partial';
  if (raw === 'wrong') return 'wrong';
  if (raw === 'not-answered') return 'notAnswered';
  return 'inProgress';
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
    latestStateByCardId: new Map(),
    latestStateCounts: createEmptyDailyReviewLatestStateCounts(),
    dateByCardId: new Map(),
    dateKeys: [],
    selectedDateStart: 0,
    selectedDateEnd: 0,
    statusFilter: { ...DAILY_REVIEW_STATUS_FILTER_DEFAULT },
    todayStats: createEmptyDailyReviewTodayStats(),
    totalCards: 0,
    size: 0,
    activityStreakDays: 0,
    activityDaysTotal: 0
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
  renderDailyReviewAnalytics();
}

/**
 * @function escapeReviewChartText
 * @description Escapes text for analytics chart labels.
 */

function escapeReviewChartText(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @function buildDailyReviewPieGradient
 * @description Builds a conic-gradient string for pie charts.
 */

function buildDailyReviewPieGradient(segments = []) {
  const rows = Array.isArray(segments) ? segments.filter(seg => Number(seg?.value) > 0) : [];
  const total = rows.reduce((sum, seg) => sum + Number(seg.value || 0), 0);
  if (total <= 0) return 'conic-gradient(#2a3f66 0% 100%)';
  let acc = 0;
  const stops = rows.map(seg => {
    const start = (acc / total) * 100;
    acc += Number(seg.value || 0);
    const end = (acc / total) * 100;
    return `${seg.color} ${start.toFixed(3)}% ${end.toFixed(3)}%`;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

/**
 * @function buildDailyReviewAnalyticsSnapshot
 * @description Computes chart-friendly analytics from current review state and active filters.
 */

function buildDailyReviewAnalyticsSnapshot() {
  const selectedCardIds = getDailyReviewSelectedCardIds();
  const reviewStatusCounts = { green: 0, yellow: 0, red: 0 };
  selectedCardIds.forEach(cardId => {
    const status = getDailyReviewCardStatus(cardId);
    if (Object.prototype.hasOwnProperty.call(reviewStatusCounts, status)) {
      reviewStatusCounts[status] += 1;
    }
  });

  const today = dailyReviewState.todayStats || createEmptyDailyReviewTodayStats();
  const latest = dailyReviewState.latestStateCounts || createEmptyDailyReviewLatestStateCounts();

  const subjectRows = groupDailyReviewTopicsBySubject()
    .map(group => {
      const value = group.topics.reduce((sum, topic) => {
        return sum + getDailyReviewFilteredCardIdsByTopic(topic.topicId).length;
      }, 0);
      return {
        label: group.subjectName,
        value,
        color: normalizeHexColor(group.subjectAccent || '#60a5fa')
      };
    })
    .filter(row => row.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

  const topicRows = dailyReviewState.topics
    .map(topic => ({
      label: topic.topicName,
      value: getDailyReviewFilteredCardIdsByTopic(topic.topicId).length,
      color: normalizeHexColor(topic.subjectAccent || '#60a5fa')
    }))
    .filter(row => row.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

  return {
    selectedCount: selectedCardIds.length,
    reviewStatusCounts,
    todayAttempts: {
      correct: toCounterInt(today.correct),
      partial: toCounterInt(today.partial),
      wrong: toCounterInt(today.wrong)
    },
    latestStateCounts: {
      mastered: toCounterInt(latest.mastered),
      correct: toCounterInt(latest.correct),
      partial: toCounterInt(latest.partial),
      wrong: toCounterInt(latest.wrong),
      inProgress: toCounterInt(latest.inProgress),
      notAnswered: toCounterInt(latest.notAnswered)
    },
    subjectRows,
    topicRows
  };
}

/**
 * @function renderDailyReviewAnalyticsPieCard
 * @description Renders one pie-chart card for the review analytics area.
 */

function renderDailyReviewAnalyticsPieCard(title = '', segments = [], centerText = '', emptyText = 'No data yet') {
  const rows = Array.isArray(segments)
    ? segments
      .map(seg => ({
        label: String(seg?.label || '').trim(),
        value: toCounterInt(seg?.value),
        color: String(seg?.color || '#2a3f66')
      }))
      .filter(seg => seg.label)
    : [];
  const total = rows.reduce((sum, seg) => sum + seg.value, 0);
  const legendItems = rows.map(seg => `
      <li>
        <span class="review-analytics-dot" style="background:${seg.color};"></span>
        <span>${escapeReviewChartText(seg.label)}</span>
        <strong>${seg.value}</strong>
      </li>
    `).join('');
  if (total <= 0) {
    return `
      <article class="review-analytics-card">
        <h4>${escapeReviewChartText(title)}</h4>
        <div class="tiny review-analytics-empty">${escapeReviewChartText(emptyText)}</div>
      </article>
    `;
  }
  const pieBg = buildDailyReviewPieGradient(rows);
  return `
    <article class="review-analytics-card">
      <h4>${escapeReviewChartText(title)}</h4>
      <div class="review-analytics-pie-layout">
        <div class="review-analytics-pie" style="background:${pieBg};">
          <div class="review-analytics-pie-center">
            <strong>${total}</strong>
            <span>${escapeReviewChartText(centerText)}</span>
          </div>
        </div>
        <ul class="review-analytics-legend">${legendItems}</ul>
      </div>
    </article>
  `;
}

/**
 * @function renderDailyReviewAnalyticsBarCard
 * @description Renders one horizontal bar-chart card for the review analytics area.
 */

function renderDailyReviewAnalyticsBarCard(title = '', rows = [], maxRows = 6, emptyText = 'No data yet') {
  const sourceRows = Array.isArray(rows)
    ? rows
      .map(row => ({
        label: String(row?.label || '').trim(),
        value: toCounterInt(row?.value),
        color: String(row?.color || '#60a5fa')
      }))
      .filter(row => row.label && row.value > 0)
    : [];
  if (!sourceRows.length) {
    return `
      <article class="review-analytics-card">
        <h4>${escapeReviewChartText(title)}</h4>
        <div class="tiny review-analytics-empty">${escapeReviewChartText(emptyText)}</div>
      </article>
    `;
  }

  const safeMaxRows = Math.max(1, Math.trunc(Number(maxRows) || 1));
  const visibleRows = sourceRows.slice(0, safeMaxRows);
  if (sourceRows.length > safeMaxRows) {
    const otherValue = sourceRows.slice(safeMaxRows).reduce((sum, row) => sum + row.value, 0);
    if (otherValue > 0) visibleRows.push({ label: 'Other', value: otherValue, color: '#4b5f8d' });
  }
  const maxValue = Math.max(...visibleRows.map(row => row.value), 1);
  const rowsHtml = visibleRows.map(row => {
    const ratio = Math.max(4, (row.value / maxValue) * 100);
    return `
      <li class="review-analytics-bar-row">
        <span class="review-analytics-bar-label" title="${escapeReviewChartText(row.label)}">${escapeReviewChartText(row.label)}</span>
        <span class="review-analytics-bar-track">
          <span class="review-analytics-bar-fill" style="width:${ratio.toFixed(2)}%;background:${row.color};"></span>
        </span>
        <strong class="review-analytics-bar-value">${row.value}</strong>
      </li>
    `;
  }).join('');

  return `
    <article class="review-analytics-card">
      <h4>${escapeReviewChartText(title)}</h4>
      <ul class="review-analytics-bars">${rowsHtml}</ul>
    </article>
  `;
}

/**
 * @function renderDailyReviewAnalytics
 * @description Renders pie/bar analytics cards for the Daily Review panel.
 */

function renderDailyReviewAnalytics() {
  const container = el('dailyReviewAnalytics');
  if (!container) return;
  if (!dailyReviewState.ready) {
    container.innerHTML = '';
    updateDailyReviewAnalyticsVisibility();
    return;
  }

  const snapshot = buildDailyReviewAnalyticsSnapshot();
  const cards = [];
  cards.push(renderDailyReviewAnalyticsPieCard(
    'Review Selection (G/Y/R)',
    [
      { label: 'Correct', value: snapshot.reviewStatusCounts.green, color: '#22c55e' },
      { label: 'Not quite', value: snapshot.reviewStatusCounts.yellow, color: '#f59e0b' },
      { label: 'Wrong', value: snapshot.reviewStatusCounts.red, color: '#ef4444' }
    ],
    'cards',
    'No cards match current review filters.'
  ));
  cards.push(renderDailyReviewAnalyticsPieCard(
    'Today Attempts (C/P/W)',
    [
      { label: 'Correct', value: snapshot.todayAttempts.correct, color: '#22c55e' },
      { label: 'Not quite', value: snapshot.todayAttempts.partial, color: '#f59e0b' },
      { label: 'Wrong', value: snapshot.todayAttempts.wrong, color: '#ef4444' }
    ],
    'answers',
    'No saved answers today yet.'
  ));
  cards.push(renderDailyReviewAnalyticsPieCard(
    'Current State (All Answered)',
    [
      { label: 'Mastered', value: snapshot.latestStateCounts.mastered, color: '#14b8a6' },
      { label: 'Correct', value: snapshot.latestStateCounts.correct, color: '#22c55e' },
      { label: 'Not quite', value: snapshot.latestStateCounts.partial, color: '#f59e0b' },
      { label: 'Wrong', value: snapshot.latestStateCounts.wrong, color: '#ef4444' },
      { label: 'In progress', value: snapshot.latestStateCounts.inProgress, color: '#60a5fa' }
    ],
    'cards',
    'No answered cards available yet.'
  ));
  cards.push(renderDailyReviewAnalyticsBarCard(
    'Review Cards by Subject',
    snapshot.subjectRows,
    6,
    'No subject with matching cards.'
  ));
  cards.push(renderDailyReviewAnalyticsBarCard(
    'Review Cards by Topic',
    snapshot.topicRows,
    8,
    'No topic with matching cards.'
  ));

  container.innerHTML = cards.join('');
  updateDailyReviewAnalyticsVisibility();
}

/**
 * @function updateDailyReviewAnalyticsVisibility
 * @description Updates analytics container/toggle state and text.
 */

function updateDailyReviewAnalyticsVisibility() {
  const container = el('dailyReviewAnalytics');
  const toggleBtn = el('toggleDailyReviewAnalyticsBtn');
  if (container) {
    container.classList.toggle('is-collapsed', !dailyReviewAnalyticsExpanded);
  }
  if (!toggleBtn) return;
  toggleBtn.classList.toggle('is-collapsed', !dailyReviewAnalyticsExpanded);
  toggleBtn.setAttribute('aria-expanded', dailyReviewAnalyticsExpanded ? 'true' : 'false');
  toggleBtn.textContent = dailyReviewAnalyticsExpanded ? 'Hide charts' : 'Show charts';
}

/**
 * @function toggleDailyReviewAnalytics
 * @description Toggles review analytics open/closed with animated collapse.
 */

function toggleDailyReviewAnalytics() {
  dailyReviewAnalyticsExpanded = !dailyReviewAnalyticsExpanded;
  updateDailyReviewAnalyticsVisibility();
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
 * @function buildProgressActivityDayKeySet
 * @description Returns all day keys where the user recorded at least one answer across all progress rows.
 */

function buildProgressActivityDayKeySet(progressRecords = []) {
  const rows = Array.isArray(progressRecords) ? progressRecords : [];
  const dayKeys = new Set();
  rows.forEach(row => {
    const cardId = String(row?.cardId || '').trim();
    if (!cardId) return;
    const record = normalizeProgressRecord(row, cardId);
    Object.keys(record.byDay || {}).forEach(dayKey => {
      const day = normalizeDayProgress(record.byDay[dayKey]);
      const attempts = toCounterInt(day.correct) + toCounterInt(day.partial) + toCounterInt(day.wrong);
      if (attempts <= 0) return;
      const normalizedDay = normalizeDailyReviewDayKey(dayKey || day.lastAnsweredAt);
      if (normalizedDay) dayKeys.add(normalizedDay);
    });
  });
  return dayKeys;
}

/**
 * @function computeCurrentActivityStreakDays
 * @description Computes the number of consecutive active days ending today.
 */

function computeCurrentActivityStreakDays(activityDayKeys = new Set(), referenceDayKey = getTodayKey()) {
  const keys = activityDayKeys instanceof Set ? activityDayKeys : new Set();
  if (!keys.size) return 0;
  const startDay = normalizeDailyReviewDayKey(referenceDayKey);
  if (!startDay) return 0;
  let streak = 0;
  let cursor = new Date(`${startDay}T00:00:00`);
  if (!Number.isFinite(cursor.getTime())) return 0;
  while (true) {
    const key = getTodayKey(cursor);
    if (!keys.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * @function renderOverviewSegmentBar
 * @description Renders a single stacked-ratio bar with optional legend text.
 */

function renderOverviewSegmentBar(barEl, legendEl, segments = [], options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const rows = Array.isArray(segments)
    ? segments
      .map(seg => ({
        key: String(seg?.key || '').trim() || 'segment',
        label: String(seg?.label || '').trim() || 'Segment',
        value: toCounterInt(seg?.value),
        color: String(seg?.color || '#64748b')
      }))
      .filter(seg => seg.label.length > 0)
    : [];
  const total = rows.reduce((sum, seg) => sum + seg.value, 0);

  if (barEl) {
    if (total <= 0) {
      barEl.innerHTML = '<span class="daily-overview-segment-bar-empty">No answered cards yet.</span>';
      barEl.classList.add('is-empty');
      barEl.setAttribute('aria-label', String(opts.emptyLabel || 'No answered cards yet.'));
    } else {
      barEl.classList.remove('is-empty');
      const nonZeroRows = rows.filter(seg => seg.value > 0);
      barEl.innerHTML = nonZeroRows.map((seg, idx) => {
        const ratio = (seg.value / total) * 100;
        const isLast = idx === nonZeroRows.length - 1;
        return `
          <span class="daily-overview-segment daily-overview-segment-${escapeHTML(seg.key)}${isLast ? ' is-last' : ''}"
            style="width:${ratio.toFixed(3)}%;background:${escapeHTML(seg.color)};"
            title="${escapeHTML(seg.label)}: ${seg.value}"></span>
        `;
      }).join('');
      const ariaLabel = rows.map(seg => `${seg.label}: ${seg.value}`).join(', ');
      barEl.setAttribute('aria-label', ariaLabel);
    }
  }

  if (legendEl) {
    if (total <= 0) {
      legendEl.textContent = String(opts.emptyLegendText || 'No data yet.');
    } else {
      legendEl.innerHTML = rows.map(seg => `
        <span class="daily-overview-legend-item">
          <span class="daily-overview-legend-dot" style="background:${escapeHTML(seg.color)};"></span>
          <span>${escapeHTML(seg.label)}: ${seg.value}</span>
        </span>
      `).join('');
    }
  }
}

/**
 * @function renderDailyOverviewStatsCards
 * @description Renders the new two-field stats cards (state bar + current activity streak) on Home.
 */

function renderDailyOverviewStatsCards() {
  const grid = el('dailyOverviewStatsGrid');
  const bar = el('dailyOverviewStateBar');
  const legend = el('dailyOverviewStateLegend');
  const streakDaysEl = el('dailyOverviewStreakDays');
  const streakMetaEl = el('dailyOverviewStreakMeta');
  if (!grid || !bar || !legend || !streakDaysEl || !streakMetaEl) return;
  const latest = dailyReviewState.latestStateCounts || createEmptyDailyReviewLatestStateCounts();
  const mastered = toCounterInt(latest.mastered);
  const partially = toCounterInt(latest.correct) + toCounterInt(latest.partial) + toCounterInt(latest.inProgress);
  const wrong = toCounterInt(latest.wrong);
  const answeredTotal = mastered + partially + wrong;
  renderOverviewSegmentBar(bar, legend, [
    { key: 'mastered', label: 'Mastered', value: mastered, color: '#22c55e' },
    { key: 'partial', label: 'Partially', value: partially, color: '#f59e0b' },
    { key: 'wrong', label: 'Wrong', value: wrong, color: '#ef4444' }
  ], {
    emptyLabel: 'No answered cards yet.',
    emptyLegendText: 'No answered cards yet.'
  });
  const streakDays = toCounterInt(dailyReviewState.activityStreakDays);
  const activeDaysTotal = toCounterInt(dailyReviewState.activityDaysTotal);
  streakDaysEl.textContent = String(streakDays);
  if (streakDays > 0) {
    const dayWord = streakDays === 1 ? 'day' : 'days';
    streakMetaEl.textContent = `Active for ${streakDays} ${dayWord} in a row.`;
  } else if (activeDaysTotal > 0) {
    streakMetaEl.textContent = 'No active streak right now. Answer one card to restart it.';
  } else if (answeredTotal > 0) {
    const cardWord = answeredTotal === 1 ? 'card' : 'cards';
    streakMetaEl.textContent = `${answeredTotal} answered ${cardWord} so far. Your streak starts with today.`;
  } else {
    streakMetaEl.textContent = 'No streak yet. Answer your first card to start one.';
  }
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
  renderDailyOverviewStatsCards();
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
  const activityDayKeys = buildProgressActivityDayKeySet(rows);
  const activityStreakDays = computeCurrentActivityStreakDays(activityDayKeys, todayKey);

  const answeredCardIds = [];
  const statusByCardId = new Map();
  const latestStateByCardId = new Map();
  const latestStateCounts = createEmptyDailyReviewLatestStateCounts();
  const dateByCardId = new Map();
  rows.forEach(row => {
    const cardId = String(row?.cardId || '').trim();
    if (!cardId) return;
    const state = getCurrentProgressState(row, cardId);
    const latestStateKey = normalizeDailyReviewLatestStateKey(state.key);
    latestStateByCardId.set(cardId, latestStateKey);
    if (Object.prototype.hasOwnProperty.call(latestStateCounts, latestStateKey)) {
      latestStateCounts[latestStateKey] += 1;
    }
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
    latestStateByCardId,
    latestStateCounts,
    dateByCardId,
    dateKeys,
    selectedDateStart: 0,
    selectedDateEnd: Math.max(0, dateKeys.length - 1),
    statusFilter: { ...DAILY_REVIEW_STATUS_FILTER_DEFAULT },
    todayStats,
    totalCards,
    size: totalCards > 0 ? Math.min(DAILY_REVIEW_DEFAULT_SIZE, totalCards) : 0,
    activityStreakDays,
    activityDaysTotal: activityDayKeys.size
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
  try {
    const [subjects, topics] = await Promise.all([
      getAll('subjects', { uiBlocking: false }),
      getAll('topics', { uiBlocking: false })
    ]);
    const topicRows = Array.isArray(topics) ? topics : [];
    const topicIds = Array.from(new Set(
      topicRows.map(topic => String(topic?.id || '').trim()).filter(Boolean)
    ));

    const lightweightCards = topicIds.length
      ? await getCardPromptRefsByTopicIds(topicIds, {
        payloadLabel: 'progress-check-cards',
        uiBlocking: false
      })
      : [];

    const cardsById = new Map();
    (Array.isArray(lightweightCards) ? lightweightCards : []).forEach(card => {
      const cardId = String(card?.id || '').trim();
      if (!cardId || cardsById.has(cardId)) return;
      cardsById.set(cardId, card);
    });

    const progressRows = await getAll('progress', {
      uiBlocking: false
    });

    const subjectById = new Map(
      (subjects || []).map(subject => [String(subject?.id || '').trim(), String(subject?.name || '').trim()])
    );
    const topicById = new Map(
      topicRows.map(topic => [String(topic?.id || '').trim(), topic])
    );
    const progressByCardId = new Map(
      (progressRows || []).map(row => [String(row?.cardId || '').trim(), row])
    );

    progressCheckRowsCache = Array.from(cardsById.values()).map(card => {
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
  } catch (err) {
    console.error('Failed to render progress check table:', err);
    progressCheckRowsCache = [];
    initProgressCheckFilterState();
    closeProgressCheckHeaderMenu();
    meta.textContent = 'Could not load progress overview.';
    body.innerHTML = '<tr><td colspan="9" class="tiny">Could not load progress overview. Please try again.</td></tr>';
    renderProgressCheckHeaderStates();
  }
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

  const vw = Math.max(window.innerWidth, 320);
  const BASE_WIDTH = 1200;
  const scale = Math.min(1.2, Math.max(0.6, vw / BASE_WIDTH));

  const origin = { x: 0.5, y: 1.02 };
  const colors = ['#22c55e', '#38bdf8', '#f59e0b', '#ef4444', '#a78bfa', '#facc15', '#14b8a6'];
  const base = {
    origin,
    angle: 90,
    spread: 75*scale,
    startVelocity: 48,
    gravity: 1.05,
    ticks: 220,
    decay: 0.93,
    scalar: 1,
    colors
  };
  emit({ ...base, particleCount: 220 });
  setTimeout(() => emit({
    ...base,
    particleCount: 180,
    spread: 95*scale,
    startVelocity: 42,
    scalar: 0.92
  }), 140);
  setTimeout(() => emit({
    ...base,
    particleCount: 220,
    spread: 110*scale,
    startVelocity: 78,
    scalar: 1.06
  }), 200);
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
