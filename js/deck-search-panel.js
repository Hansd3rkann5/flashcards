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
  const selectAllBulkBtn = el('selectAllBulkTopicsBtn');
  const moveBtn = el('moveSelectedTopicsBtn');
  const deleteBtn = el('deleteSelectedTopicsBtn');
  const hasSelection = topicSelectedIds.size > 0;
  const topicIds = Array.isArray(currentSubjectTopicIds) ? currentSubjectTopicIds : [];
  const allSelected = topicIds.length > 0 && topicIds.every(topicId => topicSelectedIds.has(topicId));

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
  if (selectAllBulkBtn) {
    selectAllBulkBtn.disabled = !topicSelectionMode || topicIds.length === 0;
    selectAllBulkBtn.classList.toggle('active', allSelected);
    selectAllBulkBtn.setAttribute('aria-pressed', allSelected ? 'true' : 'false');
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
 * @function toggleAllTopicsForBulk
 * @description Toggles all topics in topic bulk-selection mode.
 */

function toggleAllTopicsForBulk() {
  if (!topicSelectionMode) return;
  const topicIds = Array.isArray(currentSubjectTopicIds) ? currentSubjectTopicIds : [];
  if (!topicIds.length) {
    updateTopicSelectionUi();
    return;
  }

  const allSelected = topicIds.every(topicId => topicSelectedIds.has(topicId));
  topicSelectedIds = allSelected ? new Set() : new Set(topicIds);

  const topicList = el('topicList');
  if (topicList) {
    const rows = topicList.querySelectorAll('.tile.topic-tile.selection-mode');
    rows.forEach(row => {
      const topicId = String(row.dataset.topicId || '').trim();
      const selected = topicId && topicSelectedIds.has(topicId);
      row.classList.toggle('selected-for-bulk', !!selected);
      const checkbox = row.querySelector('.card-select-control input[type=\"checkbox\"]');
      if (checkbox) checkbox.checked = !!selected;
    });
  }

  updateTopicSelectionUi();
}

/**
 * @function updateSelectAllSessionTopicsButton
 * @description Updates state of the "All" topic button in the topic list header.
 */

function updateSelectAllSessionTopicsButton(topics = null) {
  const btn = el('selectAllSessionTopicsBtn');
  if (!btn) return;
  const topicList = Array.isArray(topics) ? topics : currentSubjectTopics;
  if (!topicList.length) {
    btn.disabled = true;
    btn.classList.remove('active');
    btn.setAttribute('aria-pressed', 'false');
    return;
  }
  const allSelected = topicList.every(topic => selectedTopicIds.has(topic.id));
  btn.disabled = false;
  btn.classList.toggle('active', allSelected);
  btn.setAttribute('aria-pressed', allSelected ? 'true' : 'false');
}

/**
 * @function selectAllTopicsForSession
 * @description Toggles all topics of the current subject for study-session selection.
 */

async function selectAllTopicsForSession() {
  if (!selectedSubject) return;
  const topics = currentSubjectTopics.length
    ? currentSubjectTopics
    : await getTopicsBySubject(selectedSubject.id, { includeCounts: true, uiBlocking: false });
  if (!topics.length) {
    updateSelectAllSessionTopicsButton(topics);
    return;
  }

  currentSubjectTopics = topics;
  currentSubjectTopicsSubjectId = String(selectedSubject?.id || '').trim();
  currentSubjectTopicIds = topics.map(topic => topic.id);
  const allSelected = topics.every(topic => selectedTopicIds.has(topic.id));
  selectedTopicIds = allSelected ? new Set() : new Set(currentSubjectTopicIds);

  const topicList = el('topicList');
  if (topicList) {
    const rows = topicList.querySelectorAll('.tile.topic-tile');
    rows.forEach(row => {
      const checkbox = row.querySelector('input[type=\"checkbox\"][data-topic-id]');
      if (!checkbox) return;
      const topicId = String(checkbox.getAttribute('data-topic-id') || '').trim();
      const isSelected = topicId && selectedTopicIds.has(topicId);
      checkbox.checked = !!isSelected;
      row.classList.toggle('selected', !!isSelected);
    });
  }

  updateSelectAllSessionTopicsButton(topics);
  await refreshTopicSessionMeta(topics);
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

  try {
    const sourceSubjectId = selectedSubject?.id || '';
    const targetTopic = await getById('topics', targetTopicId);
    if (!targetTopic) {
      alert('Das Ziel-Topic konnte nicht geladen werden.');
      return;
    }
    const targetSubjectId = String(targetTopic.subjectId || '').trim();

    // Always resolve selected cards by ID, not via the currently open topic list.
    const selectedCards = await getCardsByCardIds(ids, {
      force: true,
      payloadLabel: `bulk-move-${ids.length}`
    });
    if (!selectedCards.length) {
      alert('Die ausgewaehlten Karten konnten nicht geladen werden. Bitte Seite neu laden und erneut versuchen.');
      return;
    }

    const loadedCardIds = new Set(
      selectedCards.map(card => String(card?.id || '').trim()).filter(Boolean)
    );
    const missingCount = ids.filter(id => !loadedCardIds.has(String(id || '').trim())).length;
    let movedCount = 0;

    for (const card of selectedCards) {
      if (card.topicId === targetTopicId) continue;
      const updated = { ...card, topicId: targetTopicId };
      await put('cards', updated);
      await putCardBank(updated);
      syncSessionCard(updated);
      movedCount += 1;
    }

    if (!movedCount) {
      const msg = missingCount
        ? `Es wurden keine Karten verschoben (${missingCount} Karten konnten nicht geladen werden).`
        : 'Es wurden keine Karten verschoben.';
      alert(msg);
      return;
    }

    if (sourceSubjectId) await touchSubject(sourceSubjectId);
    if (targetSubjectId && targetSubjectId !== sourceSubjectId) await touchSubject(targetSubjectId);
    closeDialog(el('moveCardsDialog'));
    setDeckSelectionMode(false);
    await loadDeck();
    await loadEditorCards();
    await refreshSidebar();
    if (selectedSubject) await refreshTopicSessionMeta();
  } catch (err) {
    console.error('moveSelectedDeckCards failed:', err);
    alert(`Verschieben fehlgeschlagen: ${err?.message || err}`);
  }
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
  return normalizeSearchText(value);
}

/**
 * @function normalizeSearchText
 * @description Normalizes searchable text (lowercase, accent-insensitive, collapsed whitespace).
 */

function normalizeSearchText(value = '') {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * @function getCardSearchHaystack
 * @description Returns the card search haystack.
 */

function getCardSearchHaystack(card) {
  const optionText = Array.isArray(card?.options)
    ? card.options.map(option => option?.text || '').join('\n')
    : '';
  return normalizeSearchText(`${card?.prompt || ''}\n${card?.answer || ''}\n${optionText}`);
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
 * @function setTopicSearchLoading
 * @description Renders/removes an inline loader inside the search dialog results area.
 */

function setTopicSearchLoading(active = false, label = 'Searching cards...') {
  const results = el('topicSearchResults');
  if (!results) return;
  if (!active) {
    results.classList.remove('is-loading');
    return;
  }
  results.classList.add('is-loading');
  results.innerHTML = '';
  const loaderWrap = document.createElement('div');
  loaderWrap.className = 'topic-search-loader-wrap';
  loaderWrap.setAttribute('role', 'status');
  loaderWrap.setAttribute('aria-live', 'polite');
  loaderWrap.innerHTML = `
    <div class="app-loader-stack" aria-hidden="true">
      <span class="app-loader-card card-one"></span>
      <span class="app-loader-card card-two"></span>
      <span class="app-loader-card card-three"></span>
    </div>
    <div class="tiny">${escapeHTML(String(label || '').trim() || 'Searching cards...')}</div>
  `;
  results.appendChild(loaderWrap);
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
 * @function renderTopicSearchMatches
 * @description Renders topic-search cards and summary text.
 */

function renderTopicSearchMatches(resultsEl, matches = [], topicNameById = {}) {
  const results = resultsEl || el('topicSearchResults');
  if (!results) return;
  const rows = Array.isArray(matches) ? matches : [];
  results.classList.remove('is-loading');
  results.innerHTML = '';
  if (!rows.length) {
    results.innerHTML = '<div class="tiny">No matching cards found.</div>';
    setTopicSearchMetaText('0 cards found.');
    return;
  }
  rows.forEach(card => {
    const topicName = topicNameById?.[card.topicId] || 'Unknown topic';
    results.appendChild(buildTopicSearchResultCard(card, topicName));
  });
  const cardWord = rows.length === 1 ? 'card' : 'cards';
  setTopicSearchMetaText(`${rows.length} ${cardWord} found.`);
}

/**
 * @function loadLocalTopicSearchMatches
 * @description Fallback search using local/cached full cards when DB-side text search fails.
 */

async function loadLocalTopicSearchMatches(topicIds = [], normalizedQuery = '', options = {}) {
  const ids = Array.isArray(topicIds) ? topicIds : [];
  const query = String(normalizedQuery || '').trim();
  if (!ids.length || !query) return [];
  const opts = (options && typeof options === 'object') ? options : {};
  const byId = new Map();
  for (const topicId of ids) {
    try {
      const topicCards = await getCardsByTopicIds([topicId], {
        uiBlocking: false,
        payloadLabel: `topic-search-fallback-${topicId}`,
        force: !!opts.force
      });
      topicCards.forEach(card => {
        const key = String(card?.id || '').trim();
        if (!key) return;
        byId.set(key, card);
      });
    } catch (err) {
      // Keep fallback best-effort per topic; one failing topic should not fail whole search.
      console.warn('Topic search fallback failed for topic:', topicId, err);
    }
  }
  const cards = Array.from(byId.values());
  const matches = cards.filter(card => getCardSearchHaystack(card).includes(query));
  matches.sort((a, b) => getCardCreatedAt(b) - getCardCreatedAt(a));
  return matches;
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
  const searchRunId = ++topicSearchRunId;

  const rawQuery = String(input.value || '').trim();
  const query = normalizeTopicSearchQuery(rawQuery);
  const topics = currentSubjectTopics.length
    ? currentSubjectTopics
    : await getTopicsBySubject(selectedSubject.id, { uiBlocking: false });
  if (searchRunId !== topicSearchRunId) return;
  const topicNameById = Object.fromEntries(topics.map(topic => [topic.id, topic.name]));
  const topicIds = new Set(topics.map(topic => topic.id));

  if (!rawQuery || !query) {
    setTopicSearchLoading(false);
    results.innerHTML = '<div class="tiny">Enter text to search cards in this subject.</div>';
    setTopicSearchMetaText(`Search in ${topics.length} ${topics.length === 1 ? 'topic' : 'topics'}.`);
    return;
  }

  setTopicSearchLoading(true, 'Searching cards...');
  setTopicSearchMetaText('Searching...');

  const topicIdList = [...topicIds];
  try {
    const cardRefs = await searchCardRefsByTopicIds(topicIdList, rawQuery, {
      uiBlocking: false,
      payloadLabel: 'topic-search-refs'
    });
    if (searchRunId !== topicSearchRunId) return;
    const cardIds = cardRefs
      .map(ref => String(ref?.id || '').trim())
      .filter(Boolean);

    if (!cardIds.length) {
      results.classList.remove('is-loading');
      results.innerHTML = '<div class="tiny">No matching cards found.</div>';
      setTopicSearchMetaText('0 cards found.');
      return;
    }

    let cards = [];
    try {
      cards = await getCardsByCardIds(cardIds, {
        uiBlocking: false,
        payloadLabel: 'topic-search-cards-by-id'
      });
    } catch (cardsErr) {
      // Fall back to local/cached topic cards when loading matched IDs fails.
      console.warn('Topic search card-id fetch failed, using local fallback.', cardsErr);
      cards = await loadLocalTopicSearchMatches(topicIdList, query);
    }
    if (searchRunId !== topicSearchRunId) return;
    const matches = cards.filter(card => topicIds.has(String(card?.topicId || '').trim()));
    matches.sort((a, b) => getCardCreatedAt(b) - getCardCreatedAt(a));
    renderTopicSearchMatches(results, matches, topicNameById);
  } catch (err) {
    if (searchRunId !== topicSearchRunId) return;
    // Final fallback path: full local/cached search per selected topic.
    const fallbackMatches = await loadLocalTopicSearchMatches(topicIdList, query);
    if (searchRunId !== topicSearchRunId) return;
    renderTopicSearchMatches(results, fallbackMatches, topicNameById);
    if (!fallbackMatches.length) {
      setTopicSearchMetaText('0 cards found.');
    }
    console.warn('Topic search used local fallback due to backend search error:', err);
  }
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
  topicSearchRunId += 1;
  const dialog = el('topicSearchDialog');
  const input = el('topicSearchInput');
  const results = el('topicSearchResults');
  if (!dialog || !input || !results) return;
  input.value = '';
  results.classList.remove('is-loading');
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
