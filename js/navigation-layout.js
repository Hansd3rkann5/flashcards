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
  const track = el('track');
  if (!track) return;
  const previousStep = Number.isFinite(Number(currentView)) ? Number(currentView) : 0;
  const panelCount = Math.max(1, track.querySelectorAll(':scope > .panel').length || 1);
  const safeStep = Math.max(0, Math.min(panelCount - 1, Number.isFinite(Number(step)) ? Number(step) : 0));
  const shouldJumpWithoutSlide = safeStep === 4 || previousStep === 4;
  document.body.classList.toggle('exchange-only-view', safeStep === 4);
  if (shouldJumpWithoutSlide) track.classList.add('view-jump');
  currentView = safeStep;
  track.style.transform = `translateX(${-100 * safeStep / panelCount}%)`;
  if (shouldJumpWithoutSlide) {
    // Keep transition disabled for one painted frame so the browser cannot animate
    // through intermediate panels when entering/leaving exchange view.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        track.classList.remove('view-jump');
      });
    });
  }
  if (safeStep !== 3) {
    document.querySelector('#editorPanel .editor-shell')?.classList.remove('sidebar-open');
  }
  if (safeStep !== 4) {
    document.body.classList.remove('content-exchange-open');
  }
  syncSidebarHiddenState(safeStep);
}

// ============================================================================
