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

const SESSION_NEXT_CARD_SCALE_DEFAULTS = Object.freeze({
  revealStartFractionH: 0.44,
  revealEndFractionH: 2,
  revealStartFractionV: 0.3,
  revealEndFractionV: 1.5,
  sideSwipeRatio: 0.72,
  commitXFraction: 0.45,
  commitXMin: 42,
  commitYFraction: 0.4,
  commitYMin: 80,
  scaleMin: 0,
  scaleMax: 1,
  depthStart: -280,
  depthEnd: 0,
  tiltStart: 13,
  tiltEnd: 0
});

const sessionNextCardScaleConfig = {
  ...SESSION_NEXT_CARD_SCALE_DEFAULTS
};

let sessionScaleDebugControlsWired = false;
const SESSION_PROGRAMMATIC_SWIPE_ROTATE_LIMIT = 15;
const SESSION_PROGRAMMATIC_SWIPE_ARC_COMMIT_ANGLE = 0.55;
const SESSION_DESKTOP_AUTO_SWIPE_ARC_COMMIT_ANGLE = 0.82;
const SESSION_DESKTOP_AUTO_SWIPE_TRANSITION_MS = 420;
const SESSION_DESKTOP_AUTO_SWIPE_EASING = 'cubic-bezier(0.42, 0, 1, 1)';
const SESSION_DESKTOP_AUTO_SWIPE_COMMIT_DELAY_MS = 420;
let sessionProgrammaticSwipeInFlight = false;

function clampSessionScaleNumber(value, min, max, fallback = 0) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : fallback;
  return Math.min(max, Math.max(min, safe));
}

function normalizeSessionNextCardScaleConfig() {
  sessionNextCardScaleConfig.revealStartFractionH = clampSessionScaleNumber(
    sessionNextCardScaleConfig.revealStartFractionH,
    0,
    0.95,
    SESSION_NEXT_CARD_SCALE_DEFAULTS.revealStartFractionH
  );
  sessionNextCardScaleConfig.revealEndFractionH = clampSessionScaleNumber(
    sessionNextCardScaleConfig.revealEndFractionH,
    0.05,
    2,
    SESSION_NEXT_CARD_SCALE_DEFAULTS.revealEndFractionH
  );
  if (sessionNextCardScaleConfig.revealEndFractionH <= sessionNextCardScaleConfig.revealStartFractionH) {
    sessionNextCardScaleConfig.revealEndFractionH = Math.min(2, sessionNextCardScaleConfig.revealStartFractionH + 0.01);
  }

  sessionNextCardScaleConfig.revealStartFractionV = clampSessionScaleNumber(
    sessionNextCardScaleConfig.revealStartFractionV,
    0,
    0.95,
    SESSION_NEXT_CARD_SCALE_DEFAULTS.revealStartFractionV
  );
  sessionNextCardScaleConfig.revealEndFractionV = clampSessionScaleNumber(
    sessionNextCardScaleConfig.revealEndFractionV,
    0.05,
    2,
    SESSION_NEXT_CARD_SCALE_DEFAULTS.revealEndFractionV
  );
  if (sessionNextCardScaleConfig.revealEndFractionV <= sessionNextCardScaleConfig.revealStartFractionV) {
    sessionNextCardScaleConfig.revealEndFractionV = Math.min(2, sessionNextCardScaleConfig.revealStartFractionV + 0.01);
  }

  sessionNextCardScaleConfig.sideSwipeRatio = clampSessionScaleNumber(
    sessionNextCardScaleConfig.sideSwipeRatio,
    0.4,
    1.4,
    SESSION_NEXT_CARD_SCALE_DEFAULTS.sideSwipeRatio
  );

  sessionNextCardScaleConfig.commitXFraction = clampSessionScaleNumber(
    sessionNextCardScaleConfig.commitXFraction,
    0.05,
    0.45,
    SESSION_NEXT_CARD_SCALE_DEFAULTS.commitXFraction
  );
  sessionNextCardScaleConfig.commitXMin = clampSessionScaleNumber(
    sessionNextCardScaleConfig.commitXMin,
    8,
    200,
    SESSION_NEXT_CARD_SCALE_DEFAULTS.commitXMin
  );
  sessionNextCardScaleConfig.commitYFraction = clampSessionScaleNumber(
    sessionNextCardScaleConfig.commitYFraction,
    0.1,
    0.6,
    SESSION_NEXT_CARD_SCALE_DEFAULTS.commitYFraction
  );
  sessionNextCardScaleConfig.commitYMin = clampSessionScaleNumber(
    sessionNextCardScaleConfig.commitYMin,
    20,
    320,
    SESSION_NEXT_CARD_SCALE_DEFAULTS.commitYMin
  );
  sessionNextCardScaleConfig.scaleMin = clampSessionScaleNumber(
    sessionNextCardScaleConfig.scaleMin,
    0,
    2,
    SESSION_NEXT_CARD_SCALE_DEFAULTS.scaleMin
  );
  sessionNextCardScaleConfig.scaleMax = clampSessionScaleNumber(
    sessionNextCardScaleConfig.scaleMax,
    0,
    2.5,
    SESSION_NEXT_CARD_SCALE_DEFAULTS.scaleMax
  );
  if (sessionNextCardScaleConfig.scaleMax < sessionNextCardScaleConfig.scaleMin) {
    sessionNextCardScaleConfig.scaleMax = sessionNextCardScaleConfig.scaleMin;
  }
  sessionNextCardScaleConfig.depthStart = clampSessionScaleNumber(
    sessionNextCardScaleConfig.depthStart,
    -1600,
    600,
    SESSION_NEXT_CARD_SCALE_DEFAULTS.depthStart
  );
  sessionNextCardScaleConfig.depthEnd = clampSessionScaleNumber(
    sessionNextCardScaleConfig.depthEnd,
    -1600,
    800,
    SESSION_NEXT_CARD_SCALE_DEFAULTS.depthEnd
  );
  sessionNextCardScaleConfig.tiltStart = clampSessionScaleNumber(
    sessionNextCardScaleConfig.tiltStart,
    -35,
    35,
    SESSION_NEXT_CARD_SCALE_DEFAULTS.tiltStart
  );
  sessionNextCardScaleConfig.tiltEnd = clampSessionScaleNumber(
    sessionNextCardScaleConfig.tiltEnd,
    -35,
    35,
    SESSION_NEXT_CARD_SCALE_DEFAULTS.tiltEnd
  );
}

function applySessionNextCardScaleConfig() {
  normalizeSessionNextCardScaleConfig();
  const section = el('studySessionSection');
  if (!section) return;
  section.style.setProperty('--next-card-scale-min', String(sessionNextCardScaleConfig.scaleMin));
  section.style.setProperty('--next-card-scale-max', String(sessionNextCardScaleConfig.scaleMax));
  section.style.setProperty('--next-card-depth-start', `${sessionNextCardScaleConfig.depthStart}px`);
  section.style.setProperty('--next-card-depth-end', `${sessionNextCardScaleConfig.depthEnd}px`);
  section.style.setProperty('--next-card-tilt-start', `${sessionNextCardScaleConfig.tiltStart}deg`);
  section.style.setProperty('--next-card-tilt-end', `${sessionNextCardScaleConfig.tiltEnd}deg`);
}

function formatSessionScaleDebugExportFilename(date = new Date()) {
  const safeDate = date instanceof Date ? date : new Date();
  const year = String(safeDate.getFullYear());
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getDate()).padStart(2, '0');
  const hours = String(safeDate.getHours()).padStart(2, '0');
  const minutes = String(safeDate.getMinutes()).padStart(2, '0');
  const seconds = String(safeDate.getSeconds()).padStart(2, '0');
  return `study-session-scale-debug-${year}-${month}-${day}_${hours}-${minutes}-${seconds}.json`;
}

function exportSessionScaleDebugValues() {
  normalizeSessionNextCardScaleConfig();
  const payload = {
    exportedAt: new Date().toISOString(),
    source: 'study-session-scale-debug',
    values: { ...sessionNextCardScaleConfig },
    defaults: { ...SESSION_NEXT_CARD_SCALE_DEFAULTS }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const download = document.createElement('a');
  download.href = URL.createObjectURL(blob);
  download.download = formatSessionScaleDebugExportFilename();
  download.click();
  URL.revokeObjectURL(download.href);
}

function wireSessionScaleDebugControls() {
  if (sessionScaleDebugControlsWired) return;
  const toggleBtn = el('sessionScaleDebugBtn');
  const panel = el('sessionScaleDebugPanel');
  if (!toggleBtn || !panel) return;
  sessionScaleDebugControlsWired = true;

  const fields = [
    { id: 'sessionScaleDebugRevealStartH', key: 'revealStartFractionH', min: 0, max: 0.95, step: 0.01, decimals: 2 },
    { id: 'sessionScaleDebugRevealEndH', key: 'revealEndFractionH', min: 0.05, max: 2, step: 0.01, decimals: 2 },
    { id: 'sessionScaleDebugRevealStartV', key: 'revealStartFractionV', min: 0, max: 0.95, step: 0.01, decimals: 2 },
    { id: 'sessionScaleDebugRevealEndV', key: 'revealEndFractionV', min: 0.05, max: 2, step: 0.01, decimals: 2 },
    { id: 'sessionScaleDebugSideRatio', key: 'sideSwipeRatio', min: 0.4, max: 1.4, step: 0.01, decimals: 2 },
    { id: 'sessionScaleDebugCommitXFraction', key: 'commitXFraction', min: 0.05, max: 0.45, step: 0.01, decimals: 2 },
    { id: 'sessionScaleDebugCommitXMin', key: 'commitXMin', min: 8, max: 200, step: 1, decimals: 0 },
    { id: 'sessionScaleDebugCommitYFraction', key: 'commitYFraction', min: 0.1, max: 0.6, step: 0.01, decimals: 2 },
    { id: 'sessionScaleDebugCommitYMin', key: 'commitYMin', min: 20, max: 320, step: 1, decimals: 0 },
    { id: 'sessionScaleDebugScaleMin', key: 'scaleMin', min: 0, max: 2, step: 0.01, decimals: 2 },
    { id: 'sessionScaleDebugScaleMax', key: 'scaleMax', min: 0, max: 2.5, step: 0.01, decimals: 2 },
    { id: 'sessionScaleDebugDepthStart', key: 'depthStart', min: -1600, max: 600, step: 10, decimals: 0 },
    { id: 'sessionScaleDebugDepthEnd', key: 'depthEnd', min: -1600, max: 800, step: 10, decimals: 0 },
    { id: 'sessionScaleDebugTiltStart', key: 'tiltStart', min: -35, max: 35, step: 0.1, decimals: 1 },
    { id: 'sessionScaleDebugTiltEnd', key: 'tiltEnd', min: -35, max: 35, step: 0.1, decimals: 1 }
  ];

  const inputMap = new Map();
  fields.forEach(field => {
    const input = el(field.id);
    if (!input) return;
    inputMap.set(field.key, { ...field, input });
    input.min = String(field.min);
    input.max = String(field.max);
    input.step = String(field.step);
  });

  const syncInputsFromConfig = () => {
    normalizeSessionNextCardScaleConfig();
    inputMap.forEach(meta => {
      const value = sessionNextCardScaleConfig[meta.key];
      meta.input.value = Number(value).toFixed(meta.decimals);
    });
  };

  const applyKeyFromInput = key => {
    const meta = inputMap.get(key);
    if (!meta) return;
    sessionNextCardScaleConfig[key] = clampSessionScaleNumber(
      meta.input.value,
      meta.min,
      meta.max,
      SESSION_NEXT_CARD_SCALE_DEFAULTS[key]
    );
    normalizeSessionNextCardScaleConfig();
    syncInputsFromConfig();
    applySessionNextCardScaleConfig();
  };

  inputMap.forEach((meta, key) => {
    meta.input.addEventListener('input', () => applyKeyFromInput(key));
    meta.input.addEventListener('change', () => applyKeyFromInput(key));
  });

  const resetBtn = el('sessionScaleDebugResetBtn');
  if (resetBtn) {
    resetBtn.onclick = () => {
      Object.assign(sessionNextCardScaleConfig, SESSION_NEXT_CARD_SCALE_DEFAULTS);
      syncInputsFromConfig();
      applySessionNextCardScaleConfig();
    };
  }

  const printBtn = el('sessionScaleDebugPrintBtn');
  if (printBtn) {
    printBtn.onclick = () => {
      exportSessionScaleDebugValues();
    };
  }

  toggleBtn.onclick = event => {
    event.preventDefault();
    event.stopPropagation();
    panel.classList.toggle('hidden');
  };

  panel.addEventListener('click', event => {
    event.stopPropagation();
  });

  applySessionNextCardScaleConfig();
  syncInputsFromConfig();
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

    const prioritizedEligibleCardIds = [...eligibleCardIds];
    if (reviewMode && explicitCardIds.length) {
      const explicitOrder = new Map(
        explicitCardIds.map((cardId, idx) => [String(cardId || '').trim(), idx])
      );
      prioritizedEligibleCardIds.sort((a, b) => {
        const orderA = explicitOrder.has(a) ? explicitOrder.get(a) : Number.MAX_SAFE_INTEGER;
        const orderB = explicitOrder.has(b) ? explicitOrder.get(b) : Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return String(a || '').localeCompare(String(b || ''));
      });
    } else {
      shuffleArrayInPlace(prioritizedEligibleCardIds);
    }
    const selectedCardIds = prioritizedEligibleCardIds.slice(0, sessionSize);
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
    if (!reviewMode && selectedSubject?.id) {
      recordSessionSizeSample(selectedSubject.id, selectedCards.length);
      clearSessionSizeManualOverride();
    }
    const mixedCards = reviewMode ? [...selectedCards] : interleaveCardsByTopic(selectedCards);

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
    } else if (typeof ensureProgressForCardIds === 'function' && typeof getCurrentProgressState === 'function') {
      await ensureProgressForCardIds(selectedCardIds, {
        payloadLabel: 'session-initial-progress',
        uiBlocking: false
      });
      sessionCards.forEach(card => {
        const state = getCurrentProgressState(progressByCardId.get(card.id), card.id);
        const stateKey = String(state?.key || '').trim();
        if (stateKey === 'wrong') initialGradeMap[card.id] = 'wrong';
        else if (stateKey === 'partial' || stateKey === 'in-progress') initialGradeMap[card.id] = 'partial';
        else if (stateKey === 'correct' || stateKey === 'mastered') initialGradeMap[card.id] = 'correct';
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

    setupSessionPillResizeObserver();
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
 * @function setNextCardSwipeProgress
 * @description Updates the swipe-linked progress for the stacked next-card preview.
 */

function setNextCardSwipeProgress(progress = 0, options = {}) {
  const nextCardEl = el('nextFlashcard');
  if (!nextCardEl) return;
  const opts = options && typeof options === 'object' ? options : {};
  const immediate = opts.immediate === true;
  const dragging = opts.dragging === true;
  const numeric = Number(progress);
  const clamped = Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric)) : 0;
  nextCardEl.classList.toggle('is-dragging', dragging);
  if (immediate) nextCardEl.style.transition = 'none';
  nextCardEl.style.setProperty('--next-card-progress', String(clamped));
  nextCardEl.classList.toggle('is-engaged', clamped > 0.001);
  if (immediate) {
    void nextCardEl.offsetWidth;
    nextCardEl.style.transition = '';
  }
}

/**
 * @function applyNextSessionCardTheme
 * @description Applies per-card accent variables to the stacked next-card preview.
 */

function applyNextSessionCardTheme(card) {
  const nextCardEl = el('nextFlashcard');
  if (!nextCardEl) return;
  if (!card) {
    nextCardEl.style.removeProperty('--face-accent');
    return;
  }
  const accent = (typeof resolveCardSubjectAccent === 'function')
    ? resolveCardSubjectAccent(card)
    : '#2dd4bf';
  const rgba = a => (typeof hexToRgba === 'function' ? hexToRgba(accent, a) : `rgba(45, 212, 191, ${a})`);
  nextCardEl.style.setProperty('--face-accent', rgba(0.14));
}

/**
 * @function buildDisabledMcqAnswerZone
 * @description Builds a read-only MCQ answer zone used in non-interactive card previews.
 */

function buildDisabledMcqAnswerZone(card) {
  const options = Array.isArray(card?.options) ? card.options : [];
  const optionCount = options.length;
  const optionsAlign = card?.optionsTextAlign || card?.answerTextAlign || card?.textAlign || 'center';
  const optionsWrap = document.createElement('div');
  optionsWrap.className = 'mcq-options';
  options.forEach(option => {
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
  checkBtn.tabIndex = -1;
  checkRow.appendChild(checkBtn);
  answerZone.append(separator, optionsWrap, checkRow);
  return answerZone;
}

/**
 * @function syncNextSessionFaceOverflowState
 * @description Mirrors overflow behavior for the stacked next-card preview.
 */

function syncNextSessionFaceOverflowState() {
  const nextCardEl = el('nextFlashcard');
  const nextContent = el('nextContent');
  if (!nextCardEl || !nextContent) return;
  const isMcq = !!nextCardEl.classList.contains('mcq-mode');
  if (isMcq) {
    nextContent.classList.remove('is-overflowing');
    nextContent.scrollTop = 0;
    return;
  }
  nextContent.classList.remove('is-overflowing');
  const isOverflowing = nextContent.scrollHeight > (nextContent.clientHeight + 2);
  if (isOverflowing) {
    nextContent.classList.add('is-overflowing');
    nextContent.scrollTop = 0;
  }
}

/**
 * @function queueNextSessionFaceOverflowSync
 * @description Defers next-card overflow sync by two frames.
 */

function queueNextSessionFaceOverflowSync() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      syncNextSessionFaceOverflowState();
    });
  });
}

/**
 * @function renderNextSessionCardPreview
 * @description Renders the upcoming card as a non-interactive stacked preview behind the active card.
 */

function renderNextSessionCardPreview(card) {
  const nextCardEl = el('nextFlashcard');
  const nextContent = el('nextContent');
  const nextTopicPill = el('nextTopicPill');
  if (!nextCardEl || !nextContent) return;
  applySessionNextCardScaleConfig();

  setNextCardSwipeProgress(0, { immediate: true });

  if (!card) {
    nextCardEl.classList.add('hidden');
    nextCardEl.dataset.type = 'qa';
    nextCardEl.classList.remove('mcq-mode');
    nextContent.innerHTML = '';
    setCardTopicPill(nextTopicPill, '');
    applyNextSessionCardTheme(null);
    return;
  }

  const isMcq = card.type === 'mcq' && (card.options || []).length > 1;
  const qImages = getCardImageList(card, 'Q');
  applyNextSessionCardTheme(card);
  nextCardEl.dataset.type = isMcq ? 'mcq' : 'qa';
  nextCardEl.classList.toggle('mcq-mode', isMcq);
  setCardTopicPill(nextTopicPill, resolveCardTopicName(card));
  nextContent.innerHTML = `<div></div><div class="qtxt"></div>`;
  const qtxtEl = nextContent.querySelector('.qtxt');
  const prompt = String(card?.prompt || '').trim();
  if (prompt) {
    renderRich(qtxtEl, card.prompt, { textAlign: card.questionTextAlign || card.textAlign || 'center' });
    applySessionTextSize(qtxtEl, card.prompt, { hasImage: qImages.length > 0, isMcq });
  } else {
    qtxtEl.textContent = 'Question';
  }
  appendSessionImages(nextContent, qImages, 'Question image');
  if (isMcq) {
    nextContent.append(buildDisabledMcqAnswerZone(card));
  }
  nextCardEl.classList.remove('hidden');
  queueNextSessionFaceOverflowSync();
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
 * @function applyPreviewCardTheme
 * @description Applies the same per-card accent variables used by study session to the preview dialog.
 */

function applyPreviewCardTheme(card) {
  const dialog = el('cardPreviewDialog');
  if (!dialog) return;
  const accent = (typeof resolveCardSubjectAccent === 'function')
    ? resolveCardSubjectAccent(card)
    : '#2dd4bf';
  const rgba = a => (typeof hexToRgba === 'function' ? hexToRgba(accent, a) : `rgba(45, 212, 191, ${a})`);
  dialog.style.setProperty('--accent', accent);
  dialog.style.setProperty('--accent-glow', rgba(0.35));
  dialog.style.setProperty('--accent-ring', rgba(0.9));
  dialog.style.setProperty('--accent-glow-strong', rgba(0.6));
  dialog.style.setProperty('--accent-glow-soft', rgba(0.35));
  dialog.style.setProperty('--panel-accent', rgba(0.12));
  dialog.style.setProperty('--tile-accent-bg', rgba(0.18));
  dialog.style.setProperty('--face-accent', rgba(0.14));
}

/**
 * @function syncPreviewFaceOverflowState
 * @description Mirrors study-session overflow behavior for preview front/back faces.
 */

function syncPreviewFaceOverflowState() {
  const flashcard = el('previewFlashcard');
  const isMcq = !!flashcard?.classList.contains('mcq-mode');
  ['previewFrontContent', 'previewBackContent'].forEach(id => {
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
 * @function queuePreviewFaceOverflowSync
 * @description Defers preview overflow sync by two frames to account for layout/image updates.
 */

function queuePreviewFaceOverflowSync() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      syncPreviewFaceOverflowState();
    });
  });
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
  applyPreviewCardTheme(card);
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
    front.append(buildDisabledMcqAnswerZone(card));
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
  queuePreviewFaceOverflowSync();
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
  queuePreviewFaceOverflowSync();
}

function getSwipeThresholds() {
  return {
    x: Math.max(card.clientWidth * 0.18, 50),
    y: Math.max(card.clientHeight * 0.25, 80)
  };
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
        void gradeCardWithDesktopAutoMove(result);
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
  setNextCardSwipeProgress(0, { immediate: true });
  closeStudyImageLightbox();
  flashcard.classList.remove('flipped', 'swiping', 'swipe-correct', 'swipe-wrong', 'swipe-partial');
  flashcard.style.removeProperty('--swipe-intensity');
  flashcard.style.transition = 'none';
  flashcard.style.transform = '';
  flashcard.style.opacity = '';
  flashcard.style.willChange = '';
  // Prevents the next active card from animating in from the swipe-off edge.
  void flashcard.offsetWidth;
  flashcard.style.transition = '';
  const swipeBadge = el('swipeBadge');
  if (swipeBadge) swipeBadge.textContent = '';
  if (!session.activeQueue.length) {
    renderNextSessionCardPreview(null);
    session.active = false;
    resetSessionImagePreloadCache();
    syncSidebarHiddenState();
    renderSessionPills();
    pillBarResizeObserver?.disconnect();
    pillBarResizeObserver = null;
    await openSessionCompleteDialog();
    if (selectedSubject) {
      // Refresh meta in background so the completion dialog appears immediately.
      void refreshTopicSessionMeta();
    }
    return;
  }
  const card = session.activeQueue[0];
  const nextCard = session.activeQueue[1] || null;
  warmUpcomingSessionCards(2);
  flashcard.classList.remove('flipped');
  renderCardContent(card);
  renderNextSessionCardPreview(nextCard);
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
    // Wrong: move ~30% of remaining non-mastered queue length to the back (rounded to nearest int).
    const moveBack = Math.max(0, Math.round(remainingNonMasteredCount * 0.3));
    const target = Math.min(moveBack, remainingActiveCount);
    session.activeQueue.splice(target, 0, card);
    session.gradeMap[card.id] = result;
  } else if (result === 'partial') {
    // Partial: move ~70% of remaining non-mastered queue length to the back (rounded to nearest int).
    const moveBack = Math.max(0, Math.round(remainingNonMasteredCount * 0.7));
    const target = Math.min(moveBack, remainingActiveCount);
    session.activeQueue.splice(target, 0, card);
    session.gradeMap[card.id] = result;
  } else {
    session.activeQueue.push(card); // correct, but not mastered yet
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

function getProgrammaticSessionSwipeTransform(cardEl, result) {
  if (!cardEl || result === 'partial') {
    return { x: 0, y: window.innerHeight * 1.24, rotate: 0 };
  }
  const arcRadius = Math.max(window.innerHeight * 1.4, 1200);
  const rect = cardEl.getBoundingClientRect();
  const cardCenterX = rect.left + rect.width / 2;
  const direction = result === 'correct' ? -1 : 1;
  const angle = direction * SESSION_DESKTOP_AUTO_SWIPE_ARC_COMMIT_ANGLE;
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight + arcRadius;
  const arcX = cx + arcRadius * Math.sin(angle);
  const arcY = cy - arcRadius * Math.cos(angle);
  const baseArcY = cy - arcRadius;
  const boostedX = (arcX - cardCenterX) * 1.22;
  const boostedY = (arcY - baseArcY) * 1.1;
  return {
    x: boostedX,
    y: boostedY,
    rotate: angle * SESSION_PROGRAMMATIC_SWIPE_ROTATE_LIMIT * 1.4
  };
}

function canUseDesktopAutoSwipeMotion(flashcardEl, result) {
  if (!flashcardEl || !session.active) return false;
  if (!['correct', 'partial', 'wrong'].includes(result)) return false;
  if (!isStudySessionVisible()) return false;
  if (isCoarsePointerDevice()) return false;
  if (document.body.classList.contains('session-image-open')) return false;
  if (flashcardEl.dataset.type === 'mcq') return false;
  if (flashcardEl.classList.contains('swiping')) return false;
  return true;
}

async function gradeCardWithDesktopAutoMove(result) {
  const safeResult = String(result || '').trim().toLowerCase();
  if (!['correct', 'partial', 'wrong'].includes(safeResult)) return;
  if (sessionProgrammaticSwipeInFlight) return;
  const flashcardEl = el('flashcard');
  if (!canUseDesktopAutoSwipeMotion(flashcardEl, safeResult)) {
    await gradeCard(safeResult);
    return;
  }

  sessionProgrammaticSwipeInFlight = true;
  flashcardEl.classList.remove('swipe-correct', 'swipe-wrong', 'swipe-partial');
  flashcardEl.classList.add('swiping', `swipe-${safeResult}`);
  flashcardEl.style.setProperty('--swipe-intensity', '1');
  flashcardEl.style.transition = `transform ${SESSION_DESKTOP_AUTO_SWIPE_TRANSITION_MS}ms ${SESSION_DESKTOP_AUTO_SWIPE_EASING}, opacity ${SESSION_DESKTOP_AUTO_SWIPE_TRANSITION_MS}ms ${SESSION_DESKTOP_AUTO_SWIPE_EASING}`;
  flashcardEl.style.willChange = 'transform, opacity';
  flashcardEl.style.opacity = '1';
  setNextCardSwipeProgress(1);

  const transform = getProgrammaticSessionSwipeTransform(flashcardEl, safeResult);
  requestAnimationFrame(() => {
    const baseTransform = flashcardEl.classList.contains('flipped') ? ' rotateX(180deg)' : '';
    flashcardEl.style.transform = `translate3d(${transform.x}px, ${transform.y}px, 0) rotate(${transform.rotate}deg)${baseTransform}`;
    flashcardEl.style.opacity = safeResult === 'partial' ? '0.12' : '0.05';
  });

  try {
    await new Promise(resolve => setTimeout(resolve, SESSION_DESKTOP_AUTO_SWIPE_COMMIT_DELAY_MS));
    await gradeCard(safeResult);
  } finally {
    sessionProgrammaticSwipeInFlight = false;
  }
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

  // 1. Calculate dynamic width.
  const totalCards = session.activeQueue.length + session.mastered.length;
  const bar = el('sessionPillBar');
  const barWidth = bar.offsetWidth;
  const availableWidth = barWidth * 0.7; // 80% of the bar width
  const gapSum = (totalCards - 1) * 4; // 4px gap between dots
  // Available width minus gaps divided by card count
  let dynamicWidth = (availableWidth - gapSum) / totalCards;

  // Clamp bounds can be applied here if needed
  // dynamicWidth = Math.max(10, Math.min(dynamicWidth, 30));
  console.log({ barWidth, availableWidth, gapSum, totalCards, dynamicWidth });

  // 2. Pass value to parent via CSS variable
  // This avoids touching each element individually
  bar.style.setProperty('--dynamic-pill-width', `${dynamicWidth}px`);
  bar.style.setProperty('--dynamic-pill-height', `${dynamicWidth * 0.4}px`);

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
 * @function setupSessionPillResizeObserver
 * @description Renders session pills on pill bar resize to keep the dynamic sizing in sync with available space.
 */

function setupSessionPillResizeObserver() {
  const bar = el('sessionPillBar');
  if (!bar) return;

  // doppelte Observer verhindern
  pillBarResizeObserver?.disconnect();

  pillBarResizeObserver = new ResizeObserver(() => {
    if (!session.active) return;

    clearTimeout(pillResizeTimeout);

    pillResizeTimeout = setTimeout(() => {
      renderSessionPills();
    }, 140); // 👈 sweet spot (120–180ms)
  });

  pillBarResizeObserver.observe(bar);
}

/**
 * @function wireSwipe
 * @description Wires swipe.
 */

// function wireSwipe() {
//   const card = el('flashcard');
//   if (!card) return;
//   const rotateLimit = 15;
//   let dragging = false;
//   let swipeDecisionPending = false;
//   let startX = 0;
//   let startY = 0;
//   let dx = 0;
//   let dy = 0;

//   /**
//    * @function clamp
//    * @description Clamps state.
//    */

//   function clamp(value, min, max) {
//     return Math.min(max, Math.max(min, value));
//   }

//   /**
//    * @function swipeBaseTransform
//    * @description Handles swipe base transform logic.
//    */

//   function swipeBaseTransform() {
//     return card.classList.contains('flipped') ? ' rotateX(180deg)' : '';
//   }

//   /**
//    * @function setSwipeTransform
//    * @description Sets the swipe transform.
//    */

//   function setSwipeTransform(x = 0, y = 0, rotate = 0) {
//     card.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotate}deg)${swipeBaseTransform()}`;
//   }

//   /**
//    * @function clearSwipeFeedback
//    * @description Handles clear swipe feedback logic.
//    */

//   function clearSwipeFeedback() {
//     card.classList.remove('swiping', 'swipe-correct', 'swipe-wrong', 'swipe-partial');
//     card.style.removeProperty('--swipe-intensity');
//     const badge = el('swipeBadge');
//     if (badge) badge.textContent = '';
//   }

//   /**
//    * @function resetSwipeDragState
//    * @description Resets transient swipe drag styling/state so native scroll can take over.
//    */

//   function resetSwipeDragState() {
//     dragging = false;
//     swipeDecisionPending = false;
//     card.style.transition = '';
//     card.style.willChange = '';
//     card.style.transform = '';
//     clearSwipeFeedback();
//   }

//   /**
//    * @function applySwipeFeedback
//    * @description Applies swipe feedback.
//    */

//   function applySwipeFeedback(result, intensity) {
//     clearSwipeFeedback();
//     if (!result || intensity <= 0) return;
//     const labels = {
//       correct: 'Korrekt',
//       wrong: 'Falsch',
//       partial: 'Teilweise'
//     };
//     const cls = {
//       correct: 'swipe-correct',
//       wrong: 'swipe-wrong',
//       partial: 'swipe-partial'
//     }[result];
//     card.classList.add('swiping', cls);
//     card.style.setProperty('--swipe-intensity', String(clamp(intensity, 0, 1)));
//     const badge = el('swipeBadge');
//     if (badge) badge.textContent = labels[result] || '';
//   }

//   /**
//    * @function getSwipeResult
//    * @description Returns the swipe result.
//    */

//   function getSwipeResult() {
//     const xThreshold = Math.max(card.clientWidth * 0.25, 60);
//     const yThreshold = Math.max(card.clientHeight * 0.25, 80);
//     if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > xThreshold) {
//       return dx < 0 ? 'correct' : 'wrong';
//     }
//     if (dy > yThreshold) return 'partial';
//     return null;
//   }

//   /**
//    * @function snapBack
//    * @description Handles snap back logic.
//    */

//   function snapBack() {
//     card.style.transition = 'transform 380ms cubic-bezier(0.18, 0.89, 0.32, 1.28)';
//     applySwipeFeedback(null, 0);
//     requestAnimationFrame(() => setSwipeTransform(0, 0, 0));
//     setTimeout(() => {
//       card.style.transition = '';
//       card.style.willChange = '';
//       card.style.transform = '';
//       clearSwipeFeedback();
//     }, 390);
//   }

//   /**
//    * @function flyOut
//    * @description Handles fly out logic.
//    */

//   function flyOut(result) {
//     const width = Math.max(card.clientWidth, 1);
//     let outX = dx;
//     let outY = dy;
//     let outRotate = clamp((dx / width) * rotateLimit, -rotateLimit, rotateLimit);

//     if (result === 'correct') {
//       outX = -window.innerWidth * 1.15;
//       outY = dy * 0.15;
//       outRotate = -rotateLimit;
//     } else if (result === 'wrong') {
//       outX = window.innerWidth * 1.15;
//       outY = dy * 0.15;
//       outRotate = rotateLimit;
//     } else {
//       outX = dx * 0.2;
//       outY = window.innerHeight * 1.1;
//       outRotate = clamp((dx / width) * 8, -8, 8);
//     }

//     card.style.transition = 'transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1)';
//     applySwipeFeedback(result, 1);
//     requestAnimationFrame(() => setSwipeTransform(outX, outY, outRotate));
//     setTimeout(() => {
//       gradeCard(result);
//     }, 210);
//   }

//   card.addEventListener('touchstart', e => {
//     if (card.dataset.type === 'mcq' || !session.active) return;
//     if (!e.touches[0]) return;
//     const startTarget = e.target instanceof Element ? e.target : null;
//     const startFace = startTarget ? startTarget.closest('.face') : null;
//     const faceCanScroll = !!startFace && (startFace.scrollHeight - startFace.clientHeight > 2);
//     dragging = true;
//     swipeDecisionPending = faceCanScroll;
//     startX = e.touches[0].clientX;
//     startY = e.touches[0].clientY;
//     dx = 0;
//     dy = 0;
//     card.style.transition = 'none';
//     card.style.willChange = 'transform';
//     clearSwipeFeedback();
//   }, { passive: true });

//   card.addEventListener('touchmove', e => {
//     if (!dragging || card.dataset.type === 'mcq') return;
//     if (!e.touches[0]) return;
//     dx = e.touches[0].clientX - startX;
//     dy = e.touches[0].clientY - startY;

//     // If content can scroll inside the card face, prefer native vertical scroll
//     // and only commit to swipe once horizontal intent is clear.
//     if (swipeDecisionPending) {
//       const travel = Math.abs(dx) + Math.abs(dy);
//       if (travel < 8) return;
//       if (Math.abs(dy) > Math.abs(dx)) {
//         resetSwipeDragState();
//         return;
//       }
//       swipeDecisionPending = false;
//     }

//     if (Math.abs(dx) + Math.abs(dy) > 4) e.preventDefault();

//     const width = Math.max(card.clientWidth, 1);
//     const xThreshold = Math.max(width * 0.25, 60);
//     const yThreshold = Math.max(card.clientHeight * 0.25, 80);
//     const rotate = clamp((dx / width) * rotateLimit, -rotateLimit, rotateLimit);
//     setSwipeTransform(dx, dy, rotate);

//     let result = null;
//     let intensity = 0;
//     if (Math.abs(dx) >= Math.abs(dy)) {
//       result = dx <= 0 ? 'correct' : 'wrong';
//       intensity = Math.min(Math.abs(dx) / xThreshold, 1);
//     } else if (dy > 0) {
//       result = 'partial';
//       intensity = Math.min(dy / yThreshold, 1);
//     }
//     applySwipeFeedback(result, intensity);
//   }, { passive: false });

//   const finishSwipe = () => {
//     if (!dragging) return;
//     dragging = false;
//     swipeDecisionPending = false;
//     if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
//       suppressFlashcardTapUntil = Date.now() + 260;
//     }
//     const result = getSwipeResult();
//     if (result) {
//       flyOut(result);
//       return;
//     }
//     snapBack();
//   };

//   card.addEventListener('touchend', finishSwipe);
//   card.addEventListener('touchcancel', finishSwipe);
// }

function wireSwipe() {
  const card = el('flashcard');
  if (!card) return;

  const rotateLimit = SESSION_PROGRAMMATIC_SWIPE_ROTATE_LIMIT;
  const ARC_RADIUS = Math.max(window.innerHeight * 1.4, 1200);
  const ARC_COMMIT_ANGLE = SESSION_PROGRAMMATIC_SWIPE_ARC_COMMIT_ANGLE;
  const UP_CANCEL_RATIO = 1.25;
  const UP_CANCEL_MIN_PX = 26;

  let dragging = false;
  let panActivated = false;
  let swipeDecisionPending = false;
  let swipeIntent = '';
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let dy = 0;
  let cardCenterX = 0;
  let cardCenterY = 0;
  let activeSwipeFeedback = '';

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function swipeBaseTransform() {
    return card.classList.contains('flipped') ? ' rotateX(180deg)' : '';
  }

  function setTransform(x, y, rotate = 0) {
    card.style.transform =
      `translate3d(${x}px, ${y}px, 0) rotate(${rotate}deg)` +
      swipeBaseTransform();
  }

  function clearSwipeFeedback() {
    if (activeSwipeFeedback) {
      card.classList.remove(`swipe-${activeSwipeFeedback}`);
      activeSwipeFeedback = '';
    }
    card.classList.remove('swiping');
    card.style.removeProperty('--swipe-intensity');
    const badge = el('swipeBadge');
    if (badge) badge.textContent = '';
  }

  function resetSwipeDragState() {
    dragging = false;
    panActivated = false;
    swipeDecisionPending = false;
    swipeIntent = '';
    card.style.transition = '';
    card.style.willChange = '';
    card.style.transform = '';
    clearSwipeFeedback();
    setNextCardSwipeProgress(0, { dragging: false });
  }

  function applySwipeFeedback(result, intensity) {
    if (!result || intensity <= 0) {
      clearSwipeFeedback();
      return;
    }
    if (activeSwipeFeedback !== result) {
      if (activeSwipeFeedback) card.classList.remove(`swipe-${activeSwipeFeedback}`);
      card.classList.add(`swipe-${result}`);
      activeSwipeFeedback = result;
    }
    card.classList.add('swiping');
    const clampedIntensity = clamp(intensity, 0, 1);
    card.style.setProperty('--swipe-intensity', String(clampedIntensity));
  }

  function getSwipeCommitThresholds() {
    const xFraction = clampSessionScaleNumber(
      sessionNextCardScaleConfig.commitXFraction,
      0.05,
      0.45,
      SESSION_NEXT_CARD_SCALE_DEFAULTS.commitXFraction
    );
    const xMin = clampSessionScaleNumber(
      sessionNextCardScaleConfig.commitXMin,
      8,
      200,
      SESSION_NEXT_CARD_SCALE_DEFAULTS.commitXMin
    );
    const yFraction = clampSessionScaleNumber(
      sessionNextCardScaleConfig.commitYFraction,
      0.1,
      0.6,
      SESSION_NEXT_CARD_SCALE_DEFAULTS.commitYFraction
    );
    const yMin = clampSessionScaleNumber(
      sessionNextCardScaleConfig.commitYMin,
      20,
      320,
      SESSION_NEXT_CARD_SCALE_DEFAULTS.commitYMin
    );
    return {
      x: Math.max(card.clientWidth * xFraction, xMin),
      y: Math.max(card.clientHeight * yFraction, yMin)
    };
  }

  function getSideSwipeRatio() {
    return clampSessionScaleNumber(
      sessionNextCardScaleConfig.sideSwipeRatio,
      0.4,
      1.4,
      SESSION_NEXT_CARD_SCALE_DEFAULTS.sideSwipeRatio
    );
  }

  function interpolateNextCardProgress(distance, commitDistance, axis = 'horizontal') {
    const required = Math.max(1, Number(commitDistance) || 1);
    const safeDistance = Math.max(0, Number(distance) || 0);
    const isVertical = axis === 'vertical';
    const revealStartKey = isVertical ? 'revealStartFractionV' : 'revealStartFractionH';
    const revealEndKey = isVertical ? 'revealEndFractionV' : 'revealEndFractionH';
    const revealStartFallback = isVertical
      ? SESSION_NEXT_CARD_SCALE_DEFAULTS.revealStartFractionV
      : SESSION_NEXT_CARD_SCALE_DEFAULTS.revealStartFractionH;
    const revealEndFallback = isVertical
      ? SESSION_NEXT_CARD_SCALE_DEFAULTS.revealEndFractionV
      : SESSION_NEXT_CARD_SCALE_DEFAULTS.revealEndFractionH;
    const revealStartFraction = clampSessionScaleNumber(
      sessionNextCardScaleConfig[revealStartKey],
      0,
      0.95,
      revealStartFallback
    );
    const revealEndFractionRaw = clampSessionScaleNumber(
      sessionNextCardScaleConfig[revealEndKey],
      0.05,
      2,
      revealEndFallback
    );
    const revealEndFraction = Math.max(revealStartFraction + 0.01, revealEndFractionRaw);
    const revealStart = required * revealStartFraction;
    const revealEnd = required * revealEndFraction;
    if (safeDistance <= revealStart) return 0;
    const normalized = (safeDistance - revealStart) / Math.max(revealEnd - revealStart, 1);
    return clamp(normalized, 0, 1);
  }

  function computeNextCardProgress(result, absX, rawDy) {
    if (!result) return 0;
    const thresholds = getSwipeCommitThresholds();
    if (result === 'partial') {
      return interpolateNextCardProgress(Math.max(0, rawDy), thresholds.y, 'vertical');
    }
    return interpolateNextCardProgress(absX, thresholds.x, 'horizontal');
  }

  function getSwipeResult() {
    if (dy < 0 && Math.abs(dy) > UP_CANCEL_MIN_PX && Math.abs(dy) > Math.abs(dx) * UP_CANCEL_RATIO) return null;

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const sideSwipeRatio = getSideSwipeRatio();
    const thresholds = getSwipeCommitThresholds();
    const xT = thresholds.x;
    const yT = thresholds.y;

    const horizontalSwipe = absX > xT && (swipeIntent === 'horizontal' || absX >= absY * sideSwipeRatio);
    if (horizontalSwipe) {
      return dx < 0 ? 'correct' : 'wrong';
    }
    if (dy > yT && (swipeIntent === 'vertical' || absY >= absX)) return 'partial';
    return null;
  }

  function computeThresholdGlowIntensity(result, rawDx, rawDy) {
    const thresholds = getSwipeCommitThresholds();
    if (result === 'partial') {
      const distance = Math.max(0, Number(rawDy) || 0);
      const threshold = thresholds.y;
      if (distance <= threshold) return 0;
      const ramp = Math.max(threshold * 0.35, 26);
      return clamp((distance - threshold) / ramp, 0, 1);
    }
    const distance = Math.abs(Number(rawDx) || 0);
    const threshold = thresholds.x;
    if (distance <= threshold) return 0;
    const ramp = Math.max(threshold * 0.35, 24);
    return clamp((distance - threshold) / ramp, 0, 1);
  }

  function computeArcTransformFromAngle(angle) {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight + ARC_RADIUS;

    const arcX = cx + ARC_RADIUS * Math.sin(angle);
    const arcY = cy - ARC_RADIUS * Math.cos(angle);
    const baseArcY = cy - ARC_RADIUS;

    return {
      x: arcX - cardCenterX,
      y: arcY - baseArcY,
      rotate: angle * rotateLimit * 1.4
    };
  }

  function computeArcTransform(dx) {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight + ARC_RADIUS;

    const angle = clamp(dx / ARC_RADIUS, -0.6, 0.6);

    const arcX = cx + ARC_RADIUS * Math.sin(angle);
    const arcY = cy - ARC_RADIUS * Math.cos(angle);

    // 🔑 Referenz: Kreisposition bei angle = 0
    const baseArcY = cy - ARC_RADIUS;

    return {
      x: arcX - cardCenterX,
      y: arcY - baseArcY,          // ⭐ DAS ist der Fix
      rotate: angle * rotateLimit * 1.4
    };
  }

  card.addEventListener('touchstart', e => {
    if (card.dataset.type === 'mcq' || !session.active) return;
    if (!e.touches[0]) return;

    const startFace = e.target.closest?.('.face');
    const faceCanScroll =
      startFace && (startFace.scrollHeight - startFace.clientHeight > 2);

    // Track swipe state
    dragging = true;
    panActivated = false;
    swipeDecisionPending = faceCanScroll;
    swipeIntent = '';

    // Touch start position
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dx = 0;
    dy = 0;

    // 🔑 Capture card center at gesture start (single, consistent reference point)
    const rect = card.getBoundingClientRect();
    cardCenterX = rect.left + rect.width / 2;
    cardCenterY = rect.top + rect.height / 2;

    // Prepare for transform-based animation
    card.style.transition = 'none';
    card.style.willChange = 'transform';
    clearSwipeFeedback();
    setNextCardSwipeProgress(0, { immediate: true, dragging: true });
  }, { passive: true });

  card.addEventListener('touchmove', e => {
    if (!dragging || card.dataset.type === 'mcq') return;
    if (!e.touches[0]) return;

    dx = e.touches[0].clientX - startX;
    dy = e.touches[0].clientY - startY;
    const travel = Math.abs(dx) + Math.abs(dy);
    if (!panActivated) {
      if (travel < 8) return;
      panActivated = true;
    }

    // ⛔ Swipe nach oben sperren
    if (dy < -UP_CANCEL_MIN_PX && Math.abs(dy) > Math.abs(dx) * UP_CANCEL_RATIO) {
      resetSwipeDragState();
      return;
    }

    if (swipeDecisionPending) {
      if (Math.abs(dy) > Math.abs(dx) * 1.2) {
        resetSwipeDragState();
        return;
      }
      swipeDecisionPending = false;
    }

    if (Math.abs(dx) + Math.abs(dy) > 4) e.preventDefault();

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const sideSwipeRatio = getSideSwipeRatio();
    if (!swipeIntent) {
      if (absX >= 12 && absX >= absY * sideSwipeRatio) swipeIntent = 'horizontal';
      else if (dy > 0 && absY >= 12 && absY > absX * 1.1) swipeIntent = 'vertical';
    }

    let x = 0, y = 0, rotate = 0;
    let result = null;

    if (swipeIntent === 'horizontal' || absX >= absY * sideSwipeRatio) {
      const arc = computeArcTransform(dx);
      x = arc.x;
      y = arc.y;
      rotate = arc.rotate;

      result = dx < 0 ? 'correct' : 'wrong';
    } else if (dy > 0) {
      x = 0;
      y = dy;
      rotate = 0;

      result = 'partial';
    }

    setTransform(x, y, rotate);
    const thresholdResult = getSwipeResult();
    const glowIntensity = thresholdResult
      ? computeThresholdGlowIntensity(thresholdResult, dx, dy)
      : 0;
    applySwipeFeedback(thresholdResult, glowIntensity);
    setNextCardSwipeProgress(computeNextCardProgress(result, absX, dy), { dragging: true });
  }, { passive: false });

  const finishSwipe = () => {
    if (!dragging) return;
    if (!panActivated) {
      resetSwipeDragState();
      return;
    }
    dragging = false;
    swipeDecisionPending = false;

    const result = getSwipeResult();
    if (result) {
      card.style.transition = 'transform 240ms cubic-bezier(0.2,0.8,0.2,1)';
      applySwipeFeedback(result, 1);
      setNextCardSwipeProgress(1, { dragging: false });

      requestAnimationFrame(() => {
        if (result === 'partial') {
          setTransform(0, window.innerHeight * 1.1, 0);
        } else {
          const direction = dx < 0 ? -1 : 1;
          const angle = direction * ARC_COMMIT_ANGLE;
          const arc = computeArcTransformFromAngle(angle);
          setTransform(arc.x, arc.y, arc.rotate);
        }
      });

      setTimeout(() => gradeCard(result), 250);
      return;
    }

    setNextCardSwipeProgress(0, { dragging: false });
    card.style.transition = 'transform 380ms cubic-bezier(0.18,0.89,0.32,1.28)';
    requestAnimationFrame(() => setTransform(0, 0, 0));
    setTimeout(resetSwipeDragState, 390);
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
  if (window.innerWidth > 768) return false;
  if (document.body.classList.contains('sidebar-open')) return false;
  if (document.body.classList.contains('sidebar-hidden')) return false;
  if (isStudySessionVisible()) return false;
  const element = target instanceof Element ? target : target?.parentElement;
  if (element && element.closest('input, textarea, select, [contenteditable="true"], dialog[open], .flashcard')) {
    return false;
  }
  return true;
}

/**
 * @function canCloseSidebarBySwipe
 * @description Returns whether sidebar can close by swipe.
 */

function canCloseSidebarBySwipe(target = null) {
  if (!isCoarsePointerDevice()) return false;
  if (window.innerWidth > 768) return false;
  if (!document.body.classList.contains('sidebar-open')) return false;
  if (document.body.classList.contains('sidebar-hidden')) return false;
  const element = target instanceof Element ? target : target?.parentElement;
  if (!element || !element.closest('.sidebar')) return false;
  if (element.closest('input, textarea, select, [contenteditable="true"], dialog[open], .flashcard')) {
    return false;
  }
  return true;
}

/**
 * @function wireSidebarSwipeGesture
 * @description Wires sidebar swipe gesture.
 */

function wireSidebarSwipeGesture() {
  const edgeZone = 36;
  const verticalCancelThreshold = 28;
  const sidebarEl = document.querySelector('.sidebar');
  const mainEl = document.querySelector('.main');
  let gestureMode = '';
  let tracking = false;
  let startX = 0;
  let startY = 0;
  let startOffset = 0;
  let lastOffset = 0;
  let lastDx = 0;
  let movedHorizontally = false;

  const clearDragStyles = () => {
    if (sidebarEl) {
      sidebarEl.style.removeProperty('transition');
      sidebarEl.style.removeProperty('transform');
    }
    if (mainEl) {
      mainEl.style.removeProperty('transition');
      mainEl.style.removeProperty('transform');
    }
  };

  const getRevealWidth = () => {
    if (!sidebarEl) return 0;
    return Math.max(0, sidebarEl.getBoundingClientRect().width);
  };

  const applyDragOffset = offsetPx => {
    if (!sidebarEl || !mainEl) return Number.NaN;
    const revealWidth = getRevealWidth();
    if (revealWidth <= 0) return Number.NaN;
    const clamped = Math.max(0, Math.min(revealWidth, Number(offsetPx) || 0));
    sidebarEl.style.transition = 'none';
    mainEl.style.transition = 'none';
    sidebarEl.style.transform = `translateX(${clamped - revealWidth}px)`;
    mainEl.style.transform = `translateX(${clamped}px)`;
    return clamped;
  };

  const resetTracking = (clearDrag = true) => {
    gestureMode = '';
    tracking = false;
    startX = 0;
    startY = 0;
    startOffset = 0;
    lastOffset = 0;
    lastDx = 0;
    movedHorizontally = false;
    if (clearDrag) clearDragStyles();
  };

  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    if (!touch) return;
    if (canOpenSidebarBySwipe(e.target)) {
      if (touch.clientX > edgeZone) return;
      gestureMode = 'open';
      startOffset = 0;
    } else if (canCloseSidebarBySwipe(e.target)) {
      gestureMode = 'close';
      startOffset = getRevealWidth();
      if (startOffset <= 0) return;
    } else {
      return;
    }
    tracking = true;
    startX = touch.clientX;
    startY = touch.clientY;
    lastOffset = startOffset;
    lastDx = 0;
    movedHorizontally = false;
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
    if (Math.abs(dx) > Math.abs(dy)) {
      const isOpenGesture = gestureMode === 'open' && dx > 0;
      const isCloseGesture = gestureMode === 'close' && dx < 0;
      if (!isOpenGesture && !isCloseGesture) return;
      movedHorizontally = true;
      lastDx = dx;
      const nextOffset = applyDragOffset(startOffset + dx);
      if (Number.isFinite(nextOffset)) lastOffset = nextOffset;
      e.preventDefault();
    }
  }, { passive: false });

  document.addEventListener('touchend', e => {
    if (!tracking) return;
    const touch = e.changedTouches?.[0];
    const dx = touch ? touch.clientX - startX : lastDx;
    const dy = touch ? touch.clientY - startY : 0;
    const horizontalSwipe = movedHorizontally || Math.abs(dx) > Math.abs(dy);
    if (gestureMode === 'open' && horizontalSwipe && dx > 0) {
      document.body.classList.add('sidebar-open');
      triggerHaptic('light');
    } else if (gestureMode === 'close' && horizontalSwipe && dx < 0) {
      document.body.classList.remove('sidebar-open');
      triggerHaptic('light');
    } else if (gestureMode === 'open' && lastOffset <= 0) {
      document.body.classList.remove('sidebar-open');
    } else if (gestureMode === 'close' && lastOffset > 0) {
      document.body.classList.add('sidebar-open');
    }
    resetTracking();
  }, { passive: true });

  document.addEventListener('touchcancel', () => resetTracking(), { passive: true });
}

// ============================================================================
