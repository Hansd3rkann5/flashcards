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
    if (dbReady && !sessionSizeModelRemoteReady) {
      await ensureSessionSizeModelLoadedFromServer({ uiBlocking: false });
    }
    if (refreshRunId !== sessionMetaRefreshRunId) return;
    if (!selectedSubject || String(selectedSubject.id || '').trim() !== refreshSubjectId) return;

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
    if (sessionSizeManualOverride && sessionSizeManualOverrideSubjectId !== refreshSubjectId) {
      clearSessionSizeManualOverride();
    }
    if (availableSessionCards <= 0) {
      sessionSize = 0;
    } else {
      const suggested = getSuggestedSessionSizeForSubject(refreshSubjectId);
      if (!sessionSizeManualOverride || sessionSize <= 0) {
        sessionSize = Math.min(Math.max(suggested, 1), availableSessionCards);
      } else {
        sessionSize = Math.min(Math.max(sessionSize, 1), availableSessionCards);
      }
    }
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
  setDeckTitle(selectedTopic.name);
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
  if (typeof maybeOpenEditorIntro === 'function') maybeOpenEditorIntro();
}

/**
 * @function loadTopics
 * @description Loads and renders topics for the active subject including selection and bulk actions.
 */

async function loadTopics(options = {}) {
  if (!selectedSubject) return;
  const opts = (options && typeof options === 'object') ? options : {};
  const subjectId = String(selectedSubject.id || '').trim();
  if (!subjectId) return;
  const uiBlocking = opts.uiBlocking === undefined ? true : !!opts.uiBlocking;
  const force = !!opts.force;
  const preferCached = !!opts.preferCached;
  topicPrefetchRunId += 1;
  el('topicTitle').textContent = selectedSubject.name;
  applySubjectTheme(selectedSubject.accent || '#2dd4bf');
  let topics = [];
  const canUseSubjectCache = preferCached
    && !force
    && currentSubjectTopicsSubjectId === subjectId
    && Array.isArray(currentSubjectTopics);
  if (canUseSubjectCache) {
    topics = cloneData(currentSubjectTopics);
  } else {
    topics = await getTopicsBySubject(subjectId, { includeCounts: true, force, uiBlocking });
  }
  // Subject may have changed while data was loading in the background.
  if (!selectedSubject || String(selectedSubject.id || '').trim() !== subjectId) return;

  const topicListTitle = el('topicListTitle');
  const topicListTotalCards = el('topicListTotalCards');
  currentSubjectTopics = topics;
  currentSubjectTopicsSubjectId = subjectId;
  const totalCardsInSubject = topics.reduce((sum, topic) => {
    const count = Number(topic?.cardCount);
    return sum + (Number.isFinite(count) ? count : 0);
  }, 0);
  if (topicListTitle) topicListTitle.textContent = topics.length === 1 ? 'Topic' : 'Topics';
  if (topicListTotalCards) {
    topicListTotalCards.textContent = `${totalCardsInSubject} ${totalCardsInSubject === 1 ? 'card' : 'cards'}`;
  }
  currentSubjectTopicIds = topics.map(topic => topic.id);
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
    row.dataset.topicId = String(t.id || '');
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
        updateSelectAllSessionTopicsButton(topics);
        await refreshTopicSessionMeta(topics);
      });
    }
    list.appendChild(row);
  });
  if (!topics.length) list.innerHTML = '<div class="tiny">No topics yet.</div>';
  updateTopicSelectionUi();
  updateSelectAllSessionTopicsButton(topics);
  if (opts.skipSessionMeta !== true) {
    await refreshTopicSessionMeta(topics);
  }
  if (topics.length && opts.prefetch !== false) {
    void prefetchSubjectTopicCards(topics, selectedSubject.id);
  }
}

// ============================================================================
