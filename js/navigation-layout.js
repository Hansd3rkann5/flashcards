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
  currentView = step;
  el('track').style.transform = `translateX(${-100 * step / 4}%)`;
  if (step !== 3) {
    document.querySelector('#editorPanel .editor-shell')?.classList.remove('sidebar-open');
  }
  syncSidebarHiddenState(step);
}

// ============================================================================
