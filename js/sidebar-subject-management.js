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
      clearSessionSizeManualOverride();
      setTopicSelectionMode(false);
      applySubjectTheme(s.accent || '#2dd4bf');
      loadTopics();
      setView(1);
      document.body.classList.remove('sidebar-open');
    };
    const menuBtn = chip.querySelector('.tile-menu-btn');
    if (menuBtn) {
      menuBtn.dataset.subjectId = String(s?.id || '').trim();
      menuBtn.onclick = async e => {
        e.stopPropagation();
        const subjectId = String(menuBtn.dataset.subjectId || s?.id || '').trim();
        if (!subjectId) return;
        let subject = subjectDirectoryById.get(subjectId) || null;
        if (!subject) {
          subject = await getById('subjects', subjectId, { uiBlocking: false, loadingLabel: '' });
        }
        if (!subject) return;
        editingSubjectId = subjectId;
        el('editSubjectName').value = String(subject?.name || '').trim();
        el('editSubjectColor').value = subject?.accent || '#2dd4bf';
        const editExamDateInput = el('editSubjectExamDate');
        if (editExamDateInput) {
          editExamDateInput.value = formatSubjectExamDateForInput(subject?.examDate);
        }
        const editExcludeInput = el('editSubjectExcludeFromReview');
        if (editExcludeInput) {
          editExcludeInput.checked = subject?.excludeFromReview === true;
        }
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
  bindImageElementSource(img, src);
  img.alt = alt;
  img.className = 'session-card-image';
  img.addEventListener('load', () => {
    queueSessionFaceOverflowSync();
    if (typeof queueNextSessionFaceOverflowSync === 'function') {
      queueNextSessionFaceOverflowSync();
    }
  });
  img.addEventListener('click', async e => {
    e.stopPropagation();
    const preferred = String(img.currentSrc || img.src || '').trim();
    if (preferred) {
      openStudyImageLightbox(preferred);
      return;
    }
    const raw = String(img.dataset.imageSource || src || '').trim();
    if (!raw) return;
    try {
      const resolved = await resolveImageSourceForDisplay(raw);
      if (!resolved) return;
      openStudyImageLightbox(resolved);
    } catch (_) {
      // Keep click best-effort when source resolution fails.
    }
  });
  return img;
}
